#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PAGE_INFO = path.join(ROOT, 'MyMaple_PageInfo');
const WORLD_DIR = path.join(PAGE_INFO, 'World');
const MOB_DIR = path.join(PAGE_INFO, 'Mob');
const NPC_DIR = path.join(PAGE_INFO, 'Npc');
const ITEM_DIR = path.join(PAGE_INFO, 'Item');
const INFO_OUT_DIR = path.join(PAGE_INFO, 'InfoList');

const WORLD_ROOTS = [
    { id: 'WorldMap', folder: 'WorldMap', type: 'maple', name: '메이플 월드' },
    { id: 'GWorldMap', folder: 'GWorldMap', type: 'grandis', name: '그란디스' }
];

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJsonSafe(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

function writeJson(fileName, payload) {
    const out = path.join(INFO_OUT_DIR, fileName);
    fs.writeFileSync(out, JSON.stringify(payload, null, 2), 'utf-8');
    const size = (fs.statSync(out).size / 1024).toFixed(1);
    console.log(`  → ${fileName} (${size} KB)`);
}

function padId(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    if (/^\d+$/.test(text)) return text.padStart(7, '0');
    return text;
}

function relFromRoot(absPath) {
    return absPath ? path.relative(ROOT, absPath).replace(/\\/g, '/') : '';
}

function logProgress(prefix, cur, total) {
    if (!total) return;
    if (cur === total || cur % 50 === 0) {
        process.stdout.write(`\r[${prefix}] ${cur}/${total}        `);
        if (cur === total) process.stdout.write('\n');
    }
}

function parseLifeToken(token) {
    if (typeof token !== 'string') return null;
    const idx = token.indexOf(':');
    if (idx < 0) return null;
    const kind = token.slice(0, idx).trim().toLowerCase();
    const rawId = token.slice(idx + 1).trim();
    const id = padId(rawId);
    if (!id) return null;
    if (kind === 'm' || kind === 'mob') return { type: 'mob', id };
    if (kind === 'n' || kind === 'npc') return { type: 'npc', id };
    return null;
}

function collectItemIdsFromDrop(drop, itemSet) {
    if (drop === undefined || drop === null || drop === '') return;

    const push = (raw) => {
        const text = String(raw ?? '').trim();
        if (!text) return;
        const matches = text.match(/\d{4,}/g);
        if (!matches) return;
        matches.forEach(m => {
            const p = padId(m);
            if (p) itemSet.add(p);
        });
    };

    const visit = (value) => {
        if (value === undefined || value === null || value === '') return;
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        if (typeof value === 'number') {
            push(Math.trunc(value));
            return;
        }
        if (typeof value === 'object') {
            const candidate = value.id ?? value.itemId ?? value.itemID ?? value.nItemID ?? value.sItemID ?? value.sItemId ?? value.value;
            if (candidate !== undefined && candidate !== null && candidate !== '') {
                push(candidate);
            } else {
                Object.values(value).forEach(visit);
            }
            return;
        }
        push(value);
    };

    visit(drop);
}

function loadEntityJson(baseDir, id) {
    const file = path.join(baseDir, id, `${id}.json`);
    const data = readJsonSafe(file);
    return { file, data };
}

function walkWorld(rootInfo) {
    const startPath = path.join(WORLD_DIR, rootInfo.folder);
    const startFile = path.join(startPath, `${rootInfo.id}.json`);
    const startData = readJsonSafe(startFile);
    if (!startData) {
        console.warn(`[경고] ${rootInfo.name} 루트 JSON 없음: ${startFile}`);
        return { maps: [], mobIds: new Set(), npcIds: new Set(), mapRefsByMobId: new Map(), mapRefsByNpcId: new Map() };
    }

    const maps = [];
    const mobIds = new Set();
    const npcIds = new Set();
    const mapRefsByMobId = new Map();
    const mapRefsByNpcId = new Map();
    const queue = [{ folderPath: startPath, filePath: startFile, data: startData, chain: [rootInfo.name] }];
    const visited = new Set();

    while (queue.length) {
        const cur = queue.shift();
        if (visited.has(cur.folderPath)) continue;
        visited.add(cur.folderPath);

        const baseName = cur.data.sBaseMapName
            || cur.data.sWorldArchiveMapName
            || cur.data.MapData_sMapName
            || cur.chain[cur.chain.length - 1]
            || rootInfo.name;

        const list = Array.isArray(cur.data.MapListDate) ? cur.data.MapListDate : [];
        for (const entry of list) {
            // 새 구조(sMapData 배열) + 옛 구조(MapListMapData 단일) + 평탄 구조 모두 지원
            let mapDataArray = [];
            if (Array.isArray(entry?.sMapData) && entry.sMapData.length) {
                mapDataArray = entry.sMapData;
            } else if (entry?.MapListMapData) {
                mapDataArray = [entry.MapListMapData];
            } else if (entry && (entry.MapData_sMapID || entry.sMapID)) {
                mapDataArray = [entry];
            }

            for (const md of mapDataArray) {
                if (!md) continue;
                const mapId = String(md.MapData_sMapID || md.sMapID || '').trim();
                if (!mapId) continue;

                const mapName = md.MapData_sMapName || md.sMapName || entry.sTitle || '';
                const subName = md.MapData_sMapSubName || md.sMapSubName || entry.sSubTitle || '';
                const bgm = md.MapData_sMapBGM || md.sMapBGM || '';
                const lifeRaw = md.MapData_sLifeList || md.sLifeList;
                const lifeList = Array.isArray(lifeRaw) ? lifeRaw : [];
                const parsedLife = lifeList.map(parseLifeToken).filter(Boolean);
                const mobLifeIds = parsedLife.filter(x => x.type === 'mob').map(x => x.id);
                const npcLifeIds = parsedLife.filter(x => x.type === 'npc').map(x => x.id);

                const desc = md.MapData_sMapDesc || md.sMapDesc || md.MapData_sDesc || md.sDesc || entry.sDesc || '';
                const mapIcon = md.MapData_sMapIcon || md.sMapIcon || '';

                const mapEntry = {
                    id: mapId,
                    name: subName || mapName || mapId,
                    mainName: mapName || subName || mapId,
                    subName: subName || '',
                    mapIcon,
                    worldType: rootInfo.type,
                    worldName: rootInfo.name,
                    worldRootId: rootInfo.id,
                    archiveName: entry.ArchiveName || md.ArchiveName || entry.sTitle || '',
                    isArchive: !!entry.bIsArchive,
                    pinType: entry.nPinType ?? null,
                    pinPoint: entry.pntPinPoint || null,
                    mainCity: entry.sMainCity || md.sMainCity || '',
                    bgm,
                    desc,
                    lifeList,
                    lifeSummary: {
                        mobs: mobLifeIds,
                        npcs: npcLifeIds,
                        mobCount: mobLifeIds.length,
                        npcCount: npcLifeIds.length
                    },
                    chain: [...cur.chain, baseName].filter(Boolean),
                    sourceFolderPath: relFromRoot(cur.folderPath),
                    sourceJsonPath: relFromRoot(cur.filePath),
                    data: md,
                    entryData: entry,
                    nodeData: cur.data
                };
                maps.push(mapEntry);

                mobLifeIds.forEach(id => {
                    mobIds.add(id);
                    if (!mapRefsByMobId.has(id)) mapRefsByMobId.set(id, []);
                    mapRefsByMobId.get(id).push({ id: mapId, name: mapEntry.name, worldType: rootInfo.type, worldName: rootInfo.name });
                });
                npcLifeIds.forEach(id => {
                    npcIds.add(id);
                    if (!mapRefsByNpcId.has(id)) mapRefsByNpcId.set(id, []);
                    mapRefsByNpcId.get(id).push({ id: mapId, name: mapEntry.name, worldType: rootInfo.type, worldName: rootInfo.name });
                });
            }
        }

        const links = Array.isArray(cur.data.MapLinkDate) ? cur.data.MapLinkDate : [];
        for (const link of links) {
            const childId = link?.sLinkMapID;
            if (!childId) continue;
            const childFolder = path.join(cur.folderPath, childId);
            const childFile = path.join(childFolder, `${childId}.json`);
            const childData = readJsonSafe(childFile);
            if (!childData) continue;
            const childName = link.sArchiveName || childData.sWorldArchiveMapName || link.sToolTip || childId;
            queue.push({
                folderPath: childFolder,
                filePath: childFile,
                data: childData,
                chain: [...cur.chain, childName]
            });
        }
    }

    return { maps, mobIds, npcIds, mapRefsByMobId, mapRefsByNpcId };
}

function buildMobEntry(id, mapRefs) {
    const { file, data } = loadEntityJson(MOB_DIR, id);
    if (!data) {
        return {
            id,
            name: '',
            exists: false,
            imagePath: `MyMaple_PageInfo/Mob/${id}/${id}.png`,
            sourceJsonPath: relFromRoot(file),
            appearInMaps: mapRefs || [],
            appearCount: Array.isArray(mapRefs) ? mapRefs.length : 0,
            dropItemIds: [],
            data: null
        };
    }

    const itemSet = new Set();
    collectItemIdsFromDrop(data.sDropList ?? data.sLifeList, itemSet);

    return {
        id,
        name: data.sName || '',
        exists: true,
        imagePath: `MyMaple_PageInfo/Mob/${id}/${id}.png`,
        sourceJsonPath: relFromRoot(file),
        boss: Number(data.nBoss) === 1,
        level: data.nLevel ?? null,
        appearInMaps: mapRefs || [],
        appearCount: Array.isArray(mapRefs) ? mapRefs.length : 0,
        dropItemIds: [...itemSet].sort(),
        data
    };
}

function buildNpcEntry(id, mapRefs) {
    const { file, data } = loadEntityJson(NPC_DIR, id);
    if (!data) {
        return {
            id,
            name: '',
            exists: false,
            imagePath: `MyMaple_PageInfo/Npc/${id}/${id}.png`,
            sourceJsonPath: relFromRoot(file),
            appearInMaps: mapRefs || [],
            appearCount: Array.isArray(mapRefs) ? mapRefs.length : 0,
            data: null
        };
    }

    return {
        id,
        name: data.sName || '',
        exists: true,
        imagePath: `MyMaple_PageInfo/Npc/${id}/${id}.png`,
        sourceJsonPath: relFromRoot(file),
        func: data.sFunc || '',
        appearInMaps: mapRefs || [],
        appearCount: Array.isArray(mapRefs) ? mapRefs.length : 0,
        data
    };
}

function buildItemEntry(id, droppedByMobIds) {
    const { file, data } = loadEntityJson(ITEM_DIR, id);
    if (!data) {
        return {
            id,
            name: '',
            exists: false,
            imagePath: `MyMaple_PageInfo/Item/${id}/${id}.png`,
            sourceJsonPath: relFromRoot(file),
            droppedByMobIds: droppedByMobIds || [],
            dropSourceCount: Array.isArray(droppedByMobIds) ? droppedByMobIds.length : 0,
            data: null
        };
    }

    return {
        id,
        name: data.sName || data.sFunc || '',
        exists: true,
        imagePath: `MyMaple_PageInfo/Item/${id}/${id}.png`,
        sourceJsonPath: relFromRoot(file),
        func: data.sFunc || '',
        droppedByMobIds: droppedByMobIds || [],
        dropSourceCount: Array.isArray(droppedByMobIds) ? droppedByMobIds.length : 0,
        data
    };
}

function main() {
    if (!fs.existsSync(PAGE_INFO)) {
        console.error(`[오류] MyMaple_PageInfo 폴더를 찾을 수 없습니다: ${PAGE_INFO}`);
        process.exit(1);
    }

    ensureDir(INFO_OUT_DIR);

    console.log('▶ 월드 데이터 재귀 스캔 시작');
    const allMaps = [];
    const mobIdSet = new Set();
    const npcIdSet = new Set();
    const mapRefsByMobId = new Map();
    const mapRefsByNpcId = new Map();

    for (const world of WORLD_ROOTS) {
        const result = walkWorld(world);
        console.log(`  ${world.name}: 맵 ${result.maps.length}개, MOB ${result.mobIds.size}개, NPC ${result.npcIds.size}개`);
        allMaps.push(...result.maps);
        result.mobIds.forEach(id => mobIdSet.add(id));
        result.npcIds.forEach(id => npcIdSet.add(id));
        result.mapRefsByMobId.forEach((refs, id) => {
            if (!mapRefsByMobId.has(id)) mapRefsByMobId.set(id, []);
            mapRefsByMobId.get(id).push(...refs);
        });
        result.mapRefsByNpcId.forEach((refs, id) => {
            if (!mapRefsByNpcId.has(id)) mapRefsByNpcId.set(id, []);
            mapRefsByNpcId.get(id).push(...refs);
        });
    }

    console.log(`  합계: 맵 ${allMaps.length}개, MOB ${mobIdSet.size}개, NPC ${npcIdSet.size}개`);

    console.log('▶ MOB 전체 info 생성');
    const mobIds = [...mobIdSet].sort();
    const mobs = [];
    const itemIdSet = new Set();
    const itemRefsByMobId = new Map();
    let mobCount = 0;
    for (const id of mobIds) {
        const mobEntry = buildMobEntry(id, mapRefsByMobId.get(id) || []);
        mobs.push(mobEntry);
        (mobEntry.dropItemIds || []).forEach(itemId => {
            itemIdSet.add(itemId);
            if (!itemRefsByMobId.has(itemId)) itemRefsByMobId.set(itemId, []);
            itemRefsByMobId.get(itemId).push(id);
        });
        mobCount += 1;
        logProgress('MOB', mobCount, mobIds.length);
    }

    console.log('▶ NPC 전체 info 생성');
    const npcIds = [...npcIdSet].sort();
    const npcs = [];
    let npcCount = 0;
    for (const id of npcIds) {
        npcs.push(buildNpcEntry(id, mapRefsByNpcId.get(id) || []));
        npcCount += 1;
        logProgress('NPC', npcCount, npcIds.length);
    }

    console.log('▶ ITEM 전체 info 생성');
    const itemIds = [...itemIdSet].sort();
    const items = [];
    let itemCount = 0;
    for (const id of itemIds) {
        items.push(buildItemEntry(id, itemRefsByMobId.get(id) || []));
        itemCount += 1;
        logProgress('ITEM', itemCount, itemIds.length);
    }

    const generatedAt = new Date().toISOString();
    const sampleMaps = allMaps.slice(0, 3).map(m => ({
        id: m.id, name: m.name, world: m.worldName, life: m.lifeList.slice(0, 5)
    }));
    const summary = {
        generatedAt,
        roots: WORLD_ROOTS,
        counts: {
            maps: allMaps.length,
            mobs: mobs.length,
            mobsExisting: mobs.filter(x => x.exists).length,
            npcs: npcs.length,
            npcsExisting: npcs.filter(x => x.exists).length,
            items: items.length,
            itemsExisting: items.filter(x => x.exists).length
        },
        diagnostics: {
            rootJsonsFound: WORLD_ROOTS.map(w => ({
                name: w.name,
                rootPath: path.join('MyMaple_PageInfo/World', w.folder, `${w.id}.json`),
                exists: fs.existsSync(path.join(WORLD_DIR, w.folder, `${w.id}.json`))
            })),
            sampleMaps,
            warning: allMaps.length === 0
                ? 'No maps were extracted. Check that MyMaple_PageInfo/World/<root>/<sub>/<sub>.json contains MapListDate[].sMapData entries.'
                : null
        }
    };

    console.log('▶ MyMaple_PageInfo/InfoList 파일 출력');
    writeJson('MapList.json', { generatedAt, list: allMaps });
    writeJson('MobList.json', { generatedAt, list: mobs });
    writeJson('NpcList.json', { generatedAt, list: npcs });
    writeJson('ItemList.json', { generatedAt, list: items });
    writeJson('summary.json', summary);

    console.log('');
    console.log('✅ 완료');
    console.log(`   생성 시각: ${generatedAt}`);
    console.log(`   맵: ${summary.counts.maps}`);
    console.log(`   MOB: ${summary.counts.mobs} (실재 JSON ${summary.counts.mobsExisting})`);
    console.log(`   NPC: ${summary.counts.npcs} (실재 JSON ${summary.counts.npcsExisting})`);
    console.log(`   ITEM: ${summary.counts.items} (실재 JSON ${summary.counts.itemsExisting})`);
}

main();
