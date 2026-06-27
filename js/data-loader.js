/* =========================================
   MyMaple v6 - Data Loader
   MyMaple_PageInfo 폴더의 새 JSON 명세 (V2) 대응
   ========================================= */

const PATHS = {
    ROOT: 'MyMaple_PageInfo',
    WORLD: 'MyMaple_PageInfo/World',
    MOB: 'MyMaple_PageInfo/Mob',
    NPC: 'MyMaple_PageInfo/Npc',
    ITEM: 'MyMaple_PageInfo/Item',
    MAP_MARK: 'MyMaple_PageInfo/MapMark',
    MAP_BGM: 'MyMaple_PageInfo/MapBGM',
    MAP_PIN: 'MyMaple_PageInfo/Special_Image/Map_Pin',
    HOME_THEME: 'MyMaple_PageInfo/Special_Image/HomePage_Theme_Image',
    MOB_NPC_ICON: 'MyMaple_PageInfo/Special_Image/Mob_Npc_Icon',
    ARCHIVE: 'MyMaple_PageInfo/Archive',
    SPECIAL_IMG: 'MyMaple_PageInfo/Special_Image',
    INFO: 'MyMaple_PageInfo/InfoList'
};

const AVAILABLE_PIN_DOTS = new Set([0, 1, 2, 3, 8, 9, 10, 11, 12, 28, 29, 47, 48, 49]);

const _cache = {
    json: new Map(),
    pendingFetch: new Map()
};

function normalizeSegment(segment) {
    try {
        return String(segment).normalize('NFC');
    } catch (_) {
        return String(segment);
    }
}

function normalizeWebPath(path) {
    if (!path) return path;
    const normalized = String(path)
        .replace(/\\/g, '/')
        .split('/')
        .map(normalizeSegment)
        .join('/');
    return normalized.replace(/(?<!:)\/+/g, '/');
}

async function fetchJSON(url) {
    const normalizedUrl = normalizeWebPath(url);
    if (_cache.json.has(normalizedUrl)) return _cache.json.get(normalizedUrl);
    if (_cache.pendingFetch.has(normalizedUrl)) return _cache.pendingFetch.get(normalizedUrl);

    const promise = (async () => {
        try {
            const res = await fetch(normalizedUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            const cleaned = text.replace(/^\uFEFF/, '');
            const data = JSON.parse(cleaned);
            _cache.json.set(normalizedUrl, data);
            return data;
        } catch (err) {
            console.warn(`[데이터 로드 실패] ${normalizedUrl}`, err.message);
            return null;
        } finally {
            _cache.pendingFetch.delete(normalizedUrl);
        }
    })();

    _cache.pendingFetch.set(normalizedUrl, promise);
    return promise;
}

async function fetchJSONRobust(urlCandidates) {
    const normalizedCandidates = [...new Set((urlCandidates || []).map(normalizeWebPath).filter(Boolean))];
    for (const url of normalizedCandidates) {
        if (_cache.json.has(url)) {
            const cached = _cache.json.get(url);
            if (cached !== null) return { data: cached, url };
        }
        try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const text = await res.text();
            const cleaned = text.replace(/^\uFEFF/, '');
            const data = JSON.parse(cleaned);
            _cache.json.set(url, data);
            return { data, url };
        } catch (_) {}
    }
    return { data: null, url: null };
}

function buildUrlCandidates(folderPath, fileName) {
    const cleanFolder = normalizeWebPath(folderPath);
    const cleanFile = normalizeSegment(fileName);
    const candidates = [];
    candidates.push(`${cleanFolder}/${encodeURIComponent(cleanFile)}`);
    candidates.push(`${cleanFolder}/${encodeURI(cleanFile)}`);
    candidates.push(`${cleanFolder}/${cleanFile}`);
    try {
        const nfc = cleanFile.normalize('NFC');
        if (nfc !== cleanFile) candidates.push(`${cleanFolder}/${encodeURIComponent(nfc)}`);
    } catch (_) {}
    try {
        const nfd = cleanFile.normalize('NFD');
        if (nfd !== cleanFile) candidates.push(`${cleanFolder}/${encodeURIComponent(nfd)}`);
    } catch (_) {}
    return [...new Set(candidates.map(normalizeWebPath))];
}

