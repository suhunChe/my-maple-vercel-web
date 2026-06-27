/* =========================================
   MyMaple v6 — 창팝 순위 (Changpop Ranking)
   - YouTube Data API v3 를 호출해 플레이리스트 항목을 가져옴
   - 설정 파일: MyMaple_PageInfo/InfoList/ChangpopConfig.json
       { playlistId, youtubeApiKey, maxResults, cacheMinutes }
   - 표시 항목: 순위 / 썸네일 / 제목 / 재생시간 / 조회수
   - 캐시: localStorage (cacheMinutes 동안)
   ========================================= */

(function () {
    const C = window.MyMapleCommon;
    const D = window.MyMapleData;
    const escapeHtml = C.escapeHtml;

    const CONFIG_URL = 'MyMaple_PageInfo/InfoList/ChangpopConfig.json';
    const CACHE_KEY = 'mymaple.changpop.cache.v1';
    const PENDING_KEY = 'mymaple.changpop.pending.v1';

    const els = {
        list: document.getElementById('changpop-list'),
        count: document.getElementById('changpop-count'),
        updated: document.getElementById('changpop-updated'),
        // 신청
        submitOpen: document.getElementById('changpop-submit-open'),
        modal: document.getElementById('changpop-modal'),
        form: document.getElementById('changpop-form'),
        inputUrl: document.getElementById('changpop-input-url'),
        inputNick: document.getElementById('changpop-input-nick'),
        inputMessage: document.getElementById('changpop-input-message'),
        formMessage: document.getElementById('changpop-form-message'),
        formSubmit: document.getElementById('changpop-form-submit'),
        // 대기 목록
        pendingSection: document.getElementById('changpop-pending-section'),
        pendingList: document.getElementById('changpop-pending-list'),
        pendingCount: document.getElementById('changpop-pending-count'),
        pendingExport: document.getElementById('changpop-pending-export'),
        pendingClear: document.getElementById('changpop-pending-clear')
    };

    // 현재 순위 리스트의 videoId 스냅샷 (중복 검사용)
    const state = {
        liveVideoIds: new Set()
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
                    channelTitle: sn.videoOwnerChannelTitle || sn.channelTitle || ''
                });
            });

            pageToken = json.nextPageToken || '';
            if (!pageToken) break;
            if (items.length >= maxResults) break;
        }

        const limited = items.slice(0, maxResults);
        if (!limited.length) return [];

        // videos.list 로 duration + viewCount 채우기 (최대 50개씩)
        const idChunks = [];
        for (let i = 0; i < limited.length; i += 50) {
            idChunks.push(limited.slice(i, i + 50));
        }
        const detailsMap = new Map();
        for (const chunk of idChunks) {
            const ids = chunk.map(x => x.videoId).join(',');
            const url = new URL('https://www.googleapis.com/youtube/v3/videos');
            url.searchParams.set('part', 'contentDetails,statistics');
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
                    duration: (v.contentDetails && v.contentDetails.duration) || '',
                    viewCount: Number((v.statistics && v.statistics.viewCount) || 0)
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
                duration: d.duration || '',
                viewCount: Number.isFinite(d.viewCount) ? d.viewCount : 0
            };
        });
    }

    /* ---------------- 렌더링 ---------------- */

    function renderList(items) {
        if (!Array.isArray(items) || !items.length) {
            state.liveVideoIds = new Set();
            renderPending();
            renderMessage('표시할 영상이 없습니다.');
            return;
        }
        state.liveVideoIds = new Set(items.map(it => it.videoId));
        renderPending();
        els.count.textContent = `${items.length} 곡`;

        const html = items.map((it, idx) => {
            const rank = idx + 1;
            const title = escapeHtml(it.title || '');
            const thumb = escapeHtml(it.thumbnail || `https://i.ytimg.com/vi/${it.videoId}/mqdefault.jpg`);
            const dur = escapeHtml(formatDuration(it.duration));
            const views = escapeHtml(formatViews(it.viewCount));
            const ytUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(it.videoId)}`;
            return `
                <li class="changpop-row ${rank <= 3 ? 'is-top' : ''}" data-rank="${rank}">
                    <span class="changpop-col changpop-col-rank">
                        <span class="changpop-rank-badge rank-${rank <= 3 ? rank : 'n'}">${rank}</span>
                    </span>
                    <a class="changpop-col changpop-col-thumb" href="${ytUrl}" target="_blank" rel="noopener noreferrer" aria-label="${title} 유튜브에서 열기">
                        <img loading="lazy" src="${thumb}" alt="${title}" onerror="this.style.opacity=0.2">
                        <span class="changpop-thumb-play" aria-hidden="true">▶</span>
                    </a>
                    <a class="changpop-col changpop-col-title" href="${ytUrl}" target="_blank" rel="noopener noreferrer" title="${title}">
                        <span class="changpop-title-text">${title}</span>
                        ${it.channelTitle ? `<span class="changpop-channel">${escapeHtml(it.channelTitle)}</span>` : ''}
                    </a>
                    <span class="changpop-col changpop-col-duration">${dur || '-'}</span>
                    <span class="changpop-col changpop-col-views">${views}</span>
                </li>`;
        }).join('');

        els.list.innerHTML = html;
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

    function loadPending() {
        try {
            const raw = localStorage.getItem(PENDING_KEY);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function savePending(list) {
        try {
            localStorage.setItem(PENDING_KEY, JSON.stringify(list));
        } catch (e) { /* quota / disabled */ }
    }

    function genSubmissionId() {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const HH = String(d.getHours()).padStart(2, '0');
        const MM = String(d.getMinutes()).padStart(2, '0');
        const SS = String(d.getSeconds()).padStart(2, '0');
        const rand = Math.random().toString(36).slice(2, 6);
        return `req_${yyyy}${mm}${dd}_${HH}${MM}${SS}_${rand}`;
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

    function handleSubmit(e) {
        e.preventDefault();
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
        const pending = loadPending();
        if (pending.some(it => it.videoId === videoId)) {
            showFormMessage('이미 신청 대기 목록에 있는 영상입니다.', 'error');
            return;
        }

        const submission = {
            id: genSubmissionId(),
            videoId,
            youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
            submittedBy: nick || '익명',
            message,
            status: 'pending',
            submittedAt: new Date().toISOString()
        };
        pending.unshift(submission);
        savePending(pending);

        showFormMessage('신청이 접수되었습니다. 관리자 확인 후 순위에 반영됩니다.', 'success');
        if (els.form) els.form.reset();
        renderPending();
        setTimeout(closeModal, 900);
    }

    function renderPending() {
        if (!els.pendingSection || !els.pendingList) return;
        const list = loadPending();
        if (!list.length) {
            els.pendingSection.hidden = true;
            els.pendingList.innerHTML = '';
            if (els.pendingCount) els.pendingCount.textContent = '0 건';
            return;
        }
        els.pendingSection.hidden = false;
        if (els.pendingCount) els.pendingCount.textContent = `${list.length} 건`;

        const html = list.map(it => {
            const submitted = new Date(it.submittedAt);
            const ts = Number.isNaN(submitted.getTime())
                ? ''
                : `${submitted.getFullYear()}-${String(submitted.getMonth() + 1).padStart(2, '0')}-${String(submitted.getDate()).padStart(2, '0')} ${String(submitted.getHours()).padStart(2, '0')}:${String(submitted.getMinutes()).padStart(2, '0')}`;
            const thumb = `https://i.ytimg.com/vi/${it.videoId}/mqdefault.jpg`;
            const url = escapeHtml(it.youtubeUrl);
            const nick = escapeHtml(it.submittedBy || '익명');
            const message = it.message ? `<p class="changpop-pending-message">${escapeHtml(it.message)}</p>` : '';
            return `
                <li class="changpop-pending-row" data-id="${escapeHtml(it.id)}">
                    <a class="changpop-pending-thumb" href="${url}" target="_blank" rel="noopener noreferrer">
                        <img loading="lazy" src="${thumb}" alt="" onerror="this.style.opacity=0.2">
                    </a>
                    <div class="changpop-pending-body">
                        <a class="changpop-pending-link" href="${url}" target="_blank" rel="noopener noreferrer" title="${url}">${url}</a>
                        <div class="changpop-pending-meta">
                            <span class="changpop-pending-nick">${nick}</span>
                            <span class="changpop-pending-time">${escapeHtml(ts)}</span>
                        </div>
                        ${message}
                    </div>
                    <button type="button" class="changpop-pending-remove" data-remove-id="${escapeHtml(it.id)}" aria-label="이 신청 삭제">×</button>
                </li>`;
        }).join('');

        els.pendingList.innerHTML = html;
    }

    function removePending(id) {
        const list = loadPending().filter(it => it.id !== id);
        savePending(list);
        renderPending();
    }

    function clearPending() {
        if (!confirm('신청 대기 목록을 모두 지울까요?')) return;
        savePending([]);
        renderPending();
    }

    function exportPending() {
        const list = loadPending();
        if (!list.length) return;
        const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const now = new Date();
        const tag = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        a.href = url;
        a.download = `changpop_pending_${tag}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 500);
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
        if (els.pendingList) {
            els.pendingList.addEventListener('click', (e) => {
                const target = e.target.closest('[data-remove-id]');
                if (!target) return;
                removePending(target.getAttribute('data-remove-id'));
            });
        }
        if (els.pendingClear) els.pendingClear.addEventListener('click', clearPending);
        if (els.pendingExport) els.pendingExport.addEventListener('click', exportPending);
    }

    /* ---------------- 진입점 ---------------- */

    async function init() {
        mountHeader();
        bindSubmissionEvents();
        renderPending();
        renderLoading();

        const cfg = await loadConfig();
        const playlistId = String(cfg.playlistId || '').trim();
        const apiKey = String(cfg.youtubeApiKey || '').trim();
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
