(function () {
    const C = window.MyMapleCommon;
    const escapeHtml = C.escapeHtml;
    const STORAGE_KEY = 'mymaple.changpop.admin.key';

    const els = {
        authForm: document.getElementById('changpop-admin-auth-form'),
        authInput: document.getElementById('changpop-admin-key'),
        authMessage: document.getElementById('changpop-admin-auth-message'),
        card: document.getElementById('changpop-admin-card'),
        filter: document.getElementById('changpop-admin-filter'),
        refresh: document.getElementById('changpop-admin-refresh'),
        count: document.getElementById('changpop-admin-count'),
        list: document.getElementById('changpop-admin-list')
    };

    const state = { key: sessionStorage.getItem(STORAGE_KEY) || '' };

    function mountHeader() {
        const mount = document.getElementById('header-mount');
        if (!mount) return;
        mount.innerHTML = C.renderSiteHeader('changpop', C.getInfoNavItems());
        C.bindHeaderOfflineLinks();
    }

    function showAuthMessage(text, kind) {
        if (!els.authMessage) return;
        if (!text) {
            els.authMessage.hidden = true;
            els.authMessage.textContent = '';
            els.authMessage.className = 'changpop-form-message';
            return;
        }
        els.authMessage.hidden = false;
        els.authMessage.textContent = text;
        els.authMessage.className = `changpop-form-message is-${kind || 'info'}`;
    }

    function formatDateTime(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '-';
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const HH = String(d.getHours()).padStart(2, '0');
        const MM = String(d.getMinutes()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd} ${HH}:${MM}`;
    }

    function statusLabel(status) {
        return ({ pending: '대기중', approved: '승인됨', rejected: '반려됨', deleted: '삭제됨' })[status] || status;
    }

    async function fetchList() {
        const filter = els.filter ? els.filter.value : 'pending';
        const res = await fetch(`/api/changpop-admin?status=${encodeURIComponent(filter)}`, {
            headers: { 'x-admin-key': state.key }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data?.error || '목록을 불러오지 못했습니다.');
            err.status = res.status;
            throw err;
        }
        return data;
    }

    async function updateStatus(id, status) {
        const res = await fetch('/api/changpop-admin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-key': state.key
            },
            body: JSON.stringify({ id, status })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || '상태 변경에 실패했습니다.');
        return data;
    }

    function renderList(items) {
        if (!els.list) return;
        if (!Array.isArray(items) || !items.length) {
            els.list.innerHTML = '<li class="music-empty">표시할 신청 내역이 없습니다.</li>';
            if (els.count) els.count.textContent = '0건';
            return;
        }
        if (els.count) els.count.textContent = `${items.length}건`;
        els.list.innerHTML = items.map((item) => {
            const thumb = escapeHtml(item?.preview?.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`);
            const title = escapeHtml(item?.preview?.title || item.youtubeUrl || item.videoId || '제목 없음');
            const channel = escapeHtml(item?.preview?.channelTitle || '-');
            const message = item.message ? `<div class="changpop-admin-message">${escapeHtml(item.message)}</div>` : '';
            const url = escapeHtml(item.youtubeUrl || `https://www.youtube.com/watch?v=${item.videoId}`);
            return `
                <li class="changpop-admin-row" data-id="${escapeHtml(item.id || '')}">
                    <a class="changpop-admin-thumb" href="${url}" target="_blank" rel="noopener noreferrer">
                        <img src="${thumb}" alt="" loading="lazy" onerror="this.style.opacity=0.2">
                    </a>
                    <div class="changpop-admin-body">
                        <a class="changpop-admin-title" href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>
                        <div class="changpop-admin-meta">
                            <span>${channel}</span>
                            <span>${escapeHtml(item.submittedBy || '익명')}</span>
                            <span>${escapeHtml(formatDateTime(item.submittedAt))}</span>
                            <span class="changpop-admin-badge is-${escapeHtml(item.status || 'pending')}">${escapeHtml(statusLabel(item.status || 'pending'))}</span>
                        </div>
                        ${message}
                        <div class="changpop-admin-actions">
                            <button type="button" class="changpop-btn changpop-btn-primary" data-status="approved">승인</button>
                            <button type="button" class="changpop-btn changpop-btn-ghost" data-status="pending">보류</button>
                            <button type="button" class="changpop-btn changpop-btn-ghost" data-status="rejected">반려</button>
                        </div>
                    </div>
                </li>`;
        }).join('');
    }

    async function refreshList() {
        if (!state.key) return;
        showAuthMessage('목록을 불러오는 중입니다...', 'info');
        try {
            const data = await fetchList();
            renderList(data.submissions || []);
            if (els.card) els.card.hidden = false;
            showAuthMessage('');
        } catch (err) {
            if (err.status === 401) {
                sessionStorage.removeItem(STORAGE_KEY);
                state.key = '';
                if (els.card) els.card.hidden = true;
                showAuthMessage('관리자 키가 올바르지 않습니다.', 'error');
                return;
            }
            showAuthMessage(err.message || '목록을 불러오지 못했습니다.', 'error');
        }
    }

    function bindEvents() {
        if (els.authForm) {
            els.authForm.addEventListener('submit', (e) => {
                e.preventDefault();
                state.key = String(els.authInput ? els.authInput.value : '').trim();
                if (!state.key) {
                    showAuthMessage('관리자 키를 입력해 주세요.', 'error');
                    return;
                }
                sessionStorage.setItem(STORAGE_KEY, state.key);
                refreshList();
            });
        }
        if (els.filter) els.filter.addEventListener('change', refreshList);
        if (els.refresh) els.refresh.addEventListener('click', refreshList);
        if (els.list) {
            els.list.addEventListener('click', async (e) => {
                const btn = e.target.closest('[data-status]');
                const row = e.target.closest('[data-id]');
                if (!btn || !row) return;
                btn.disabled = true;
                try {
                    await updateStatus(row.getAttribute('data-id'), btn.getAttribute('data-status'));
                    await refreshList();
                } catch (err) {
                    showAuthMessage(err.message || '상태 변경에 실패했습니다.', 'error');
                } finally {
                    btn.disabled = false;
                }
            });
        }
    }

    function init() {
        mountHeader();
        bindEvents();
        if (state.key) {
            if (els.authInput) els.authInput.value = state.key;
            refreshList();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();