function winPathToRelative(winPath) {
    if (!winPath || typeof winPath !== 'string') return null;
    const normalized = String(winPath).replace(/\\/g, '/');
    const match = normalized.match(/(?:[A-Za-z]:)?\/?.*?(MyMaple_PageInfo\/.*)$/i);
    if (match && match[1]) return normalizeWebPath(match[1]);
    const matchLegacy = normalized.match(/(?:[A-Za-z]:)?\/?.*?(imagefile\/.*)$/i);
    if (matchLegacy && matchLegacy[1]) return normalizeWebPath(matchLegacy[1]);
    return normalizeWebPath(normalized.replace(/^([A-Za-z]:)?\/+/, ''));
}

const HOME_THEME_JSON = `${PATHS.HOME_THEME}/MainPage.json`;

async function loadMainPageData() {
    const data = await fetchJSON(HOME_THEME_JSON);
    if (!data) return null;
    return {
        mainTitle: data.MainPageTitle || 'MY MAPLE',
        mainDesc: data.MainPageDesc || '나만의 작은 메이플스토리에 대한 이야기',
        themes: (data.MainPageListDate || []).map(t => ({
            ...t,
            imageUrl: normalizeWebPath(`${PATHS.HOME_THEME}/${t.sImagePath}`)
        })),
        externalLinks: data.External_link_site || []
    };
}

const ROOT_WORLD_MAPS = [
    {
        id: 'WorldMap',
        name: '메이플 월드',
        folder: 'WorldMap',
        type: 'maple',
        archiveImagePath: `${PATHS.ARCHIVE}/WorldMap.png`,
        bOnline: true
    },
    {
        id: 'GWorldMap',
        name: '그란디스',
        folder: 'GWorldMap',
        type: 'grandis',
        archiveImagePath: `${PATHS.ARCHIVE}/GWorldMap.png`,
        bOnline: true
    },
    {
        id: 'MasteriaMap',
        name: '마스테리아',
        folder: 'MasteriaMap',
        type: 'masteria',
        archiveImagePath: null,
        bOnline: false
    }
];

async function loadRootWorld(worldType) {
    const root = ROOT_WORLD_MAPS.find(w => w.type === worldType);
    if (!root) return null;

    const folderPath = normalizeWebPath(`${PATHS.WORLD}/${root.folder}`);
    const fileName = `${root.id}.json`;
    const candidates = [
        normalizeWebPath(`${folderPath}/${fileName}`),
        ...buildUrlCandidates(folderPath, fileName)
    ];
    const { data, url } = await fetchJSONRobust(candidates);
    if (!data) {
        console.error(`[루트 월드 로드 실패] ${root.name}`, candidates);
        return null;
    }
    console.log(`[루트 월드 로드] ${root.name} via ${url}`);
    return {
        ...root,
        data,
        folderPath,
        worldImagePath: normalizeWebPath(`${folderPath}/${root.id}.png`),
        archiveImageRel: data.sWorldArchiveMapImagePath
            ? winPathToRelative(data.sWorldArchiveMapImagePath)
            : root.archiveImagePath,
        archiveName: data.sWorldArchiveMapName,
        archiveDesc: data.sWorldArchiveMapDesc
    };
}

async function loadLinkChildMap(parentFolderPath, linkEntry) {
    const folderPath = normalizeWebPath(`${parentFolderPath}/${linkEntry.sLinkMapID}`);
    const fileName = `${linkEntry.sLinkMapID}.json`;
    const candidates = [
        normalizeWebPath(`${folderPath}/${fileName}`),
        ...buildUrlCandidates(folderPath, fileName)
    ];
    const { data, url } = await fetchJSONRobust(candidates);
    if (!data) {
        console.warn(`[자식 LinkMap 로드 실패] ${linkEntry.sLinkMapID} (${linkEntry.sToolTip})`);
    }
    return {
        entry: linkEntry,
        data,
        folderPath,
        worldImagePath: normalizeWebPath(`${folderPath}/${linkEntry.sLinkMapID}.png`),
        jsonUrl: url,
        archiveImageRel: data?.sWorldArchiveMapImagePath
            ? winPathToRelative(data.sWorldArchiveMapImagePath)
            : null,
        archiveName: data?.sWorldArchiveMapName || null,
        archiveDesc: data?.sWorldArchiveMapDesc || null
    };
}

