/* =========================================
   MyMaple v6 — 창팝 순위 (Changpop Ranking)
   - YouTube Data API v3 를 호출해 플레이리스트 항목을 가져옴
   - 설정 파일: MyMaple_PageInfo/Special_Image/Changpop_Info/ChangpopConfig.json
       { playlistId, youtubeApiKey, maxResults, cacheMinutes }
   - 표시 항목: 순위 / 썸네일 / 제목 / 재생시간 / 조회수 / 좋아요
   - 캐시: localStorage (cacheMinutes 동안)
   ========================================= */

(function () {
    const C = window.MyMapleCommon;
    const D = window.MyMapleData;
    const escapeHtml = C.escapeHtml;

    const CONFIG_URL = 'MyMaple_PageInfo/Special_Image/Changpop_Info/ChangpopConfig.json';
    const STATS_URL = 'PageInfo_Update Data/Changpop_Info/ChangpopRecent30Stats.json';
    const CACHE_KEY = 'mymaple.changpop.cache.v3';
        const DEFAULT_SORT = 'recent30';
    const DEFAULT_PERIOD_DAYS = 30;

    const els = {
        list: document.getElementById('changpop-list'),
        count: document.getElementById('changpop-count'),
        updated: document.getElementById('changpop-updated'),
        sortTabs: document.getElementById('changpop-sort-tabs'),
        periodTabs: document.getElementById('changpop-period-tabs'),
        // 신청
        submitOpen: document.getElementById('changpop-submit-open'),
        modal: document.getElementById('changpop-modal'),
        form: document.getElementById('changpop-form'),
        inputUrl: document.getElementById('changpop-input-url'),
        inputNick: document.getElementById('changpop-input-nick'),
        inputMessage: document.getElementById('changpop-input-message'),
        formMessage: document.getElementById('changpop-form-message'),
        formSubmit: document.getElementById('changpop-form-submit'),
        preview: document.getElementById('changpop-preview'),
        previewThumb: document.getElementById('changpop-preview-thumb'),
        previewTitle: document.getElementById('changpop-preview-title'),
        previewMeta: document.getElementById('changpop-preview-meta')
    };

    // 현재 순위 리스트의 videoId 스냅샷 (중복 검사용)
    const state = {
        liveVideoIds: new Set(),
        items: [],           // 마지막으로 받아온 플레이리스트 항목 (현재 순위)
        stats: null,         // ChangpopRecent30Stats.json 데이터
        sort: DEFAULT_SORT,   // 'recent30' | 'views' | 'new'
        periodDays: DEFAULT_PERIOD_DAYS,
        apiKey: '',
        previewData: null,
        previewSeq: 0,
        isSubmitting: false
    };

    function mountHeader() {
        const mount = document.getElementById('header-mount');
        if (!mount) return;
        mount.innerHTML = C.renderSiteHeader('changpop', C.getInfoNavItems());
        C.bindHeaderOfflineLinks();
    }

    function renderMessage(msg, isError) {
        els.list.innerHTML = `<li class="music-empty ${isError ? 'is-error' : ''}">${escapeHtml(msg)}</li>`;
        els.count.textContent = '0 곡';
    }

    function renderLoading(msg) {
        els.list.innerHTML = `<li class="music-empty"><div class="spinner"></div>${escapeHtml(msg || '창팝 목록을 불러오는 중...')}</li>`;
    }

    /* ---------------- 공통 헬퍼 ---------------- */

    // ISO8601 (PT#H#M#S) → "h:mm:ss" 또는 "m:ss"
    function formatDuration(iso) {
        if (!iso || typeof iso !== 'string') return '';
        const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
        if (!m) return '';
        const h = parseInt(m[1] || '0', 10);
        const mm = parseInt(m[2] || '0', 10);
        const ss = parseInt(m[3] || '0', 10);
        const pad = (n) => String(n).padStart(2, '0');
        return h > 0
            ? `${h}:${pad(mm)}:${pad(ss)}`
            : `${mm}:${pad(ss)}`;
    }

    function formatViews(n) {
        const v = Number(n);
        if (!Number.isFinite(v) || v < 0) return '-';
        if (v >= 100000000) return (v / 100000000).toFixed(1).replace(/\.0$/, '') + '억';
        if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, '') + '만';
        if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + '천';
        return String(v);
    }

    function formatUpdated(ts) {
        const d = new Date(ts);
        if (Number.isNaN(d.getTime())) return '';
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const HH = String(d.getHours()).padStart(2, '0');
        const MM = String(d.getMinutes()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd} ${HH}:${MM} 갱신`;
    }


    function parseDateKeyUtc(dateKey) {
        if (!dateKey || typeof dateKey !== 'string') return NaN;
        return Date.parse(`${dateKey}T00:00:00Z`);
    }

    function getMonthlyWeights() {
        return {
            viewWeight: 0.01,
            likeWeight: Number(state.stats?.weights?.likeDelta ?? 20)
        };
    }

    function computeWindowMetrics(history, days, offsetDays, viewWeight, likeWeight) {
        const normalized = (Array.isArray(history) ? history : [])
            .map(entry => ({
                date: entry?.date || '',
                ts: parseDateKeyUtc(entry?.date || ''),
                viewCount: Number(entry?.viewCount || 0),
                likeCount: Number(entry?.likeCount || 0)
            }))
            .filter(entry => Number.isFinite(entry.ts))
            .sort((a, b) => a.ts - b.ts);
        if (!normalized.length) {
            return {
                hasData: false,
                from: null,
                to: null,
                coverageDays: 0,
                viewDelta: 0,
                likeDelta: 0,
                score: 0
            };
        }
        const latestTs = normalized[normalized.length - 1].ts;
        const endTs = latestTs - (offsetDays * 86400000);
        const startTs = endTs - ((days - 1) * 86400000);
        const window = normalized.filter(entry => entry.ts >= startTs && entry.ts <= endTs);
        if (!window.length) {
            return {
                hasData: false,
                from: null,
                to: null,
                coverageDays: 0,
                viewDelta: 0,
                likeDelta: 0,
                score: 0
            };
        }
        const first = window[0];
        const last = window[window.length - 1];
        const viewDelta = Math.max(0, (last.viewCount || 0) - (first.viewCount || 0));
        const likeDelta = Math.max(0, (last.likeCount || 0) - (first.likeCount || 0));
        const score = (viewDelta * viewWeight) + (likeDelta * likeWeight);
        const coverageDays = Math.max(1, Math.round((last.ts - first.ts) / 86400000) + 1);
        return {
            hasData: true,
            from: first.date,
            to: last.date,
            coverageDays,
            viewDelta,
            likeDelta,
            score
        };
    }

    function formatIsoDateLabel(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    function formatDaysAgo(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        const diffMs = Date.now() - d.getTime();
        const diffDays = Math.max(0, Math.floor(diffMs / 86400000));
        if (diffDays === 0) return '오늘';
        if (diffDays === 1) return '1일 전';
        return `${diffDays}일 전`;
    }


    function setPreviewState(kind, payload) {
        if (!els.preview) return;
        if (kind === 'hidden') {
            els.preview.hidden = true;
            state.previewData = null;
            return;
        }
        els.preview.hidden = false;
        els.preview.classList.remove('is-loading', 'is-error');
        if (kind === 'loading') {
            els.preview.classList.add('is-loading');
            if (els.previewTitle) els.previewTitle.textContent = '영상 정보를 불러오는 중...';
            if (els.previewMeta) els.previewMeta.textContent = '유튜브 메타데이터 조회 중';
            if (els.previewThumb) els.previewThumb.removeAttribute('src');
            state.previewData = null;
            return;
        }
        if (kind === 'error') {
            els.preview.classList.add('is-error');
            if (els.previewTitle) els.previewTitle.textContent = payload || '영상 정보를 불러오지 못했습니다.';
            if (els.previewMeta) els.previewMeta.textContent = '링크는 저장되지만, 미리보기 정보가 비어 있을 수 있습니다.';
            if (els.previewThumb) els.previewThumb.removeAttribute('src');
            state.previewData = null;
            return;
        }
        const data = payload || {};
        if (els.previewTitle) els.previewTitle.textContent = data.title || '제목 없음';
        if (els.previewMeta) {
            const bits = [];
            if (data.channelTitle) bits.push(data.channelTitle);
            const dateText = formatIsoDateLabel(data.publishedAt || '');
            if (dateText) bits.push(`${dateText} 업로드`);
            const durationText = formatDuration(data.duration || '');
            if (durationText) bits.push(durationText);
            els.previewMeta.textContent = bits.join(' · ');
        }
        if (els.previewThumb) {
            if (data.thumbnail) {
                els.previewThumb.src = data.thumbnail;
            } else {
                els.previewThumb.removeAttribute('src');
            }
        }
        state.previewData = data;
    }

    async function fetchSubmissionPreview(videoId) {
        if (!videoId || !state.apiKey) return null;
        const url = new URL('https://www.googleapis.com/youtube/v3/videos');
        url.searchParams.set('part', 'snippet,contentDetails');
        url.searchParams.set('id', videoId);
        url.searchParams.set('key', state.apiKey);
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`preview HTTP ${res.status}`);
        const json = await res.json();
        const item = (json.items || [])[0];
        if (!item) return null;
        const sn = item.snippet || {};
        const thumbs = sn.thumbnails || {};
        const thumb = thumbs.medium || thumbs.high || thumbs.default || {};
        return {
            videoId,
            title: sn.title || '',
            channelTitle: sn.channelTitle || '',
            thumbnail: thumb.url || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
            publishedAt: sn.publishedAt || '',
            duration: item.contentDetails?.duration || ''
        };
    }

    function schedulePreviewLookup() {
        const rawUrl = els.inputUrl ? els.inputUrl.value : '';
        const videoId = extractVideoId(rawUrl);
        if (!rawUrl.trim()) {
            setPreviewState('hidden');
            return;
        }
        if (!videoId) {
            setPreviewState('error', '올바른 유튜브 링크 형식이 아닙니다.');
            return;
        }
        const seq = ++state.previewSeq;
        setPreviewState('loading');
        fetchSubmissionPreview(videoId)
            .then((data) => {
                if (seq !== state.previewSeq) return;
                if (!data) {
                    setPreviewState('error', '영상 정보를 찾지 못했습니다.');
                    return;
                }
                setPreviewState('ready', data);
            })
            .catch(() => {
                if (seq !== state.previewSeq) return;
                setPreviewState('error', '영상 정보를 불러오지 못했습니다.');
            });
    }

    /* ---------------- 설정 / 캐시 ---------------- */

    async function loadConfig() {
        let data = null;
        try {
            if (D && typeof D.fetchJSON === 'function') {
                data = await D.fetchJSON(CONFIG_URL);
            }
        } catch (e) { /* fallthrough */ }
        if (!data) {
            try {
                const res = await fetch(CONFIG_URL, { cache: 'no-cache' });
                if (res.ok) {
                    const text = await res.text();
                    data = JSON.parse(text.replace(/^\uFEFF/, ''));
                }
            } catch (e) { /* ignore */ }
        }
        return data || {};
    }

    function readCache(playlistId) {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            if (!obj || obj.playlistId !== playlistId) return null;
            return obj;
        } catch (e) {
            return null;
        }
    }

    function writeCache(playlistId, items) {
        try {
            const obj = {
                playlistId,
                fetchedAt: Date.now(),
                items
            };
            localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
        } catch (e) { /* quota / disabled */ }
    }

    /* ---------------- YouTube API 호출 ---------------- */

    async function fetchPlaylistItems(playlistId, apiKey, maxResults) {
        const items = [];
        let pageToken = '';
        let safety = 0;

        while (safety < 10) {
            safety += 1;
            const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
            url.searchParams.set('part', 'snippet,contentDetails');
            url.searchParams.set('maxResults', '50');
            url.searchParams.set('playlistId', playlistId);
            url.searchParams.set('key', apiKey);
            if (pageToken) url.searchParams.set('pageToken', pageToken);

            const res = await fetch(url.toString());
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(`playlistItems HTTP ${res.status} ${errText.slice(0, 200)}`);
            }
            const json = await res.json();
            (json.items || []).forEach(it => {
                const sn = it.snippet || {};
                const cd = it.contentDetails || {};
                const videoId = cd.videoId || (sn.resourceId && sn.resourceId.videoId);
                if (!videoId) return;
                if (sn.title === 'Private video' || sn.title === 'Deleted video') return;
                const thumbs = (sn.thumbnails || {});
                const thumb = thumbs.medium || thumbs.high || thumbs.default || {};
                items.push({
                    videoId,
                    title: sn.title || '',
                    position: typeof sn.position === 'number' ? sn.position : items.length,
                    thumbnail: thumb.url || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
                    channelTitle: sn.videoOwnerChannelTitle || sn.channelTitle || '',
                    playlistPublishedAt: sn.publishedAt || '',
                    videoPublishedAt: cd.videoPublishedAt || ''
                });
            });

            pageToken = json.nextPageToken || '';
            if (!pageToken) break;
            if (items.length >= maxResults) break;
        }

        const limited = items.slice(0, maxResults);
        if (!limited.length) return [];

        // videos.list 로 duration + viewCount + likeCount 채우기 (최대 50개씩)
        const idChunks = [];
        for (let i = 0; i < limited.length; i += 50) {
            idChunks.push(limited.slice(i, i + 50));
        }
        const detailsMap = new Map();
        for (const chunk of idChunks) {
            const ids = chunk.map(x => x.videoId).join(',');
            const url = new URL('https://www.googleapis.com/youtube/v3/videos');
            url.searchParams.set('part', 'snippet,contentDetails,statistics');
            url.searchParams.set('id', ids);
            url.searchParams.set('key', apiKey);
            const res = await fetch(url.toString());
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(`videos HTTP ${res.status} ${errText.slice(0, 200)}`);
            }
            const json = await res.json();
            (json.items || []).forEach(v => {
                detailsMap.set(v.id, {
                    publishedAt: (v.snippet && v.snippet.publishedAt) || '',
                    duration: (v.contentDetails && v.contentDetails.duration) || '',
                    viewCount: Number((v.statistics && v.statistics.viewCount) || 0),
                    likeCount: v.statistics && v.statistics.likeCount != null
                        ? Number(v.statistics.likeCount)
                        : null
                });
            });
        }

        return limited.map(it => {
            const d = detailsMap.get(it.videoId) || {};
            return {
                videoId: it.videoId,
                title: it.title,
                position: it.position,
                thumbnail: it.thumbnail,
                channelTitle: it.channelTitle,
                playlistPublishedAt: it.playlistPublishedAt || '',
                videoPublishedAt: d.publishedAt || it.videoPublishedAt || '',
                duration: d.duration || '',
                viewCount: Number.isFinite(d.viewCount) ? d.viewCount : 0,
                likeCount: Number.isFinite(d.likeCount) ? d.likeCount : null
            };
        });
    }

    /* ---------------- 렌더링 ---------------- */

    function renderList(items) {
        if (Array.isArray(items)) {
            state.items = items;
            state.liveVideoIds = new Set(items.map(it => it.videoId));
        }
        renderListInternal();
    }

    function renderListInternal() {
        const items = Array.isArray(state.items) ? state.items : [];
        if (!items.length) {
            renderMessage('표시할 영상이 없습니다.');
            return;
        }

        const statsVideos = state.stats && state.stats.videos ? state.stats.videos : {};
        const { viewWeight: monthlyViewWeight, likeWeight: monthlyLikeWeight } = getMonthlyWeights();
        const periodDays = Number(state.periodDays || DEFAULT_PERIOD_DAYS);

        const enriched = items.map(it => {
            const stat = statsVideos[it.videoId] || null;
            const history = Array.isArray(stat?.history) ? stat.history : [];
            const currentWindow = computeWindowMetrics(history, periodDays, 0, monthlyViewWeight, monthlyLikeWeight);
            const previousWindow = computeWindowMetrics(history, periodDays, periodDays, monthlyViewWeight, monthlyLikeWeight);
            const publishedAtRaw = it.videoPublishedAt || it.playlistPublishedAt || stat?.joinedAt || '';
            const publishedAtTs = publishedAtRaw ? Date.parse(publishedAtRaw) : NaN;
            return {
                base: it,
                stat,
                currentWindow,
                previousWindow,
                recentScore: currentWindow.score,
                recentViewDelta: currentWindow.viewDelta,
                recentLikeDelta: currentWindow.likeDelta,
                hasRecent: currentWindow.hasData,
                publishedAtRaw,
                publishedAtTs: Number.isFinite(publishedAtTs) ? publishedAtTs : NaN
            };
        });

        const sort = state.sort || DEFAULT_SORT;
        const compareMonthlyRows = (a, b, key) => {
            const diff = (Number(b[key]) || 0) - (Number(a[key]) || 0);
            if (diff !== 0) return diff;
            const likeDiff = (Number(b.currentWindow?.likeDelta) || 0) - (Number(a.currentWindow?.likeDelta) || 0);
            if (likeDiff !== 0) return likeDiff;
            return (Number(a.base.position) || 0) - (Number(b.base.position) || 0);
        };

        let visible = enriched;
        let previousRankMap = new Map();
        if (sort === 'views') {
            visible = [...enriched].sort((a, b) => (Number(b.base.viewCount) || 0) - (Number(a.base.viewCount) || 0));
        } else if (sort === 'new') {
            const now = Date.now();
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            const threshold = threeMonthsAgo.getTime();
            visible = enriched
                .filter(row => Number.isFinite(row.publishedAtTs) && row.publishedAtTs >= threshold && row.publishedAtTs <= now)
                .sort((a, b) => b.publishedAtTs - a.publishedAtTs);
        } else {
            visible = [...enriched].sort((a, b) => compareMonthlyRows(a, b, 'recentScore'));
            const previousSorted = [...enriched]
                .filter(row => row.previousWindow.hasData)
                .sort((a, b) => {
                    const diff = (Number(b.previousWindow.score) || 0) - (Number(a.previousWindow.score) || 0);
                    if (diff !== 0) return diff;
                    const likeDiff = (Number(b.previousWindow.likeDelta) || 0) - (Number(a.previousWindow.likeDelta) || 0);
                    if (likeDiff !== 0) return likeDiff;
                    return (Number(a.base.position) || 0) - (Number(b.base.position) || 0);
                });
            previousSorted.forEach((row, idx) => previousRankMap.set(row.base.videoId, idx + 1));
        }

        els.count.textContent = `${visible.length} 곡`;

        const showRecentBadge = sort === 'recent30';
        const showRankMovement = sort === 'recent30';
        const showNewSongInfo = sort === 'new';

        if (!visible.length) {
            if (sort === 'new') {
                renderMessage('최근 3개월 이내 업로드된 영상이 없습니다.');
            } else {
                renderMessage('표시할 영상이 없습니다.');
            }
            return;
        }

        const html = visible.map((row, idx) => {
            const it = row.base;
            const rank = idx + 1;
            const title = escapeHtml(it.title || '');
            const thumb = escapeHtml(it.thumbnail || `https://i.ytimg.com/vi/${it.videoId}/mqdefault.jpg`);
            const dur = escapeHtml(formatDuration(it.duration));
            const views = escapeHtml(formatViews(it.viewCount));
            const likes = escapeHtml(it.likeCount == null ? '-' : formatViews(it.likeCount));
            const ytUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(it.videoId)}`;

            let rankMoveBadge = '';
            if (showRankMovement) {
                const prevRank = previousRankMap.get(it.videoId);
                if (!row.currentWindow.hasData) {
                    rankMoveBadge = `<span class="changpop-rank-move is-muted" title="집계 데이터 누적 중">집계중</span>`;
                } else if (!Number.isFinite(prevRank)) {
                    rankMoveBadge = `<span class="changpop-rank-move is-new" title="이전 기간 순위권 밖">NEW</span>`;
                } else {
                    const diff = prevRank - rank;
                    if (diff > 0) {
                        rankMoveBadge = `<span class="changpop-rank-move is-up" title="이전 기간 대비 ${diff}계단 상승">▲ ${diff}</span>`;
                    } else if (diff < 0) {
                        rankMoveBadge = `<span class="changpop-rank-move is-down" title="이전 기간 대비 ${Math.abs(diff)}계단 하락">▼ ${Math.abs(diff)}</span>`;
                    } else {
                        rankMoveBadge = `<span class="changpop-rank-move is-same" title="이전 기간과 순위 동일">―</span>`;
                    }
                }
            }

            let recentBadge = '';
            if (showRecentBadge) {
                if (row.hasRecent) {
                    const scoreText = `총점 ${formatViews(Math.round(row.recentScore))}`;
                    const deltaText = `+${formatViews(row.recentViewDelta)} 조회 · +${formatViews(row.recentLikeDelta)} 좋아요`;
                    const coverageText = row.currentWindow.coverageDays < periodDays ? ` · ${row.currentWindow.coverageDays}일 집계` : '';
                    const badgeText = `${scoreText} · ${deltaText}${coverageText}`;
                    recentBadge = `<span class="changpop-recent-chip" title="최근 ${periodDays}일 점수 · 조회수 증가량 · 좋아요 증가량">${escapeHtml(badgeText)}</span>`;
                } else {
                    recentBadge = `<span class="changpop-recent-chip is-muted" title="수집 데이터 누적 중">집계 중</span>`;
                }
            }

            let newSongBadge = '';
            if (showNewSongInfo) {
                const uploadDateText = formatIsoDateLabel(row.publishedAtRaw);
                const daysAgoText = formatDaysAgo(row.publishedAtRaw);
                if (uploadDateText) {
                    const badgeText = `${uploadDateText} 업로드${daysAgoText ? ` · ${daysAgoText}` : ''}`;
                    newSongBadge = `<span class="changpop-new-chip" title="실제 영상 업로드일">${escapeHtml(badgeText)}</span>`;
                } else {
                    newSongBadge = `<span class="changpop-new-chip is-muted" title="업로드일을 확인하지 못했습니다.">업로드일 확인 중</span>`;
                }
            }

            return `
                <li class="changpop-row ${rank <= 3 ? 'is-top' : ''}" data-rank="${rank}">
                    <span class="changpop-col changpop-col-rank">
                        <span class="changpop-rank-stack">
                            <span class="changpop-rank-badge rank-${rank <= 3 ? rank : 'n'}">${rank}</span>
                            ${rankMoveBadge}
                        </span>
                    </span>
                    <a class="changpop-col changpop-col-thumb" href="${ytUrl}" target="_blank" rel="noopener noreferrer" aria-label="${title} 유튜브에서 열기">
                        <img loading="lazy" src="${thumb}" alt="${title}" onerror="this.style.opacity=0.2">
                        <span class="changpop-thumb-play" aria-hidden="true">▶</span>
                    </a>
                    <a class="changpop-col changpop-col-title" href="${ytUrl}" target="_blank" rel="noopener noreferrer" title="${title}">
                        <span class="changpop-title-text">${title}</span>
                        ${it.channelTitle ? `<span class="changpop-channel">${escapeHtml(it.channelTitle)}</span>` : ''}
                        ${showNewSongInfo ? newSongBadge : ''}
                        ${recentBadge}
                    </a>
                    <span class="changpop-col changpop-col-duration">${dur || '-'}</span>
                    <span class="changpop-col changpop-col-views">${views}</span>
                    <span class="changpop-col changpop-col-likes">${likes}</span>
                </li>`;
        }).join('');

        els.list.innerHTML = html;
    }

    async function loadStats() {
        try {
            const res = await fetch(STATS_URL, { cache: 'no-cache' });
            if (!res.ok) return null;
            const text = await res.text();
            return JSON.parse(text.replace(/^\uFEFF/, ''));
        } catch (e) {
            return null;
        }
    }

    function syncPeriodTabsUi() {
        if (!els.periodTabs) return;
        const show = state.sort === 'recent30';
        els.periodTabs.hidden = !show;
        els.periodTabs.querySelectorAll('[data-period]').forEach(btn => {
            const days = Number(btn.getAttribute('data-period') || 0);
            btn.classList.toggle('is-active', show && days === Number(state.periodDays || DEFAULT_PERIOD_DAYS));
        });
    }

    function bindSortTabs() {
        if (!els.sortTabs) return;
        els.sortTabs.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-sort]');
            if (!btn) return;
            const next = btn.getAttribute('data-sort');
            if (!next || next === state.sort) return;
            state.sort = next;
            els.sortTabs.querySelectorAll('[data-sort]').forEach(b => {
                b.classList.toggle('is-active', b.getAttribute('data-sort') === next);
            });
            syncPeriodTabsUi();
            renderListInternal();
        });
    }

    function bindPeriodTabs() {
        if (!els.periodTabs) return;
        els.periodTabs.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-period]');
            if (!btn || state.sort !== 'recent30') return;
            const next = Number(btn.getAttribute('data-period') || 0);
            if (!next || next === Number(state.periodDays || DEFAULT_PERIOD_DAYS)) return;
            state.periodDays = next;
            syncPeriodTabsUi();
            renderListInternal();
        });
    }

    function showUpdatedChip(ts) {
        if (!els.updated) return;
        const text = formatUpdated(ts);
        if (!text) {
            els.updated.hidden = true;
            return;
        }
        els.updated.textContent = text;
        els.updated.hidden = false;
    }


    /* ---------------- 등록 신청 ---------------- */

    function extractVideoId(input) {
        const s = String(input || '').trim();
        if (!s) return '';
        if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
        let url;
        try {
            url = new URL(s, 'https://dummy.local');
        } catch (e) {
            return '';
        }
        const host = (url.hostname || '').replace(/^www\./, '').toLowerCase();
        if (host === 'youtu.be') {
            const seg = url.pathname.split('/').filter(Boolean)[0] || '';
            return /^[A-Za-z0-9_-]{11}$/.test(seg) ? seg : '';
        }
        if (host.endsWith('youtube.com')) {
            const v = url.searchParams.get('v');
            if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
            const segs = url.pathname.split('/').filter(Boolean);
            const idx = segs.findIndex(p => p === 'shorts' || p === 'embed' || p === 'live');
            if (idx >= 0 && segs[idx + 1] && /^[A-Za-z0-9_-]{11}$/.test(segs[idx + 1])) return segs[idx + 1];
        }
        return '';
    }

    function showFormMessage(text, kind) {
        if (!els.formMessage) return;
        if (!text) {
            els.formMessage.hidden = true;
            els.formMessage.textContent = '';
            els.formMessage.className = 'changpop-form-message';
            return;
        }
        els.formMessage.hidden = false;
        els.formMessage.textContent = text;
        els.formMessage.className = `changpop-form-message is-${kind || 'info'}`;
    }

    function openModal() {
        if (!els.modal) return;
        els.modal.hidden = false;
        els.modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('changpop-modal-open');
        showFormMessage('');
        setTimeout(() => els.inputUrl && els.inputUrl.focus(), 30);
    }

    function closeModal() {
        if (!els.modal) return;
        els.modal.hidden = true;
        els.modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('changpop-modal-open');
    }

    async function submitExternalRequest(payload) {
        const res = await fetch('/api/changpop-submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        let data = {};
        try {
            data = await res.json();
        } catch (e) {
            data = {};
        }
        if (!res.ok) {
            const err = new Error(data?.error || '신청 저장에 실패했습니다.');
            err.status = res.status;
            throw err;
        }
        return data;
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (state.isSubmitting) return;
        const rawUrl = els.inputUrl ? els.inputUrl.value : '';
        const nick = (els.inputNick ? els.inputNick.value : '').trim().slice(0, 24);
        const message = (els.inputMessage ? els.inputMessage.value : '').trim().slice(0, 140);

        const videoId = extractVideoId(rawUrl);
        if (!videoId) {
            showFormMessage('올바른 유튜브 링크가 아닌 것 같아요. 다시 확인해 주세요.', 'error');
            return;
        }
        if (state.liveVideoIds.has(videoId)) {
            showFormMessage('이미 창팝 순위에 등록된 영상입니다.', 'error');
            return;
        }

        state.isSubmitting = true;
        if (els.formSubmit) {
            els.formSubmit.disabled = true;
            els.formSubmit.textContent = '신청 중...';
        }
        showFormMessage('신청 내용을 저장하는 중입니다...', 'info');

        try {
            await submitExternalRequest({
                youtubeUrl: rawUrl,
                videoId,
                submittedBy: nick || '익명',
                message,
                preview: state.previewData && state.previewData.videoId === videoId ? state.previewData : null
            });
            showFormMessage('신청이 접수되었습니다. 관리자 검토 후 순위에 반영됩니다.', 'success');
            if (els.form) els.form.reset();
            setPreviewState('hidden');
            setTimeout(closeModal, 900);
        } catch (err) {
            if (err.status === 409) {
                showFormMessage('이미 신청 대기 중이거나 등록된 영상입니다.', 'error');
            } else {
                showFormMessage(err.message || '신청 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.', 'error');
            }
        } finally {
            state.isSubmitting = false;
            if (els.formSubmit) {
                els.formSubmit.disabled = false;
                els.formSubmit.textContent = '신청하기';
            }
        }
    }

    function bindSubmissionEvents() {
        if (els.submitOpen) els.submitOpen.addEventListener('click', openModal);
        if (els.modal) {
            els.modal.addEventListener('click', (e) => {
                if (e.target && e.target.dataset && e.target.dataset.modalClose === '1') {
                    closeModal();
                }
            });
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && els.modal && !els.modal.hidden) closeModal();
        });
        if (els.form) els.form.addEventListener('submit', handleSubmit);
        if (els.inputUrl) els.inputUrl.addEventListener('input', schedulePreviewLookup);
    }

    /* ---------------- 진입점 ---------------- */

    async function init() {
        mountHeader();
        bindSubmissionEvents();
        bindSortTabs();
        bindPeriodTabs();
        syncPeriodTabsUi();
        renderLoading();

        // 최근 30일 통계 먼저 (있으면) 가져오기 - 정렬용
        state.stats = await loadStats();

        const cfg = await loadConfig();
        const playlistId = String(cfg.playlistId || '').trim();
        const apiKey = String(cfg.youtubeApiKey || '').trim();
        state.apiKey = apiKey;
        const maxResults = Math.max(1, Math.min(200, Number(cfg.maxResults) || 50));
        const cacheMinutes = Math.max(0, Number(cfg.cacheMinutes) || 30);

        if (!playlistId || !apiKey) {
            renderMessage('ChangpopConfig.json 에 youtubeApiKey 와 playlistId 를 입력해 주세요.', true);
            return;
        }

        // 캐시 우선
        const cached = readCache(playlistId);
        const cacheValid = cached && (Date.now() - cached.fetchedAt) < cacheMinutes * 60 * 1000;
        if (cacheValid) {
            renderList(cached.items);
            showUpdatedChip(cached.fetchedAt);
        }

        // 캐시가 있으면 백그라운드 갱신, 없으면 즉시 호출
        try {
            if (!cacheValid) renderLoading();
            const items = await fetchPlaylistItems(playlistId, apiKey, maxResults);
            writeCache(playlistId, items);
            renderList(items);
            showUpdatedChip(Date.now());
        } catch (err) {
            console.warn('[Changpop] 유튜브 API 호출 실패', err);
            if (!cacheValid) {
                renderMessage('유튜브 정보를 불러오지 못했습니다. API 키 또는 플레이리스트 ID 를 확인해 주세요.', true);
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
