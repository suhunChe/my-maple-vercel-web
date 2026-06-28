/* =========================================
   MyMaple v5 - 공용 유틸
   ========================================= */

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
}

/**
 * 메이플 스토리 JSON에 자주 등장하는 \\n / \\r\\n 이스케이프를
 * 실제 줄바꿈으로 변환.
 */
function unescapeKoreanText(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\r/g, '\n');
}

/**
 * 토스트 메시지 표시 (1.8초)
 */
function showToast(message) {
    let toast = document.getElementById('mymaple-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'mymaple-toast';
        toast.className = 'mymaple-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('active');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('active'), 1800);
}

/**
 * 페이지 간 데이터 전달용 sessionStorage 헬퍼
 */
function storePayload(prefix, payload) {
    const key = `mymaple_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    try {
        sessionStorage.setItem(key, JSON.stringify(payload));
    } catch (e) {
        console.warn('sessionStorage 저장 실패', e);
    }
    return key;
}

function readPayload(key) {
    if (!key) return null;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

const MAIN_ICON_PATH = 'MyMaple_PageInfo/Special_Image/MainIcon/MainIcon.png';

const SITE_HEADER_GROUPS = [
    {
        key: 'story',
        label: '스토리',
        children: [
            { key: 'world', label: 'World 탐색', href: 'world-select.html' },
            { key: 'map', label: 'Map 정보실', href: 'info.html?type=map' },
            { key: 'mob', label: 'Mob 정보실', href: 'info.html?type=mob' },
            { key: 'npc', label: 'Npc 정보실', href: 'info.html?type=npc' },
            { key: 'item', label: 'Item 정보실', href: 'info.html?type=item' }
        ]
    },
    {
        key: 'music',
        label: '음악',
        children: [
            { key: 'bgm', label: 'BGM 정보실', href: 'music-bgm.html' },
            { key: 'changpop', label: '창팝 순위', href: 'music-changpop.html' },
            { key: 'remix', label: '리믹스 BGM', href: 'javascript:void(0)', online: false },
            { key: 'room', label: '개인실', href: 'javascript:void(0)', online: false }
        ]
    },
    {
        key: 'goods',
        label: '굿즈',
        children: [
            { key: 'figure', label: '피규어 모델실', href: 'figure-model.html' }
        ]
    }
];

function normalizeHeaderGroups(customItems) {
    if (!Array.isArray(customItems) || !customItems.length) return SITE_HEADER_GROUPS.map(group => ({ ...group, children: (group.children || []).map(child => ({ ...child })) }));
    if (customItems.some(item => Array.isArray(item?.children))) {
        return customItems.map(group => ({ ...group, children: (group.children || []).map(child => ({ ...child })) }));
    }
    return [{ key: 'menu', label: '메뉴', children: customItems.map(item => ({ ...item })) }];
}

/**
 * 공통 헤더 마크업 — 페이지마다 같은 헤더를 출력
 */
function renderSiteHeader(activePage, customItems) {
    const groups = normalizeHeaderGroups(customItems);
    const activeGroupKey = groups.find(group => {
        const children = Array.isArray(group.children) ? group.children : [];
        return children.some(child => child.key === activePage);
    })?.key || '';

    return `
        <header class="site-header">
            <a href="index.html" class="logo">
                <img class="logo-mark" src="${MAIN_ICON_PATH}" alt="MyMaple icon" loading="eager" decoding="async" fetchpriority="high" onerror="this.style.display='none'">
                <span class="logo-text">MY MAPLE</span>
            </a>
            <nav class="nav-links nav-groups" aria-label="주요 메뉴" data-default-group="${escapeHtml(activeGroupKey)}">
                <div class="nav-top-tabs">
                    ${groups.map(group => {
                        const children = Array.isArray(group.children) ? group.children : [];
                        const firstChild = children[0] || null;
                        const groupKey = String(group.key || '');
                        const groupActive = groupKey === activeGroupKey;
                        const triggerHref = firstChild?.online === false
                            ? 'javascript:void(0)'
                            : (firstChild?.href || 'index.html');
                        const triggerOfflineAttr = firstChild?.online === false
                            ? ` data-offline="1" data-name="${escapeHtml(group.label || '')}"`
                            : '';
                        return `
                            <div class="nav-group ${groupActive ? 'active' : ''}" data-group-key="${escapeHtml(groupKey)}">
                                <a href="${triggerHref}" class="nav-group-trigger ${groupActive ? 'is-current' : ''}" data-group-key="${escapeHtml(groupKey)}"${triggerOfflineAttr}>${escapeHtml(group.label || '')}</a>
                            </div>`;
                    }).join('')}
                </div>
                <div class="nav-subnav">
                    ${groups.map(group => {
                        const children = Array.isArray(group.children) ? group.children : [];
                        const groupKey = String(group.key || '');
                        const groupActive = groupKey === activeGroupKey;
                        return `
                            <div class="nav-subnav-panel ${groupActive ? 'is-current' : ''}" data-group-panel="${escapeHtml(groupKey)}">
                                ${children.map(it => {
                                    const cls = it.key === activePage ? 'active' : '';
                                    if (it.online === false) {
                                        return `<a href="javascript:void(0)" class="${cls}" data-offline="1" data-name="${escapeHtml(it.label)}">${escapeHtml(it.label)}</a>`;
                                    }
                                    const href = it.href || 'index.html';
                                    return `<a href="${href}" class="${cls}">${escapeHtml(it.label)}</a>`;
                                }).join('')}
                            </div>`;
                    }).join('')}
                </div>
            </nav>
            <div class="search-area">
                <input type="text" placeholder="이름·ID로 검색…">
                <button>조회</button>
            </div>
        </header>
    `;
}

function bindHeaderOfflineLinks() {
    document.querySelectorAll('.nav-groups').forEach(root => {
        if (root.dataset.headerBound === '1') return;
        root.dataset.headerBound = '1';

        const defaultGroup = root.dataset.defaultGroup || '';
        const headerEl = root.closest('.site-header');
        const headerMount = headerEl?.parentElement || null;
        if (headerEl) headerEl.classList.toggle('has-persistent-subnav', !!defaultGroup);
        if (headerMount) headerMount.classList.toggle('has-persistent-subnav', !!defaultGroup);

        const triggers = Array.from(root.querySelectorAll('.nav-group-trigger'));
        const panels = Array.from(root.querySelectorAll('.nav-subnav-panel'));
        const subnav = root.querySelector('.nav-subnav');
        let closeTimer = null;

        const clearCloseTimer = () => {
            if (closeTimer) {
                clearTimeout(closeTimer);
                closeTimer = null;
            }
        };

        const setCurrentGroup = (groupKey) => {
            root.dataset.currentGroup = groupKey || '';
            root.classList.toggle('has-current-group', !!groupKey);
            triggers.forEach(trigger => {
                const isDefault = !!defaultGroup && trigger.dataset.groupKey === defaultGroup;
                const isCurrent = !!groupKey && trigger.dataset.groupKey === groupKey;
                trigger.classList.toggle('is-current', isDefault || isCurrent);
            });
            panels.forEach(panel => {
                panel.classList.toggle('is-current', !!groupKey && panel.dataset.groupPanel === groupKey);
            });
        };

        const scheduleReset = () => {
            clearCloseTimer();
            closeTimer = setTimeout(() => setCurrentGroup(defaultGroup), 220);
        };

        setCurrentGroup(defaultGroup);

        triggers.forEach(trigger => {
            const groupKey = trigger.dataset.groupKey || '';
            trigger.addEventListener('mouseenter', () => {
                clearCloseTimer();
                setCurrentGroup(groupKey);
            });
            trigger.addEventListener('focus', () => {
                clearCloseTimer();
                setCurrentGroup(groupKey);
            });
        });

        if (subnav) {
            subnav.addEventListener('mouseenter', clearCloseTimer);
            subnav.addEventListener('mouseleave', scheduleReset);
        }

        root.addEventListener('mouseenter', clearCloseTimer);
        root.addEventListener('mouseleave', scheduleReset);
        root.addEventListener('focusout', () => {
            requestAnimationFrame(() => {
                if (!root.contains(document.activeElement)) scheduleReset();
            });
        });
    });

    document.querySelectorAll('a[data-offline="1"]').forEach(a => {
        if (a.dataset.offlineBound === '1') return;
        a.dataset.offlineBound = '1';
        a.addEventListener('click', (e) => {
            e.preventDefault();
            showToast(`${a.dataset.name || '이 메뉴'}는 업데이트 예정입니다.`);
        });
    });
}

const INFO_NAV_ITEMS = SITE_HEADER_GROUPS;

function getInfoNavItems() {
    return normalizeHeaderGroups(SITE_HEADER_GROUPS);
}

function getStoryActiveNavKey(type) {
    const t = String(type || '').toLowerCase();
    if (t === 'mob' || t === 'npc' || t === 'item' || t === 'map') return t;
    return 'map';
}

window.MyMapleCommon = {
    escapeHtml,
    unescapeKoreanText,
    showToast,
    storePayload,
    readPayload,
    renderSiteHeader,
    bindHeaderOfflineLinks,
    INFO_NAV_ITEMS,
    SITE_HEADER_GROUPS,
    getInfoNavItems,
    getStoryActiveNavKey
};