function parseLifeListItem(token) {
    if (!token || typeof token !== 'string') return null;
    const [type, id] = token.split(':');
    return { type, id };
}

async function loadMob(id) {
    const cleanId = normalizeSegment(id);
    const data = await fetchJSON(`${PATHS.MOB}/${cleanId}/${cleanId}.json`);
    return data ? {
        id: cleanId,
        type: 'mob',
        data,
        imagePath: normalizeWebPath(`${PATHS.MOB}/${cleanId}/${cleanId}.png`)
    } : null;
}

async function loadNpc(id) {
    const cleanId = normalizeSegment(id);
    let data = await fetchJSON(`${PATHS.NPC}/${cleanId}/${cleanId}.json`);
    if (!data) data = await fetchJSON(`${PATHS.NPC}/${cleanId}/.json`);
    return data ? {
        id: cleanId,
        type: 'npc',
        data,
        imagePath: normalizeWebPath(`${PATHS.NPC}/${cleanId}/${cleanId}.png`)
    } : null;
}

async function loadItem(id) {
    const cleanId = normalizeSegment(id);
    const data = await fetchJSON(`${PATHS.ITEM}/${cleanId}/${cleanId}.json`);
    return data ? {
        id: cleanId,
        type: 'item',
        data,
        imagePath: normalizeWebPath(`${PATHS.ITEM}/${cleanId}/${cleanId}.png`)
    } : null;
}

async function loadLifeList(lifeList) {
    if (!Array.isArray(lifeList) || lifeList.length === 0) {
        return { mobs: [], npcs: [] };
    }
    const tasks = lifeList.map(token => {
        const parsed = parseLifeListItem(token);
        if (!parsed) return Promise.resolve(null);
        if (parsed.type === 'm') return loadMob(parsed.id);
        if (parsed.type === 'n') return loadNpc(parsed.id);
        return Promise.resolve(null);
    });
    const results = await Promise.all(tasks);
    return {
        mobs: results.filter(r => r && r.type === 'mob'),
        npcs: results.filter(r => r && r.type === 'npc')
    };
}

function resolveBgmPath(bgmKey) {
    if (!bgmKey) return null;
    const trackName = normalizeSegment(bgmKey.split('/').pop());
    return normalizeWebPath(`${PATHS.MAP_BGM}/${trackName}.mp3`);
}

function resolveBgmIconPath() {
    return normalizeWebPath(`${PATHS.SPECIAL_IMG}/Music_Image/BGM_Icon.png`);
}

function resolveMapMarkPath(markKey) {
    if (!markKey) return null;
    return normalizeWebPath(`${PATHS.MAP_MARK}/${normalizeSegment(markKey)}.png`);
}

function resolvePinDotPath(nPinType) {
    const n = (typeof nPinType === 'number' && AVAILABLE_PIN_DOTS.has(nPinType)) ? nPinType : 0;
    return normalizeWebPath(`${PATHS.MAP_PIN}/dot_${n}.png`);
}

function resolveClickPosPath() {
    return normalizeWebPath(`${PATHS.MAP_PIN}/ClickPos.png`);
}

function resolveMobIconPath() {
    return normalizeWebPath(`${PATHS.MOB_NPC_ICON}/Mob.png`);
}

function resolveNpcIconPath() {
    return normalizeWebPath(`${PATHS.MOB_NPC_ICON}/Npc.png`);
}

function resolveEntityIcon(kind) {
    if (kind === 'mob') return resolveMobIconPath();
    if (kind === 'npc') return resolveNpcIconPath();
    return null;
}

function resolveArchiveImagePath(winPath) {
    return winPathToRelative(winPath);
}

function pinPointToPercent(point, imgWidth, imgHeight) {
    if (!point || typeof point.x !== 'number') return { left: 50, top: 50 };
    const left = ((point.x + imgWidth / 2) / imgWidth) * 100;
    const top = ((point.y + imgHeight / 2) / imgHeight) * 100;
    return {
        left: Math.max(2, Math.min(98, left)),
        top: Math.max(2, Math.min(98, top))
    };
}

