/* =========================================
   MyMaple v6 - Unified Info Pages Logic
   info.html + legacy wrappers(map/mob/npc/item)
   ========================================= */
(function () {
    const C = window.MyMapleCommon;
    const D = window.MyMapleData;

    function escapeHtml(s) { return C.escapeHtml(s); }
    function unesc(s) { return C.unescapeKoreanText(s); }

    function fmtNum(value) {
        if (value === undefined || value === null || value === '') return '';
        if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString('en-US');
        const norm = String(value).replace(/,/g, '').trim();
        if (/^-?\d+(?:\.\d+)?$/.test(norm)) return Number(norm).toLocaleString('en-US');
        return String(value);
    }

    function toFiniteNumber(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        const norm = String(value ?? '').replace(/,/g, '').trim();
        if (!norm || !/^-?\d+(?:\.\d+)?$/.test(norm)) return null;
        const num = Number(norm);
        return Number.isFinite(num) ? num : null;
    }

    function formatCompactKoreanNumber(value) {
        const num = toFiniteNumber(value);
        if (num === null) return null;
        const abs = Math.abs(num);
        const formatUnit = (divisor, suffix) => {
            const scaled = num / divisor;
            const options = Math.abs(scaled) >= 100 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 0, maximumFractionDigits: 1 };
            return `${scaled.toLocaleString('en-US', options)}${suffix}`;
        };
        if (abs >= 100000000) return formatUnit(100000000, '억');
        if (abs >= 10000) return formatUnit(10000, '만');
        return null;
    }

    function renderRichSpecValue(label, value) {
        const compact = formatCompactKoreanNumber(value);
        const rawText = fmtNum(value);
        if (compact) {
            return `<div class="spec spec-rich"><span>${escapeHtml(label)}</span><div class="spec-value"><b>${escapeHtml(compact)}</b><small>${escapeHtml(rawText)}</small></div></div>`;
        }
        return `<div class="spec spec-rich"><span>${escapeHtml(label)}</span><div class="spec-value"><b>${escapeHtml(rawText)}</b></div></div>`;
    }

    function formatBgmDisplayName(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        const parts = text.split('/').map(v => String(v || '').trim()).filter(Boolean);
        return parts.length ? parts[parts.length - 1] : text;
    }

    function getDataFields(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
        return Object.keys(obj)
            .filter(k => obj[k] !== null && obj[k] !== undefined && obj[k] !== '')
            .sort((a, b) => a.localeCompare(b, 'ko'));
    }

    const RAW_FIELD_LABELS = {
        sName: '이름',
        sMobType: '몬스터 타입',
        sFunc: '기능',
        sItemDesc: '아이템 설명',
        sArchiveText: '아카이브 설명',
        sArchiveDesc: '아카이브 설명',
        sArchiveregionDesc: '아카이브 설명',
        sArchiveRegionDesc: '아카이브 설명',
        sDesc: '설명',
        sDropList: '드롭 목록',
        nLevel: '레벨',
        nExp: '경험치',
        nMaxHP: '최대 HP',
        nMaxMP: '최대 MP',
        nPADamage: '물리공격',
        nMADamage: '마법공격',
        nPDDamage: '물리방어',
        nMDDamage: '마법방어',
        nPDRate: '물리방어율',
        nMDRate: '마법방어율',
        nAcc: '명중률',
        nEva: '회피율',
        nSpeed: '이동속도',
        nPushed: '넉백',
        nBoss: '보스 여부',
        nSummonType: '스폰 타입',
        nCategory: '카테고리',
        nBodyAttack: '접촉 데미지',
        MapData_sMapID: '맵 ID',
        MapData_sMapName: '맵 이름',
        MapData_sMapDesc: '맵 설명',
        MapData_sMapBGM: '맵 BGM',
        MapData_sLifeList: 'LIFE 목록'
    };

    function getRawFieldLabel(key) {
        return RAW_FIELD_LABELS[key] || null;
    }

    function formatFieldValue(value) {
        if (value === undefined || value === null || value === '') {
            return { text: '-', multiline: false, code: false };
        }
        if (typeof value === 'number' && Number.isFinite(value)) {
            return { text: fmtNum(value), multiline: false, code: false };
        }
        if (typeof value === 'string') {
            const unescaped = unesc(value).trim();
            const numeric = fmtNum(unescaped);
            const multiline = /\n|\r/.test(unescaped) || unescaped.length > 64 || /^[\[{]/.test(unescaped) || unescaped.includes(',');
            const code = /^[\[{]/.test(unescaped) || /^s[A-Z]/.test(unescaped) || /^n[A-Z]/.test(unescaped);
            return { text: numeric, multiline, code };
        }
        if (Array.isArray(value)) {
            const text = value.map(v => typeof v === 'object' ? JSON.stringify(v) : fmtNum(String(v))).join('\n');
            return { text, multiline: true, code: true };
        }
        if (typeof value === 'object') {
            return { text: JSON.stringify(value, null, 2), multiline: true, code: true };
        }
        return { text: String(value), multiline: false, code: false };
    }

    function renderFieldGrid(obj) {
        const fields = getDataFields(obj);
        if (!fields.length) return '<div class="info-list-empty">표시할 필드가 없습니다.</div>';
        return `
            <div class="raw-field-panel">
                <div class="raw-field-panel-head">
                    <div class="raw-field-panel-title">원본 필드 정리 보기</div>
                    <div class="raw-field-panel-sub">필드명과 값을 읽기 쉽게 재배치했습니다 · 총 ${fields.length}개</div>
                </div>
                <div class="raw-field-grid">${fields.map(k => {
                    const formatted = formatFieldValue(obj[k]);
                    const label = getRawFieldLabel(k);
                    return `
                        <article class="raw-field-card ${formatted.multiline ? 'is-wide' : ''}">
                            <div class="raw-field-head">
                                <div class="raw-field-name">${escapeHtml(label || k)}</div>
                                ${label ? `<code class="raw-field-key">${escapeHtml(k)}</code>` : ''}
                            </div>
                            <div class="raw-field-value ${formatted.multiline ? 'is-multiline' : ''} ${formatted.code ? 'is-code' : ''}">${escapeHtml(formatted.text)}</div>
                        </article>`;
                }).join('')}</div>
            </div>`;
    }

    function renderMapNameChip(mapEntry) {
        const pinType = Number(mapEntry?.pinType ?? mapEntry?.raw?.pinType ?? mapEntry?.raw?.data?.nPinType ?? mapEntry?.data?.nPinType ?? 0);
        const pinUrl = D.resolvePinDotPath(pinType);
        const fallbackPinUrl = D.resolvePinDotPath(0);
        const mapId = String(mapEntry?.id || '').trim();
        const mapName = unesc(mapEntry?.name || mapEntry?.mainName || mapId || '알 수 없는 맵');
        return `<a href="info.html?type=map&id=${escapeHtml(mapId)}" class="related-chip related-map-chip"><img src="${pinUrl}" alt="pin" onerror="if(this.src.indexOf('dot_0')===-1){this.src='${fallbackPinUrl}'}else{this.remove()}"><span>${escapeHtml(mapName)}</span></a>`;
    }

    function resolveItemDisplayName(data, fallbackId = '') {
        return unesc(data?.sFunc || data?.sName || data?.sItemName || data?.name || fallbackId || '알 수 없는 아이템');
    }

    function resolveItemTooltipDesc(data) {
        return unesc(data?.sItemDesc || data?.sDesc || '');
    }

    function renderDropItemIcon(itemId, itemName, itemDesc = '') {
        const cleanId = String(itemId || '').trim();
        const safeName = unesc(itemName || cleanId || '알 수 없는 아이템');
        const safeDesc = unesc(itemDesc || '');
        const imagePath = `${D.PATHS.ITEM}/${cleanId}/${cleanId}.png`;
        return `<a href="info.html?type=item&id=${escapeHtml(cleanId)}" class="wmx-drop-item info-drop-item" aria-label="${escapeHtml(safeName)}"><img src="${imagePath}" alt="${escapeHtml(safeName)}" loading="lazy" onerror="this.style.display='none'; this.parentElement.classList.add('no-image');"><div class="wmx-drop-item-tooltip"><strong>${escapeHtml(safeName)}</strong>${safeDesc ? `<span>${escapeHtml(safeDesc)}</span>` : ''}</div></a>`;
    }

    function renderArchiveSection(text, emptyText = '아직 등록된 아카이브 기록이 없습니다.') {
        return `<div class="info-section"><h4>아카이브</h4><div class="info-archive info-archive-theme"><div class="info-archive-theme-text">${escapeHtml(text || emptyText)}</div></div></div>`;
    }

    const worldMapHrefCache = new Map();

    function inferWorldType(mapEntry) {
        const folderPath = String(mapEntry?.raw?.folderPath || mapEntry?.folderPath || '').replace(/\\/g, '/');
        if (folderPath.includes('/GWorldMap')) return 'grandis';
        if (folderPath.includes('/MasteriaMap')) return 'masteria';
        if (folderPath.includes('/WorldMap')) return 'maple';

        const candidates = [
            mapEntry?.raw?.worldName,
            ...(Array.isArray(mapEntry?.chain) ? mapEntry.chain : [])
        ].map(v => String(v || '').trim()).filter(Boolean);

        if (candidates.some(text => text.includes('그란디스'))) return 'grandis';
        if (candidates.some(text => text.includes('마스테리아'))) return 'masteria';
        if (candidates.some(text => text.includes('메이플 월드'))) return 'maple';
        return '';
    }

    function buildWorldMapHref(mapEntry) {
        const folderPath = String(mapEntry?.raw?.folderPath || mapEntry?.folderPath || '').replace(/\\/g, '/');
        const mapId = String(mapEntry?.id || '').trim();
        if (!mapId) return '';
        const worldRoots = [
            { marker: '/WorldMap', type: 'maple' },
            { marker: '/GWorldMap', type: 'grandis' },
            { marker: '/MasteriaMap', type: 'masteria' }
        ];
        const matched = folderPath ? worldRoots.find(root => folderPath.includes(root.marker)) : null;
        const params = new URLSearchParams();
        if (matched) {
            const afterRoot = folderPath.split(matched.marker)[1] || '';
            const path = afterRoot.split('/').filter(Boolean).join('/');
            params.set('world', matched.type);
            if (path) params.set('path', path);
            params.set('mapId', mapId);
            return `world-map.html?${params.toString()}`;
        }
        const inferredWorldType = inferWorldType(mapEntry);
        if (!inferredWorldType) return '';
        params.set('world', inferredWorldType);
        params.set('mapId', mapId);
        return `world-map.html?${params.toString()}`;
    }

    async function resolveWorldMapHref(mapEntry) {
        const directHref = buildWorldMapHref(mapEntry);
        if (directHref) return directHref;
        const mapId = String(mapEntry?.id || '').trim();
        if (!mapId) return '';
        if (worldMapHrefCache.has(mapId)) return worldMapHrefCache.get(mapId) || '';

        const worldTypes = Array.isArray(D.ROOT_WORLD_MAPS)
            ? D.ROOT_WORLD_MAPS.map(root => root?.type).filter(Boolean)
            : ['maple', 'grandis', 'masteria'];

        let resolvedHref = '';
        for (const worldType of worldTypes) {
            try {
                const loaded = await D.loadAllMapsFromWorld(worldType);
                const found = (loaded?.maps || []).find(entry => String(entry?.id || '') === mapId);
                if (!found) continue;
                resolvedHref = buildWorldMapHref(found);
                if (resolvedHref) break;
            } catch (_) {}
        }

        worldMapHrefCache.set(mapId, resolvedHref || '');
        return resolvedHref || '';
    }

    const INFO_TYPES = {
        map: { key: 'map', label: 'MAP 정보', title: 'MAP 리스트', searchPlaceholder: '맵 이름·ID로 검색...', emptyEmoji: '', emptyMessage: '왼쪽 목록에서 맵을 선택하세요.' },
        mob: { key: 'mob', label: 'MOB 정보', title: 'MOB 리스트', searchPlaceholder: '몬스터 이름·ID로 검색...', emptyEmoji: '', emptyMessage: '왼쪽 목록에서 몬스터를 선택하세요.' },
        npc: { key: 'npc', label: 'NPC 정보', title: 'NPC 리스트', searchPlaceholder: 'NPC 이름·ID로 검색...', emptyEmoji: '', emptyMessage: '왼쪽 목록에서 NPC를 선택하세요.' },
        item: { key: 'item', label: 'ITEM 정보', title: 'ITEM 리스트', searchPlaceholder: '아이템 이름·ID로 검색...', emptyEmoji: '', emptyMessage: '왼쪽 목록에서 아이템을 선택하세요.' }
    };

    function getInfoType() {
        const type = new URL(location.href).searchParams.get('type');
        return INFO_TYPES[type] ? type : 'map';
    }

    function bindSearchAndFilter({ inputId, btnId, filter }) {
        const input = document.getElementById(inputId);
        const btn = document.getElementById(btnId);
        const apply = () => filter((input?.value || '').trim().toLowerCase());
        let t;
        input?.addEventListener('input', () => { clearTimeout(t); t = setTimeout(apply, 80); });
        input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
        btn?.addEventListener('click', apply);
    }

    function uniqueConsecutiveTexts(list) {
        const result = [];
        let prev = null;
        (list || []).forEach(value => {
            const text = String(value || '').trim();
            if (!text) return;
            if (text === prev) return;
            result.push(text);
            prev = text;
        });
        return result;
    }

    function buildMapDisplayChain(mapEntry) {
        const chain = Array.isArray(mapEntry?.chain) ? mapEntry.chain.slice() : [];
        const selectedMapName = mapEntry?.name || mapEntry?.mainName || mapEntry?.id || '';
        return uniqueConsecutiveTexts([...chain, selectedMapName]);
    }

    function renderEmptyDetail(mainEl, _emoji, message) {
        if (!mainEl) return;
        mainEl.innerHTML = `<div class="info-empty-state"><div>${escapeHtml(message)}</div></div>`;
    }

    function bindInfoBgmControls(scope = document) {
        scope.querySelectorAll('[data-bgm-action]').forEach(btn => {
            if (btn.dataset.boundBgm === '1') return;
            btn.dataset.boundBgm = '1';
            btn.addEventListener('click', () => {
                const action = btn.dataset.bgmAction;
                const bgmKey = btn.dataset.bgmKey || '';
                const displayName = btn.dataset.bgmName || '';
                if (!window.MyMapleBGM) return;
                window.MyMapleBGM.ensurePlayerUI?.();
                if (action === 'play') {
                    window.MyMapleBGM.playBgm?.(bgmKey, displayName, true);
                } else if (action === 'stop') {
                    window.MyMapleBGM.stopBgm?.();
                }
            });
        });
    }

    function showLoadingMessage(sidebar) {
        if (sidebar) sidebar.innerHTML = '<div class="info-list-empty">로딩 중...</div>';
    }

    function renderMissingInfoFile(sidebar, mainEl, fileLabel) {
        if (sidebar) sidebar.innerHTML = '<div class="info-list-empty">도감 데이터가 아직 생성되지 않았습니다.</div>';
        if (!mainEl) return;
        mainEl.innerHTML = `
            <div class="info-empty-state">
                <div style="font-weight:700;color:#fff;font-size:15px;">도감 데이터를 먼저 빌드해주세요</div>
                <div style="font-size:13px;color:#b6bcc6;line-height:1.7;max-width:520px;">
                    <code style="background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:6px;">MyMaple_PageInfo/InfoList/${escapeHtml(fileLabel)}</code> 파일이 존재하지 않습니다.<br>
                    <b>MyMaple_PageInfo/InfoList/build-info.bat</b> 를 실행해 전체 info 데이터를 생성하세요.
                </div>
            </div>`;
    }

    function syncCommonLayout(type) {
        const meta = INFO_TYPES[type] || INFO_TYPES.map;
        document.title = `${meta.label} — MyMaple`;
        const sidebarTitle = document.getElementById('info-sidebar-title');
        const input = document.getElementById('info-search-input');
        if (sidebarTitle) sidebarTitle.textContent = meta.title;
        if (input) input.placeholder = meta.searchPlaceholder;
        const mainEl = document.getElementById('info-detail');
        if (mainEl) mainEl.setAttribute('data-info-type', type);
        const mount = document.getElementById('header-mount');
        if (mount) {
            mount.innerHTML = C.renderSiteHeader(type, C.getInfoNavItems(type));
            C.bindHeaderOfflineLinks();
        }
    }

    function scrollSidebarToActiveItem(sidebar, behavior = 'smooth') {
        if (!sidebar) return;
        requestAnimationFrame(() => {
            const active = sidebar.querySelector('.info-list-item.active');
            if (!active) return;
            const targetTop = active.offsetTop - (sidebar.clientHeight / 2) + (active.clientHeight / 2);
            const nextTop = Math.max(0, targetTop);
            if (behavior === 'auto') {
                sidebar.scrollTop = nextTop;
            } else {
                sidebar.scrollTo({ top: nextTop, behavior });
            }
        });
    }

    function bindListClicks(sidebar, currentIdRef, getById, onSelect) {
        sidebar.querySelectorAll('.info-list-item').forEach(el => {
            el.addEventListener('click', () => {
                currentIdRef.value = el.dataset.id;
                sidebar.querySelectorAll('.info-list-item').forEach(n => n.classList.toggle('active', n.dataset.id === currentIdRef.value));
                scrollSidebarToActiveItem(sidebar, 'smooth');
                const entry = getById(currentIdRef.value);
                if (entry) onSelect(entry);
            });
        });
    }

    async function initMapInfoPage() {
        syncCommonLayout('map');
        const sidebar = document.getElementById('info-list');
        const counter = document.getElementById('info-count');
        const mainEl = document.getElementById('info-detail');
        showLoadingMessage(sidebar);

        const maps = await D.loadMapIndex();
        if (maps === null) return renderMissingInfoFile(sidebar, mainEl, 'MapList.json');
        if (!maps.length) {
            sidebar.innerHTML = '<div class="info-list-empty">데이터 없음</div>';
            return renderEmptyDetail(mainEl, '', '맵 데이터를 불러올 수 없습니다.');
        }

        maps.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
        counter.textContent = `${maps.length}개`;
        const currentIdRef = { value: null };

        function renderList(query) {
            const q = (query || '').trim().toLowerCase();

            const renderMapItems = (list) => list.map(m => {
                const pinType = Number(m.raw?.pinType ?? m.raw?.data?.nPinType ?? 0);
                const pinUrl = D.resolvePinDotPath(pinType);
                const fallbackPinUrl = D.resolvePinDotPath(0);
                return `
                <li class="info-list-item ${m.id === currentIdRef.value ? 'active' : ''}" data-id="${escapeHtml(m.id)}">
                    <div class="info-list-thumb"><img src="${pinUrl}" alt="pin" onerror="if(this.src.indexOf('dot_0')===-1){this.src='${fallbackPinUrl}'}else{this.parentElement.textContent=''}"></div>
                    <div class="info-list-text">
                        <div class="info-list-name">${escapeHtml(m.name || m.id)}</div>
                    </div>
                </li>`;
            }).join('');

            if (!q) {
                sidebar.innerHTML = renderMapItems(maps);
                bindListClicks(sidebar, currentIdRef, (id) => maps.find(x => x.id === id), renderDetail);
                if (currentIdRef.value) scrollSidebarToActiveItem(sidebar, 'auto');
                return;
            }

            const primaryMatches = maps.filter(m =>
                (m.name || '').toLowerCase().includes(q) ||
                (m.id || '').toLowerCase().includes(q)
            );
            const primaryIds = new Set(primaryMatches.map(m => m.id));
            const relatedMatches = maps.filter(m => {
                if (primaryIds.has(m.id)) return false;
                const chainText = (m.chain || []).join(' ').toLowerCase();
                const worldText = String(m.raw?.worldName || '').toLowerCase();
                return chainText.includes(q) || worldText.includes(q);
            });

            if (!primaryMatches.length && !relatedMatches.length) {
                sidebar.innerHTML = '<div class="info-list-empty">검색 결과가 없습니다. 다른 키워드로 시도해 보세요.</div>';
                return;
            }

            let html = '';
            if (primaryMatches.length) {
                html += `<li class="info-list-group-title">일치 결과</li>${renderMapItems(primaryMatches)}`;
            }
            if (relatedMatches.length) {
                html += `<li class="info-list-group-title">연관 경로</li>${renderMapItems(relatedMatches)}`;
            }
            sidebar.innerHTML = html;
            bindListClicks(sidebar, currentIdRef, (id) => maps.find(x => x.id === id), renderDetail);
            if (currentIdRef.value) scrollSidebarToActiveItem(sidebar, 'auto');
        }

        async function renderDetail(m) {
            const raw = m.raw || {};
            const data = raw.data || {};
            const lifeList = Array.isArray(m.lifeList) ? m.lifeList : [];
            const life = await D.loadLifeList(lifeList);
            const archiveText = unesc(m.desc || data.MapData_sMapDesc || data.sMapDesc || '');
            const bgmKey = m.bgm || data.MapData_sMapBGM || data.sMapBGM || '';
            const bgmDisplayName = formatBgmDisplayName(bgmKey);
            const bgmIcon = D.resolveBgmIconPath();
            const pinType = Number(raw.pinType ?? data.nPinType ?? 0);
            const pinUrl = D.resolvePinDotPath(pinType);
            const fallbackPinUrl = D.resolvePinDotPath(0);
            const worldMapHref = await resolveWorldMapHref(m);

            mainEl.innerHTML = `
                <div class="info-detail-hero">
                    <div class="info-detail-hero-img info-map-pin-hero">
                        <img class="info-map-pin-img" src="${pinUrl}" alt="map pin" onerror="if(this.src.indexOf('dot_0')===-1){this.src='${fallbackPinUrl}'}else{this.outerHTML=''}">
                    </div>
                    <div class="info-detail-hero-text">
                        <h2>${escapeHtml(m.name || m.id)}</h2>
                        <div class="tag-row">
                            <span class="id-tag">ID ${escapeHtml(m.id)}</span>
                            <span class="type-tag">${escapeHtml(raw.worldName || '')}</span>
                            ${m.isArchive ? '<span class="type-tag">아카이브</span>' : ''}
                        </div>
                        <div class="info-chain">${escapeHtml(buildMapDisplayChain(m).join(' › '))}</div>
                    </div>
                    ${worldMapHref ? `<div class="info-detail-actions info-detail-actions-top"><a class="info-world-link-btn" href="${worldMapHref}">World 보기</a></div>` : ''}
                </div>
                ${renderArchiveSection(archiveText, '등록된 아카이브 설명이 없습니다.')}
                <div class="info-section"><h4>BGM</h4>${bgmKey ? `<div class="info-bgm-card"><img src="${bgmIcon}" alt="bgm" onerror="this.style.display='none'"><div class="info-bgm-meta"><div><div class="bgm-name">${escapeHtml(bgmDisplayName || bgmKey)}</div><div class="bgm-sub">${escapeHtml((m.mainName || m.name || m.id || ''))}</div></div><div class="info-bgm-actions"><button type="button" class="info-bgm-btn play" data-bgm-action="play" data-bgm-key="${escapeHtml(bgmKey)}" data-bgm-name="${escapeHtml(m.name || m.mainName || m.id || bgmKey)}">재생</button><button type="button" class="info-bgm-btn stop" data-bgm-action="stop">정지</button></div></div></div>` : '<div class="info-list-empty">이 맵에 등록된 BGM 정보가 없습니다.</div>'}</div>
                <div class="info-section"><h4>LIFE (몬스터 / NPC)</h4><div class="info-life-grid" id="map-life-grid"></div></div>
            `;

            bindInfoBgmControls(mainEl);

            const grid = document.getElementById('map-life-grid');
            const all = [...(life.mobs || []), ...(life.npcs || [])];
            if (!all.length) {
                grid.innerHTML = '<div class="info-list-empty">이 맵에 등록된 몬스터 / NPC 정보가 없습니다.</div>';
            } else {
                grid.innerHTML = all.map(entity => `
                    <a class="info-life-card" href="info.html?type=${entity.type === 'mob' ? 'mob' : 'npc'}&id=${escapeHtml(entity.id)}">
                        <div class="life-thumb"><img src="${entity.imagePath}" alt="" onerror="this.style.display='none'"></div>
                        <div class="life-name">${escapeHtml(unesc(entity.data?.sName || entity.id))}</div>
                        <div class="life-id">${escapeHtml(entity.type.toUpperCase())} · ${escapeHtml(entity.id)}</div>
                    </a>`).join('');
            }
        }

        renderList('');
        renderEmptyDetail(mainEl, '', '왼쪽 목록에서 맵을 선택하세요.');
        bindSearchAndFilter({ inputId: 'info-search-input', btnId: 'info-search-btn', filter: renderList });

        const targetId = new URL(location.href).searchParams.get('id');
        if (targetId) {
            const found = maps.find(m => m.id === targetId);
            if (found) {
                currentIdRef.value = found.id;
                renderList('');
                renderDetail(found);
                scrollSidebarToActiveItem(sidebar, 'smooth');
            }
        }
    }

    async function initMobInfoPage() {
        syncCommonLayout('mob');
        const sidebar = document.getElementById('info-list');
        const counter = document.getElementById('info-count');
        const mainEl = document.getElementById('info-detail');
        showLoadingMessage(sidebar);

        const index = await D.loadMobIndex();
        if (index === null) return renderMissingInfoFile(sidebar, mainEl, 'MobList.json');
        if (!index.length) {
            sidebar.innerHTML = '<div class="info-list-empty">등록된 몬스터가 없습니다.</div>';
            return renderEmptyDetail(mainEl, '', '몬스터 데이터가 없습니다.');
        }

        index.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
        counter.textContent = `${index.length}개`;
        const currentIdRef = { value: null };

        function renderList(query) {
            const q = (query || '').trim().toLowerCase();
            const filtered = q ? index.filter(m => (m.name || '').toLowerCase().includes(q) || (m.id || '').toLowerCase().includes(q)) : index;
            if (!filtered.length) {
                sidebar.innerHTML = '<div class="info-list-empty">검색 결과가 없습니다. 다른 키워드로 시도해 보세요.</div>';
                return;
            }
            sidebar.innerHTML = filtered.map(m => `
                <li class="info-list-item ${m.id === currentIdRef.value ? 'active' : ''}" data-id="${escapeHtml(m.id)}">
                    <div class="info-list-thumb"><img src="${D.PATHS.MOB}/${m.id}/${m.id}.png" onerror="this.style.display='none'"></div>
                    <div class="info-list-text">
                        <div class="info-list-name">${escapeHtml(unesc(m.name) || m.id)}</div>
                    </div>
                </li>`).join('');
            bindListClicks(sidebar, currentIdRef, (id) => index.find(x => x.id === id), renderDetail);
            if (currentIdRef.value) scrollSidebarToActiveItem(sidebar, 'auto');
        }

        async function renderDetail(mEntry) {
            const raw = mEntry.raw || {};
            const d = raw.data || (await D.loadMob(mEntry.id))?.data || {};
            const archive = unesc(
                d.sArchiveregionDesc || d.sArchiveRegionDesc || d.sArchiveText || d.sArchiveDesc || d.sDesc ||
                raw.sArchiveregionDesc || raw.sArchiveRegionDesc || raw.sArchiveText || raw.sArchiveDesc || raw.sDesc ||
                raw.ArchiveRegionDesc || raw.archiveText || raw.archiveDesc || ''
            );
            const specs = [
                ['레벨', d.nLevel], ['HP', d.nMaxHP], ['EXP', d.nExp], ['물리공격', d.nPADamage], ['물리방어', d.nPDDamage],
                ['물리방어율', d.nPDRate], ['마법공격', d.nMADamage], ['마법방어', d.nMDDamage], ['마법방어율', d.nMDRate],
                ['명중률', d.nAcc], ['회피율', d.nEva], ['이동속도', d.nSpeed], ['넉백', d.nPushed], ['스폰 타입', d.nSummonType]
            ].filter(([, v]) => v !== undefined && v !== null && v !== '');
            const appearMaps = raw.appearInMaps || [];
            const dropItems = raw.dropItemIds || [];
            const itemIndex = await D.loadItemIndex();
            const itemMetaMap = new Map((itemIndex || []).map(it => [it.id, { name: unesc(it.raw?.sFunc || it.name || it.id), desc: '' }]));
            const dropItemEntries = await Promise.all(dropItems.map(async (id) => {
                const cleanId = String(id || '').padStart(7, '0');
                const itemDetail = await D.loadItem(cleanId);
                const detailData = itemDetail?.data || null;
                const fallbackMeta = itemMetaMap.get(cleanId) || itemMetaMap.get(String(id)) || null;
                const name = resolveItemDisplayName(detailData, fallbackMeta?.name || cleanId);
                const desc = resolveItemTooltipDesc(detailData) || fallbackMeta?.desc || '';
                return { id: cleanId, name, desc };
            }));
            mainEl.innerHTML = `
                <div class="info-detail-hero">
                    <div class="info-detail-hero-img"><img src="${raw.imagePath || `${D.PATHS.MOB}/${mEntry.id}/${mEntry.id}.png`}" alt="" onerror="this.style.display='none'"></div>
                    <div class="info-detail-hero-text">
                        <h2>${escapeHtml(unesc(d.sName || mEntry.id))}</h2>
                        <div class="tag-row">
                            <span class="id-tag">ID ${escapeHtml(mEntry.id)}</span>
                            <span class="type-tag">${escapeHtml(unesc(d.sMobType || '몬스터'))}</span>
                            ${Number(d.nBoss) === 1 ? '<span class="boss-tag">BOSS</span>' : ''}
                        </div>
                    </div>
                </div>
                ${renderArchiveSection(archive, '등록된 아카이브 설명이 없습니다.')}
                ${specs.length ? `<div class="info-section"><h4>스펙</h4><div class="info-spec-grid info-spec-grid-rich">${specs.map(([k, v]) => renderRichSpecValue(k, v)).join('')}</div></div>` : ''}
                ${appearMaps.length ? `<div class="info-section"><h4>등장 맵</h4><div class="info-related-map-wrap">${appearMaps.map(renderMapNameChip).join('')}</div></div>` : ''}
                <div class="info-section"><h4>드랍 아이템</h4>${dropItemEntries.length ? `<div class="wmx-drop-item-grid info-drop-item-grid">${dropItemEntries.map(item => renderDropItemIcon(item.id, item.name, item.desc)).join('')}</div>` : `<div class="info-list-empty">이 몬스터의 드랍 아이템 정보가 없습니다.</div>`}</div>
            `;
        }

        renderList('');
        renderEmptyDetail(mainEl, '', '왼쪽 목록에서 몬스터를 선택하세요.');
        bindSearchAndFilter({ inputId: 'info-search-input', btnId: 'info-search-btn', filter: renderList });

        const targetId = new URL(location.href).searchParams.get('id');
        if (targetId) {
            const found = index.find(m => m.id === targetId.padStart(7, '0'));
            if (found) {
                currentIdRef.value = found.id;
                renderList('');
                renderDetail(found);
                scrollSidebarToActiveItem(sidebar, 'smooth');
            }
        }
    }

    async function initNpcInfoPage() {
        syncCommonLayout('npc');
        const sidebar = document.getElementById('info-list');
        const counter = document.getElementById('info-count');
        const mainEl = document.getElementById('info-detail');
        showLoadingMessage(sidebar);

        const index = await D.loadNpcIndex();
        if (index === null) return renderMissingInfoFile(sidebar, mainEl, 'NpcList.json');
        if (!index.length) {
            sidebar.innerHTML = '<div class="info-list-empty">등록된 NPC가 없습니다.</div>';
            return renderEmptyDetail(mainEl, '', 'NPC 데이터가 없습니다.');
        }

        index.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
        counter.textContent = `${index.length}개`;
        const currentIdRef = { value: null };

        function renderList(query) {
            const q = (query || '').trim().toLowerCase();
            const filtered = q ? index.filter(m => (m.name || '').toLowerCase().includes(q) || (m.id || '').toLowerCase().includes(q)) : index;
            if (!filtered.length) {
                sidebar.innerHTML = '<div class="info-list-empty">검색 결과가 없습니다. 다른 키워드로 시도해 보세요.</div>';
                return;
            }
            sidebar.innerHTML = filtered.map(m => `
                <li class="info-list-item ${m.id === currentIdRef.value ? 'active' : ''}" data-id="${escapeHtml(m.id)}">
                    <div class="info-list-thumb"><img src="${D.PATHS.NPC}/${m.id}/${m.id}.png" onerror="this.style.display='none'"></div>
                    <div class="info-list-text"><div class="info-list-name">${escapeHtml(unesc(m.name) || m.id)}</div></div>
                </li>`).join('');
            bindListClicks(sidebar, currentIdRef, (id) => index.find(x => x.id === id), renderDetail);
            if (currentIdRef.value) scrollSidebarToActiveItem(sidebar, 'auto');
        }

        async function renderDetail(nEntry) {
            const raw = nEntry.raw || {};
            const d = raw.data || (await D.loadNpc(nEntry.id))?.data || {};
            const archive = unesc(d.sArchiveregionDesc || d.sArchiveRegionDesc || d.sArchiveText || d.sArchiveDesc || d.sDesc || '');
            const dialogs = [];
            Object.keys(d).forEach(k => { if ((/^nN\d+$/.test(k) || /^nD\d+$/.test(k) || /^sS\d+$/.test(k)) && d[k]) dialogs.push({ key: k, value: d[k] }); });
            const appearMaps = raw.appearInMaps || [];
            mainEl.innerHTML = `
                <div class="info-detail-hero">
                    <div class="info-detail-hero-img"><img src="${raw.imagePath || `${D.PATHS.NPC}/${nEntry.id}/${nEntry.id}.png`}" alt="" onerror="this.style.display='none'"></div>
                    <div class="info-detail-hero-text">
                        <h2>${escapeHtml(unesc(d.sName || nEntry.id))}</h2>
                        <div class="tag-row"><span class="id-tag">ID ${escapeHtml(nEntry.id)}</span><span class="type-tag">NPC</span></div>
                    </div>
                </div>
                ${renderArchiveSection(archive, '등록된 아카이브 설명이 없습니다.')}
                ${d.sFunc ? `<div class="info-section"><h4>역할</h4><div class="info-archive">${escapeHtml(unesc(d.sFunc))}</div></div>` : ''}
                ${appearMaps.length ? `<div class="info-section"><h4>등장 맵</h4><div class="info-related-map-wrap">${appearMaps.map(renderMapNameChip).join('')}</div></div>` : ''}
                ${dialogs.length ? `<div class="info-section"><h4>대사</h4><div class="info-archive">${dialogs.map(x => `<div><b style="color:#ffb04d">${escapeHtml(x.key)}</b> · ${escapeHtml(unesc(x.value))}</div>`).join('')}</div></div>` : ''}
            `;
        }

        renderList('');
        renderEmptyDetail(mainEl, '', '왼쪽 목록에서 NPC를 선택하세요.');
        bindSearchAndFilter({ inputId: 'info-search-input', btnId: 'info-search-btn', filter: renderList });

        const targetId = new URL(location.href).searchParams.get('id');
        if (targetId) {
            const found = index.find(m => m.id === targetId.padStart(7, '0'));
            if (found) {
                currentIdRef.value = found.id;
                renderList('');
                renderDetail(found);
                scrollSidebarToActiveItem(sidebar, 'smooth');
            }
        }
    }

    async function initItemInfoPage() {
        syncCommonLayout('item');
        const sidebar = document.getElementById('info-list');
        const counter = document.getElementById('info-count');
        const mainEl = document.getElementById('info-detail');
        showLoadingMessage(sidebar);

        const index = await D.loadItemIndex();
        if (index === null) return renderMissingInfoFile(sidebar, mainEl, 'ItemList.json');
        if (!index.length) {
            sidebar.innerHTML = '<div class="info-list-empty">등록된 아이템이 없습니다.</div>';
            return renderEmptyDetail(mainEl, '', '아이템 데이터가 없습니다.');
        }

        counter.textContent = `${index.length}개`;
        const currentIdRef = { value: null };

        if (sidebar) sidebar.innerHTML = '<div class="info-list-empty">아이템 이름 정리 중...</div>';
        const BATCH = 32;
        for (let i = 0; i < index.length; i += BATCH) {
            const batch = index.slice(i, i + BATCH);
            const resolvedBatch = await Promise.all(batch.map(async (m) => {
                const itemDetail = await D.loadItem(m.id);
                const displayName = resolveItemDisplayName(itemDetail?.data || m.raw || m, m.id);
                return { entry: m, displayName };
            }));
            resolvedBatch.forEach(({ entry, displayName }) => {
                entry.displayName = displayName;
                entry.searchName = String(displayName || '').toLowerCase();
            });
        }

        index.sort((a, b) => (a.displayName || a.name || '').localeCompare(b.displayName || b.name || '', 'ko'));

        function renderItemListHtml(list) {
            return list.map(m => `
                <li class="info-list-item ${m.id === currentIdRef.value ? 'active' : ''}" data-id="${escapeHtml(m.id)}">
                    <div class="info-list-thumb"><img src="${D.PATHS.ITEM}/${m.id}/${m.id}.png" onerror="this.style.display='none'"></div>
                    <div class="info-list-text"><div class="info-list-name">${escapeHtml(m.displayName || m.name || m.id)}</div></div>
                </li>`).join('');
        }

        async function renderList(query) {
            const q = (query || '').trim().toLowerCase();
            const filtered = q ? index.filter(m => (m.searchName || String(m.displayName || m.name || '').toLowerCase()).includes(q) || (m.id || '').toLowerCase().includes(q)) : index;
            if (!filtered.length) {
                sidebar.innerHTML = '<div class="info-list-empty">검색 결과가 없습니다. 다른 키워드로 시도해 보세요.</div>';
                return;
            }
            sidebar.innerHTML = renderItemListHtml(filtered);
            bindListClicks(sidebar, currentIdRef, (id) => index.find(x => x.id === id), renderDetail);
            if (currentIdRef.value) scrollSidebarToActiveItem(sidebar, 'auto');
        }

        async function renderDetail(iEntry) {
            const raw = iEntry.raw || {};
            const d = raw.data || (await D.loadItem(iEntry.id))?.data || {};
            const itemDisplayName = resolveItemDisplayName(d, iEntry.id);
            const droppedByMobIds = raw.droppedByMobIds || [];
            const mobIndex = await D.loadMobIndex();
            const mobNameMap = new Map((mobIndex || []).map(m => [m.id, unesc(m.name || m.id)]));
            const droppedByMobs = await Promise.all(droppedByMobIds.map(async (id) => {
                const cleanId = String(id || '').padStart(7, '0');
                const mobDetail = await D.loadMob(cleanId);
                const mobName = unesc(mobDetail?.data?.sName || mobNameMap.get(cleanId) || cleanId);
                return {
                    id: cleanId,
                    name: mobName,
                    imagePath: mobDetail?.imagePath || `${D.PATHS.MOB}/${cleanId}/${cleanId}.png`
                };
            }));
            mainEl.innerHTML = `
                <div class="info-detail-hero">
                    <div class="info-detail-hero-img"><img src="${raw.imagePath || `${D.PATHS.ITEM}/${iEntry.id}/${iEntry.id}.png`}" alt="" onerror="this.style.display='none'"></div>
                    <div class="info-detail-hero-text">
                        <h2>${escapeHtml(itemDisplayName)}</h2>
                        <div class="tag-row"><span class="id-tag">ID ${escapeHtml(iEntry.id)}</span><span class="type-tag">ITEM</span></div>
                    </div>
                </div>
                ${d.sItemDesc ? `<div class="info-section"><h4>설명</h4><div class="info-archive">${escapeHtml(unesc(d.sItemDesc))}</div></div>` : ''}
                <div class="info-section"><h4>드랍 몬스터</h4>${droppedByMobs.length ? `<div class="info-life-grid info-drop-mob-grid">${droppedByMobs.map(mob => `<a class="info-life-card" href="info.html?type=mob&id=${escapeHtml(mob.id)}"><div class="life-thumb"><img src="${mob.imagePath}" alt="" onerror="this.style.display='none'"></div><div class="life-name">${escapeHtml(mob.name)}</div></a>`).join('')}</div>` : `<div class="info-list-empty">이 아이템을 드랍하는 몬스터 정보가 없습니다.</div>`}</div>
            `;
        }

        renderList('');
        renderEmptyDetail(mainEl, '', '왼쪽 목록에서 아이템을 선택하세요.');
        bindSearchAndFilter({ inputId: 'info-search-input', btnId: 'info-search-btn', filter: renderList });

        const targetId = new URL(location.href).searchParams.get('id');
        if (targetId) {
            const found = index.find(m => m.id === targetId.padStart(7, '0'));
            if (found) {
                currentIdRef.value = found.id;
                renderList('');
                renderDetail(found);
                scrollSidebarToActiveItem(sidebar, 'smooth');
            }
        }
    }

    function initInfoPageFromQuery() {
        if ('scrollRestoration' in history) {
            history.scrollRestoration = 'manual';
        }
        window.scrollTo(0, 0);
        const type = getInfoType();
        if (type === 'mob') return initMobInfoPage();
        if (type === 'npc') return initNpcInfoPage();
        if (type === 'item') return initItemInfoPage();
        return initMapInfoPage();
    }

    window.MyMapleInfoPages = { initMapInfoPage, initMobInfoPage, initNpcInfoPage, initItemInfoPage, initInfoPageFromQuery };
})();
