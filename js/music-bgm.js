/* =========================================
   MyMaple v6 - 음악 / BGM 정보실
   - MyMaple_PageInfo/InfoList/BGMList.json 참조
   - 기본 정렬: title 가나다 오름차순
   - 이름 / BGM 열 헤더 클릭으로 오름·내림 토글
   - 검색 (title + bgm)
   - 행 단위 재생/정지 (전역 BGM 플레이어 활용)
   ========================================= */

(function () {
    const C = window.MyMapleCommon;
    const D = window.MyMapleData;
    const escapeHtml = C.escapeHtml;

    const LIST_URL = 'MyMaple_PageInfo/InfoList/BGMList.json';

    const state = {
        all: [],
        filtered: [],
        sortKey: 'title',
        sortDir: 'asc', // 'asc' | 'desc'
        query: '',
        playingBgmKey: null
    };

    const els = {
        list: document.getElementById('music-list'),
        count: document.getElementById('music-count'),
        search: document.getElementById('music-search-input'),
        clear: document.getElementById('music-search-clear'),
        sortBtns: Array.from(document.querySelectorAll('.music-sort-btn'))
    };

    function mountHeader() {
        const mount = document.getElementById('header-mount');
        if (!mount) return;
        mount.innerHTML = C.renderSiteHeader('bgm', C.getInfoNavItems());
        C.bindHeaderOfflineLinks();
    }

    function renderEmptyState(message) {
        els.list.innerHTML = `<li class="music-empty">${escapeHtml(message)}</li>`;
    }

    function compareStrings(a, b) {
        return String(a || '').localeCompare(String(b || ''), 'ko', { sensitivity: 'base', numeric: true });
    }

    function applySort(items) {
        const key = state.sortKey;
        const dir = state.sortDir === 'desc' ? -1 : 1;
        return [...items].sort((a, b) => {
            // 지역(mapMark) 정렬은 빈 값을 맨 뒤로 보내고
            // 같은 mapMark 그룹 안에서는 title 가나다순으로 정렬
            if (key === 'mapMark') {
                const ma = String(a.mapMark || '').trim();
                const mb = String(b.mapMark || '').trim();
                if (!ma && mb) return 1;
                if (ma && !mb) return -1;
                const primary = compareStrings(ma, mb) * dir;
                if (primary !== 0) return primary;
                return compareStrings(a.title, b.title);
            }
            const primary = compareStrings(a[key], b[key]) * dir;
            if (primary !== 0) return primary;
            const fallbackKey = key === 'title' ? 'bgm' : 'title';
            return compareStrings(a[fallbackKey], b[fallbackKey]);
        });
    }

    function applyFilter(items, query) {
        const q = (query || '').trim().toLowerCase();
        if (!q) return items;
        return items.filter(it =>
            String(it.title || '').toLowerCase().includes(q) ||
            String(it.bgm || '').toLowerCase().includes(q) ||
            String(it.mapMark || '').toLowerCase().includes(q)
        );
    }

    function updateSortButtonsUi() {
        els.sortBtns.forEach(btn => {
            const key = btn.dataset.sortKey;
            const isActive = key === state.sortKey;
            btn.classList.toggle('is-active', isActive);
            btn.classList.toggle('is-asc', isActive && state.sortDir === 'asc');
            btn.classList.toggle('is-desc', isActive && state.sortDir === 'desc');
            btn.setAttribute('aria-sort', isActive
                ? (state.sortDir === 'asc' ? 'ascending' : 'descending')
                : 'none');
        });
    }

    function bgmKeyOf(item) {
        // 기존 BGM 플레이어는 key의 마지막 세그먼트로 파일을 찾으므로 bgm 값 그대로 사용
        return item.bgm || '';
    }

    function syncQueueToPlayer() {
        if (!window.MyMapleBGM || typeof window.MyMapleBGM.setQueue !== 'function') return;
        const queueItems = state.filtered.map(it => ({
            key: bgmKeyOf(it),
            name: it.title || it.bgm || ''
        }));
        window.MyMapleBGM.setQueue(queueItems, {
            onTrackChange: (key) => {
                state.playingBgmKey = key || null;
                refreshPlayingStateUi();
                scrollToPlayingRow();
            }
        });
    }

    function scrollToPlayingRow() {
        if (!state.playingBgmKey) return;
        const row = els.list.querySelector(`.music-row[data-bgm-key="${CSS.escape(state.playingBgmKey)}"]`);
        if (row && typeof row.scrollIntoView === 'function') {
            row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    function renderList() {
        const filtered = applyFilter(state.all, state.query);
        const sorted = applySort(filtered);
        state.filtered = sorted;

        els.count.textContent = `${sorted.length} 곡`;

        if (!sorted.length) {
            renderEmptyState(state.query ? '검색 결과가 없습니다. 다른 키워드로 시도해 보세요.' : '등록된 BGM이 없습니다.');
            return;
        }

        const resolveMark = (D && typeof D.resolveMapMarkPath === 'function') ? D.resolveMapMarkPath : null;

        const html = sorted.map((item, idx) => {
            const title = escapeHtml(item.title || '');
            const bgm = escapeHtml(item.bgm || '');
            const key = escapeHtml(bgmKeyOf(item));
            const isPlaying = state.playingBgmKey && state.playingBgmKey === bgmKeyOf(item);
            const markRaw = String(item.mapMark || '').trim();
            const markKey = escapeHtml(markRaw);
            const markUrl = (markRaw && resolveMark) ? escapeHtml(resolveMark(markRaw)) : '';
            const markCell = markUrl
                ? `<span class="music-cell music-cell-mark"><span class="music-mark-box" tabindex="0" role="img" aria-label="${markKey}" data-tooltip="${markKey}"><img class="music-mark-img" src="${markUrl}" alt="" loading="lazy" onerror="this.closest('.music-mark-box')?.classList.add('is-missing'); this.remove();"></span></span>`
                : `<span class="music-cell music-cell-mark music-cell-mark-empty" aria-hidden="true"></span>`;
            return `
                <li class="music-row ${isPlaying ? 'is-playing' : ''}" data-index="${idx}" data-bgm-key="${key}" data-mark="${markKey}">
                    ${markCell}
                    <span class="music-cell music-cell-title" title="${title}">${title}</span>
                    <span class="music-cell music-cell-bgm" title="${bgm}">${bgm}</span>
                    <span class="music-cell music-cell-action">
                        <button type="button"
                            class="music-play-btn ${isPlaying ? 'is-playing' : ''}"
                            data-bgm-key="${key}"
                            data-bgm-name="${title}"
                            aria-pressed="${isPlaying ? 'true' : 'false'}">
                            <span class="music-play-icon" aria-hidden="true"></span>
                            <span class="music-play-label">${isPlaying ? '정지' : '재생'}</span>
                        </button>
                    </span>
                </li>`;
        }).join('');

        els.list.innerHTML = html;
        // 정렬/검색 변경 때마다 큐 동기화 (다음 곡 계산이 항상 현재 화면 순서를 따르도록)
        syncQueueToPlayer();
    }

    function refreshPlayingStateUi() {
        const rows = els.list.querySelectorAll('.music-row');
        rows.forEach(row => {
            const key = row.dataset.bgmKey;
            const playing = !!state.playingBgmKey && state.playingBgmKey === key;
            row.classList.toggle('is-playing', playing);
            const btn = row.querySelector('.music-play-btn');
            if (btn) {
                btn.classList.toggle('is-playing', playing);
                btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
                const label = btn.querySelector('.music-play-label');
                if (label) label.textContent = playing ? '정지' : '재생';
            }
        });
    }

    function handlePlayClick(btn) {
        const bgmKey = btn.dataset.bgmKey || '';
        const displayName = btn.dataset.bgmName || '';
        if (!bgmKey) return;

        if (!window.MyMapleBGM) return;
        window.MyMapleBGM.ensurePlayerUI?.();

        // 재생 전 먼저 큐를 괴 동기화 (이웃 곡 계산 정확하게)
        syncQueueToPlayer();

        const wasPlaying = state.playingBgmKey === bgmKey;
        if (wasPlaying) {
            window.MyMapleBGM.stopBgm?.();
            state.playingBgmKey = null;
        } else {
            window.MyMapleBGM.playBgm?.(bgmKey, displayName, true);
            state.playingBgmKey = bgmKey;
        }
        refreshPlayingStateUi();
    }

    function bindEvents() {
        els.sortBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.sortKey;
                if (!key) return;
                if (state.sortKey === key) {
                    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    state.sortKey = key;
                    state.sortDir = 'asc';
                }
                updateSortButtonsUi();
                renderList();
            });
        });

        let searchTimer = null;
        els.search.addEventListener('input', (e) => {
            const value = e.target.value || '';
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                state.query = value;
                renderList();
            }, 90);
        });
        els.search.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                els.search.value = '';
                state.query = '';
                renderList();
            }
        });
        els.clear.addEventListener('click', () => {
            els.search.value = '';
            state.query = '';
            renderList();
            els.search.focus();
        });

        els.list.addEventListener('click', (e) => {
            const btn = e.target.closest('.music-play-btn');
            if (btn) {
                handlePlayClick(btn);
                return;
            }
            const row = e.target.closest('.music-row');
            if (row) {
                const innerBtn = row.querySelector('.music-play-btn');
                if (innerBtn) handlePlayClick(innerBtn);
            }
        });

        // ===== MapMark 투팁 (body 고정 레이어) =====
        // 이유: 몇몇 구조에서는 투팁이 부모 overflow/헤더에 가려서
        // CSS만으로는 앞으로 띄울 수 없으므로 body에 동적 투팁을 만듬.
        let tooltipEl = document.getElementById('music-mark-tooltip');
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.id = 'music-mark-tooltip';
            tooltipEl.className = 'music-mark-floating-tooltip';
            document.body.appendChild(tooltipEl);
        }
        const showTooltip = (box) => {
            const name = box.getAttribute('data-tooltip') || '';
            if (!name) return;
            tooltipEl.textContent = name;
            tooltipEl.classList.add('is-visible');
            // 위치 계산: 아이콘 위쪽 중앙
            const rect = box.getBoundingClientRect();
            // 일단 표시한 뒤 투팁 크기 측정
            tooltipEl.style.left = '0px';
            tooltipEl.style.top  = '0px';
            const tipW = tooltipEl.offsetWidth || 80;
            const tipH = tooltipEl.offsetHeight || 28;
            let left = rect.left + rect.width / 2 - tipW / 2;
            let top  = rect.top - tipH - 8;
            // 화면 경계 보정
            const margin = 8;
            if (left < margin) left = margin;
            if (left + tipW > window.innerWidth - margin) left = window.innerWidth - tipW - margin;
            if (top < margin) {
                // 위가 부족하면 아이콘 아래에
                top = rect.bottom + 8;
            }
            tooltipEl.style.left = `${Math.round(left)}px`;
            tooltipEl.style.top  = `${Math.round(top)}px`;
        };
        const hideTooltip = () => {
            tooltipEl.classList.remove('is-visible');
        };
        els.list.addEventListener('mouseover', (e) => {
            const box = e.target.closest('.music-mark-box');
            if (box) showTooltip(box);
        });
        els.list.addEventListener('mouseout', (e) => {
            const box = e.target.closest('.music-mark-box');
            if (box) hideTooltip();
        });
        els.list.addEventListener('focusin', (e) => {
            const box = e.target.closest('.music-mark-box');
            if (box) showTooltip(box);
        });
        els.list.addEventListener('focusout', (e) => {
            const box = e.target.closest('.music-mark-box');
            if (box) hideTooltip();
        });
        // 스크롤 중 투팁 숨김 (위치 틀어지는 게 더 이상함)
        els.list.addEventListener('scroll', hideTooltip);
        window.addEventListener('scroll', hideTooltip, true);

        // 외부에서 BGM이 정지될 가능성에 대비: 주기적으로 동기화
        setInterval(() => {
            const playing = !!(window.MyMapleBGM && document.querySelector('.bgm-player.active'));
            if (!playing && state.playingBgmKey) {
                state.playingBgmKey = null;
                refreshPlayingStateUi();
            }
        }, 800);
    }

    async function loadBgmList() {
        try {
            let data = null;
            if (D && typeof D.fetchJSON === 'function') {
                data = await D.fetchJSON(LIST_URL);
            }
            if (!data) {
                const res = await fetch(LIST_URL, { cache: 'no-cache' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                data = JSON.parse((await res.text()).replace(/^\uFEFF/, ''));
            }
            const arr = Array.isArray(data)
                ? data
                : (Array.isArray(data?.list) ? data.list : []);
            const cleaned = arr
                .filter(it => it && (it.title || it.bgm))
                .map(it => ({
                    title: String(it.title || '').trim(),
                    bgm: String(it.bgm || '').trim(),
                    file: String(it.file || '').trim(),
                    mapMark: String(it.mapMark || '').trim()
                }));
            state.all = cleaned;
            updateSortButtonsUi();
            renderList();
        } catch (err) {
            console.warn('[Music] BGMList 로드 실패', err);
            renderEmptyState('BGM 목록 파일을 불러오지 못했습니다. MyMaple_PageInfo/InfoList/BGMList.json 경로를 확인해 주세요.');
            els.count.textContent = '0 곡';
        }
    }

    function init() {
        mountHeader();
        bindEvents();
        updateSortButtonsUi();
        loadBgmList();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