async function loadIndexList(path) {
    const data = await fetchJSON(path);
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.list)) return data.list;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.MobList)) return data.MobList;
    if (Array.isArray(data.NpcList)) return data.NpcList;
    if (Array.isArray(data.ItemList)) return data.ItemList;
    if (Array.isArray(data.MapList)) return data.MapList;
    if (data && typeof data === 'object') {
        const firstArr = Object.values(data).find(v => Array.isArray(v));
        if (firstArr) return firstArr;
    }
    return [];
}

/* ---------- 자동 인덱스 수집 (월드 재귀 스캔) ---------- */
const _autoIndexCache = { promise: null, value: null };

function _padId(value) {
    const text = String(value ?? '').trim();
    if (!text || text === '0') return '';
    if (/^\d+$/.test(text)) return text.padStart(7, '0');
    return text;
}

function _collectIdsFromLife(lifeList, mobSet, npcSet) {
    if (!Array.isArray(lifeList)) return;
    lifeList.forEach(token => {
        if (typeof token !== 'string') return;
        const [kind, id] = token.split(':');
        const padded = _padId(id);
        if (!padded) return;
        if (kind === 'm') mobSet.add(padded);
        else if (kind === 'n') npcSet.add(padded);
    });
}

function _collectItemIdsFromDropList(rawDropList, itemSet) {
    if (rawDropList === undefined || rawDropList === null || rawDropList === '') return;
    const push = (raw) => {
        const text = String(raw ?? '').trim();
        if (!text) return;
        const matches = text.match(/\d{4,}/g);
        if (matches) matches.forEach(m => { const p = _padId(m); if (p) itemSet.add(p); });
    };
    const visit = (value) => {
        if (value === undefined || value === null || value === '') return;
        if (Array.isArray(value)) { value.forEach(visit); return; }
        if (typeof value === 'number') { push(Math.trunc(value)); return; }
        if (typeof value === 'object') {
            const candidate = value.id ?? value.itemId ?? value.itemID ?? value.nItemID ?? value.sItemID ?? value.sItemId ?? value.value;
            if (candidate !== undefined && candidate !== null && candidate !== '') push(candidate);
            else Object.values(value).forEach(visit);
            return;
        }
        push(value);
    };
    visit(rawDropList);
}

async function _resolveMobNameForIndex(id) {
    try {
        const mob = await loadMob(id);
        return mob?.data?.sName || '';
    } catch (_) { return ''; }
}
async function _resolveNpcNameForIndex(id) {
    try {
        const npc = await loadNpc(id);
        return npc?.data?.sName || '';
    } catch (_) { return ''; }
}
async function _resolveItemNameForIndex(id) {
    try {
        const item = await loadItem(id);
        return item?.data?.sName || item?.data?.sFunc || '';
    } catch (_) { return ''; }
}

async function buildAutoIndex({ onProgress } = {}) {
    if (_autoIndexCache.value) return _autoIndexCache.value;
    if (_autoIndexCache.promise) return _autoIndexCache.promise;

    const sessionKey = 'mymaple_auto_index_v1';
    try {
        const cached = sessionStorage.getItem(sessionKey);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.maps) {
                _autoIndexCache.value = parsed;
                return parsed;
            }
        }
    } catch (_) {}

    const work = (async () => {
        const reportable = typeof onProgress === 'function' ? onProgress : () => {};
        reportable({ phase: 'world-scan', message: '월드 데이터 수집 중...' });

        const worldTypes = ROOT_WORLD_MAPS.filter(w => w.bOnline).map(w => w.type);
        const allMaps = [];
        const mobSet = new Set();
        const npcSet = new Set();

        for (const wt of worldTypes) {
            const { maps } = await loadAllMapsFromWorld(wt);
            maps.forEach(m => {
                allMaps.push(m);
                _collectIdsFromLife(m.lifeList, mobSet, npcSet);
            });
        }

        reportable({ phase: 'mob-scan', message: `몬스터 ${mobSet.size}개 이름/드랍 수집 중...` });

        const itemSet = new Set();
        const mobsArr = [];
        const mobIds = [...mobSet];
        let processedMob = 0;
        const CONCURRENCY = 16;
        async function processMobBatch(batch) {
            await Promise.all(batch.map(async id => {
                const mob = await loadMob(id);
                processedMob++;
                if (processedMob % 50 === 0) reportable({ phase: 'mob-scan', message: `몬스터 ${processedMob}/${mobIds.length}` });
                mobsArr.push({ id, name: mob?.data?.sName || '', boss: Number(mob?.data?.nBoss) === 1 });
                if (mob && mob.data) {
                    _collectItemIdsFromDropList(mob.data.sDropList ?? mob.data.sLifeList, itemSet);
                }
            }));
        }
        for (let i = 0; i < mobIds.length; i += CONCURRENCY) {
            await processMobBatch(mobIds.slice(i, i + CONCURRENCY));
        }

        reportable({ phase: 'npc-scan', message: `NPC ${npcSet.size}개 이름 수집 중...` });
        const npcsArr = [];
        const npcIds = [...npcSet];
        let processedNpc = 0;
        for (let i = 0; i < npcIds.length; i += CONCURRENCY) {
            const batch = npcIds.slice(i, i + CONCURRENCY);
            await Promise.all(batch.map(async id => {
                const name = await _resolveNpcNameForIndex(id);
                processedNpc++;
                if (processedNpc % 50 === 0) reportable({ phase: 'npc-scan', message: `NPC ${processedNpc}/${npcIds.length}` });
                npcsArr.push({ id, name });
            }));
        }

        reportable({ phase: 'item-scan', message: `아이템 ${itemSet.size}개 이름 수집 중...` });
        const itemsArr = [];
        const itemIds = [...itemSet];
        let processedItem = 0;
        for (let i = 0; i < itemIds.length; i += CONCURRENCY) {
            const batch = itemIds.slice(i, i + CONCURRENCY);
            await Promise.all(batch.map(async id => {
                const name = await _resolveItemNameForIndex(id);
                processedItem++;
                if (processedItem % 50 === 0) reportable({ phase: 'item-scan', message: `아이템 ${processedItem}/${itemIds.length}` });
                itemsArr.push({ id, name });
            }));
        }

        const result = {
            maps: allMaps.map(m => ({
                id: m.id,
                name: m.name,
                mainName: m.mainName,
                archiveName: m.archiveName,
                isArchive: m.isArchive,
                bgm: m.bgm,
                lifeList: m.lifeList,
                desc: m.desc,
                chain: m.chain,
                folderPath: m.folderPath
            })),
            mobs: mobsArr,
            npcs: npcsArr,
            items: itemsArr,
            generatedAt: Date.now()
        };

        try { sessionStorage.setItem(sessionKey, JSON.stringify(result)); } catch (_) {}
        _autoIndexCache.value = result;
        reportable({ phase: 'done', message: '완료' });
        return result;
    })();

    _autoIndexCache.promise = work;
    return work;
}

/* ---------- MyMaple_PageInfo/InfoList/*.json 우선 로딩 ---------- */
async function _loadInfoFile(filename) {
    const data = await fetchJSON(`${PATHS.INFO}/${filename}`);
    if (!data) return null;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.list)) return data.list;
    if (Array.isArray(data.items)) return data.items;
    const firstArr = Object.values(data).find(v => Array.isArray(v));
    return firstArr || null;
}

async function loadInfoSummary() {
    const data = await fetchJSON(`${PATHS.INFO}/summary.json`);
    return data || null;
}

async function loadMobIndex() {
    const list = await _loadInfoFile('MobList.json');
    if (!list) return null; // null = info 파일 없음
    return list.map(it => ({
        id: _padId(it.id ?? it.sId ?? it.nId ?? it.mobId ?? ''),
        name: it.name ?? it.sName ?? it.title ?? '',
        boss: !!it.boss,
        level: it.level ?? null,
        exists: it.exists !== false,
        raw: it
    })).filter(it => it.id && it.id !== '0000000');
}

async function loadNpcIndex() {
    const list = await _loadInfoFile('NpcList.json');
    if (!list) return null;
    return list.map(it => ({
        id: _padId(it.id ?? it.sId ?? it.nId ?? it.npcId ?? ''),
        name: it.name ?? it.sName ?? it.title ?? '',
        func: it.func ?? it.sFunc ?? '',
        exists: it.exists !== false,
        raw: it
    })).filter(it => it.id && it.id !== '0000000');
}

async function loadItemIndex() {
    const list = await _loadInfoFile('ItemList.json');
    if (!list) return null;
    return list.map(it => ({
        id: _padId(it.id ?? it.sId ?? it.nId ?? it.itemId ?? ''),
        name: it.sFunc ?? it.sName ?? it.name ?? it.title ?? '',
        exists: it.exists !== false,
        raw: it
    })).filter(it => it.id && it.id !== '0000000');
}

async function _loadInfoFiles(filenames, options = {}) {
    const loaded = await Promise.all(
        filenames.map(filename => _loadInfoFile(filename))
    );

    const anyLoaded = loaded.some(list => list !== null);
    if (anyLoaded) {
        return loaded.flatMap(list => Array.isArray(list) ? list : []);
    }

    if (options.fallback) {
        return _loadInfoFile(options.fallback);
    }

    return null;
}

async function loadMapIndex() {
    const list = await _loadInfoFiles(['MapList1.json', 'MapList2.json'], { fallback: 'MapList.json' });
    if (!list) return null;
    return list.map(m => ({
        id: m.id,
        name: m.name || m.mainName || m.id,
        mainName: m.mainName,
        archiveName: m.archiveName,
        isArchive: !!m.isArchive,
        bgm: m.bgm || '',
        lifeList: m.lifeList || [],
        desc: m.desc || '',
        chain: m.chain || [],
        raw: m
    }));
}

function _walkMaps(node, folderPath, results, chainNames) {
    const data = node?.data || node;
    if (!data) return;
    const baseId = data.sBaseMapID || data.MapData_sMapID || node?.id || '';
    const baseName = data.sBaseMapName || data.sWorldArchiveMapName || data.MapData_sMapName || baseId;
    const list = data.MapListDate || [];
    list.forEach(entry => {
        const md = entry.MapListMapData || entry;
        const mapId = md.MapData_sMapID || md.sMapID || '';
        const subName = md.MapData_sMapSubName || md.sMapSubName || '';
        const name = md.MapData_sMapName || md.sMapName || subName || mapId;
        results.push({
            id: String(mapId),
            name: String(subName || name),
            mainName: String(name),
            archiveName: entry.ArchiveName || md.ArchiveName || '',
            isArchive: !!entry.bIsArchive,
            bgm: md.MapData_sMapBGM || md.sMapBGM || '',
            lifeList: md.MapData_sLifeList || md.sLifeList || [],
            desc: md.MapData_sMapDesc || md.sMapDesc || '',
            chain: [...chainNames, baseName],
            folderPath,
            entry,
            mapData: md
        });
    });
}

async function loadAllMapsFromWorld(worldType) {
    const root = await loadRootWorld(worldType);
    if (!root || !root.data) return { root: null, maps: [] };
    const results = [];
    const queue = [{ folderPath: root.folderPath, data: root.data, chain: [root.archiveName || root.name] }];
    const visited = new Set();
    while (queue.length) {
        const cur = queue.shift();
        const visitKey = cur.folderPath;
        if (visited.has(visitKey)) continue;
        visited.add(visitKey);
        _walkMaps({ data: cur.data }, cur.folderPath, results, cur.chain.slice(0, -1));
        const links = cur.data.MapLinkDate || [];
        for (const link of links) {
            const child = await loadLinkChildMap(cur.folderPath, link);
            if (child && child.data) {
                const nextName = child.archiveName || link.sArchiveName || link.sToolTip || link.sLinkMapID;
                queue.push({ folderPath: child.folderPath, data: child.data, chain: [...cur.chain, nextName] });
            }
        }
    }
    return { root, maps: results };
}

window.MyMapleData = {
    PATHS,
    AVAILABLE_PIN_DOTS,
    ROOT_WORLD_MAPS,
    HOME_THEME_JSON,

    normalizeWebPath,
    fetchJSON,
    fetchJSONRobust,
    buildUrlCandidates,
    winPathToRelative,

    loadMainPageData,
    loadRootWorld,
    loadLinkChildMap,
    loadAllMapsFromWorld,

    loadMob,
    loadNpc,
    loadItem,
    loadLifeList,
    parseLifeListItem,

    loadMobIndex,
    loadNpcIndex,
    loadItemIndex,
    loadMapIndex,
    loadInfoSummary,
    buildAutoIndex,

    resolveBgmPath,
    resolveBgmIconPath,
    resolveMapMarkPath,
    resolvePinDotPath,
    resolveClickPosPath,
    resolveMobIconPath,
    resolveNpcIconPath,
    resolveEntityIcon,
    resolveArchiveImagePath,

    pinPointToPercent
};
