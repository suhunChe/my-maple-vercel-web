// =============================================================
// MyMaple - 창팝 최근 30일 통계 자동 갱신 스크립트
// - 매일 1회 GitHub Actions 가 실행
// - YouTube 플레이리스트 영상의 현재 조회수/좋아요 수를 수집
// - 일별 스냅샷을 누적해서 최근 30일 증가량과 점수를 계산
// - 결과를 PageInfo_Update Data/Changpop_Info/ChangpopRecent30Stats.json 에 저장
//
// 필요한 환경 변수
//   YOUTUBE_API_KEY        (필수) YouTube Data API v3 키
//   YOUTUBE_PLAYLIST_ID    (필수) 창팝 플레이리스트 ID
//   CHANGPOP_MAX_VIDEOS    (선택) 가져올 최대 영상 수 (기본 200)
//   CHANGPOP_WINDOW_DAYS   (선택) 슬라이딩 윈도우 일수 (기본 30)
//   CHANGPOP_WEIGHT_VIEW   (선택) 점수 - 조회수 증가 1점당 가중치 (기본 0.01)
//   CHANGPOP_WEIGHT_LIKE   (선택) 점수 - 좋아요 증가 1점당 가중치 (기본 20)
// =============================================================

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const REPO_ROOT = process.cwd();
const OUTPUT_DIR = join(REPO_ROOT, 'PageInfo_Update Data', 'Changpop_Info');
const OUTPUT_FILE = join(OUTPUT_DIR, 'ChangpopRecent30Stats.json');

const API_KEY = (process.env.YOUTUBE_API_KEY || '').trim();
const PLAYLIST_ID = (process.env.YOUTUBE_PLAYLIST_ID || '').trim();

const MAX_VIDEOS = clampInt(process.env.CHANGPOP_MAX_VIDEOS, 200, 1, 500);
const WINDOW_DAYS = clampInt(process.env.CHANGPOP_WINDOW_DAYS, 30, 1, 365);
const HISTORY_KEEP_DAYS = Math.max(WINDOW_DAYS, 90);
const WEIGHT_VIEW = clampFloat(process.env.CHANGPOP_WEIGHT_VIEW, 0.01);
const WEIGHT_LIKE = clampFloat(process.env.CHANGPOP_WEIGHT_LIKE, 20);

if (!API_KEY || !PLAYLIST_ID) {
  console.error('[changpop-stats] YOUTUBE_API_KEY 와 YOUTUBE_PLAYLIST_ID 가 모두 필요합니다.');
  process.exit(1);
}

main().catch((err) => {
  console.error('[changpop-stats] 실패:', err);
  process.exit(1);
});

// ---------------------------------------------------------------
// 메인
// ---------------------------------------------------------------
async function main() {
  const now = new Date();
  const todayKey = formatDateKey(now);

  console.log(`[changpop-stats] 실행 시작 (today=${todayKey}, window=${WINDOW_DAYS}, historyKeep=${HISTORY_KEEP_DAYS})`);

  // 1. 플레이리스트 영상 목록 가져오기
  const playlistVideos = await fetchPlaylistVideoIds(PLAYLIST_ID, API_KEY, MAX_VIDEOS);
  console.log(`[changpop-stats] 플레이리스트 영상 수: ${playlistVideos.length}`);

  if (playlistVideos.length === 0) {
    console.warn('[changpop-stats] 플레이리스트가 비어 있습니다. JSON 갱신을 건너뜁니다.');
    return;
  }

  // 2. videos.list 로 통계/메타 가져오기
  const videoDetails = await fetchVideoDetails(playlistVideos.map(v => v.videoId), API_KEY);

  // 3. 기존 JSON 로드
  const previous = await loadExistingStats();

  // 4. 새 통계 계산
  const next = buildNextStats({
    previous,
    todayKey,
    now,
    playlistVideos,
    videoDetails
  });

  // 5. 저장
  await ensureDir(OUTPUT_DIR);
  await writeFile(OUTPUT_FILE, JSON.stringify(next, null, 2) + '\n', 'utf8');
  console.log(`[changpop-stats] 저장 완료: ${OUTPUT_FILE}`);
}

// ---------------------------------------------------------------
// 통계 빌드
// ---------------------------------------------------------------
function buildNextStats({ previous, todayKey, now, playlistVideos, videoDetails }) {
  const prevVideos = (previous && previous.videos && typeof previous.videos === 'object')
    ? previous.videos
    : {};

  const playlistMap = new Map();
  playlistVideos.forEach((v, idx) => {
    playlistMap.set(v.videoId, { ...v, playlistOrder: idx });
  });

  const detailMap = new Map(videoDetails.map(v => [v.videoId, v]));
  const allIds = new Set([
    ...Object.keys(prevVideos),
    ...playlistMap.keys()
  ]);

  const cutoffDate = subtractDays(now, HISTORY_KEEP_DAYS - 1);
  const cutoffKey = formatDateKey(cutoffDate);

  const nextVideos = {};

  for (const videoId of allIds) {
    const prev = prevVideos[videoId] || null;
    const inPlaylist = playlistMap.has(videoId);
    const detail = detailMap.get(videoId) || null;

    // 기존 히스토리 유지 + 오늘 스냅샷 추가 (플레이리스트에 있고 detail 이 있는 경우에만)
    const history = Array.isArray(prev?.history) ? [...prev.history] : [];

    if (inPlaylist && detail) {
      const todayEntry = {
        date: todayKey,
        viewCount: detail.viewCount,
        likeCount: detail.likeCount
      };
      const existingIdx = history.findIndex(h => h.date === todayKey);
      if (existingIdx >= 0) {
        history[existingIdx] = todayEntry;
      } else {
        history.push(todayEntry);
      }
    }

    // 윈도우 밖 기록은 제거
    const trimmedHistory = history
      .filter(h => typeof h?.date === 'string' && h.date >= cutoffKey)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    // 메타 정보 (active / title / channelTitle / thumbnail)
    const title = detail?.title ?? prev?.title ?? '';
    const channelTitle = detail?.channelTitle ?? prev?.channelTitle ?? '';
    const thumbnail = detail?.thumbnail ?? prev?.thumbnail ?? '';

    const current = inPlaylist && detail
      ? { viewCount: detail.viewCount, likeCount: detail.likeCount }
      : (prev?.current ?? { viewCount: 0, likeCount: 0 });

    // 최근 30일 계산
    const recent = computeRecentWindow(trimmedHistory);

    const joinedAt = prev?.joinedAt || (inPlaylist ? new Date(now).toISOString() : null);
    const lastSeenInPlaylist = inPlaylist
      ? new Date(now).toISOString()
      : (prev?.lastSeenInPlaylist || null);

    nextVideos[videoId] = {
      videoId,
      title,
      channelTitle,
      thumbnail,
      duration: detail?.duration ?? prev?.duration ?? '',
      playlistOrder: inPlaylist ? playlistMap.get(videoId).playlistOrder : (prev?.playlistOrder ?? null),
      joinedAt,
      lastSeenInPlaylist,
      active: !!inPlaylist,
      current,
      history: trimmedHistory,
      recent30: recent
    };
  }

  return {
    version: 1,
    generatedAt: new Date(now).toISOString(),
    updatedDate: todayKey,
    windowDays: WINDOW_DAYS,
    historyKeepDays: HISTORY_KEEP_DAYS,
    weights: {
      viewDelta: WEIGHT_VIEW,
      likeDelta: WEIGHT_LIKE
    },
    playlistId: PLAYLIST_ID,
    videoCount: Object.values(nextVideos).filter(v => v.active).length,
    videos: nextVideos
  };
}

function computeRecentWindow(history) {
  if (!history.length) {
    return {
      windowDays: WINDOW_DAYS,
      from: null,
      to: null,
      baselineViewCount: null,
      baselineLikeCount: null,
      latestViewCount: null,
      latestLikeCount: null,
      viewDelta: 0,
      likeDelta: 0,
      score: 0
    };
  }

  const first = history[0];
  const last = history[history.length - 1];

  const viewDelta = Math.max(0, (last.viewCount ?? 0) - (first.viewCount ?? 0));
  const likeDelta = Math.max(0, (last.likeCount ?? 0) - (first.likeCount ?? 0));
  const score = Math.round(viewDelta * WEIGHT_VIEW + likeDelta * WEIGHT_LIKE);

  return {
    windowDays: WINDOW_DAYS,
    from: first.date,
    to: last.date,
    baselineViewCount: first.viewCount ?? 0,
    baselineLikeCount: first.likeCount ?? 0,
    latestViewCount: last.viewCount ?? 0,
    latestLikeCount: last.likeCount ?? 0,
    viewDelta,
    likeDelta,
    score
  };
}

// ---------------------------------------------------------------
// YouTube API
// ---------------------------------------------------------------
async function fetchPlaylistVideoIds(playlistId, apiKey, maxVideos) {
  const items = [];
  let pageToken = '';
  let safety = 0;

  while (safety < 20) {
    safety += 1;
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('part', 'snippet,contentDetails');
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('key', apiKey);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`playlistItems HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    (data.items || []).forEach((it) => {
      const sn = it.snippet || {};
      const cd = it.contentDetails || {};
      const videoId = cd.videoId || (sn.resourceId && sn.resourceId.videoId);
      if (!videoId) return;
      if (sn.title === 'Private video' || sn.title === 'Deleted video') return;
      items.push({
        videoId,
        title: sn.title || '',
        position: typeof sn.position === 'number' ? sn.position : items.length
      });
    });

    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
    if (items.length >= maxVideos) break;
  }

  return items.slice(0, maxVideos);
}

async function fetchVideoDetails(videoIds, apiKey) {
  const result = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet,contentDetails,statistics');
    url.searchParams.set('id', chunk.join(','));
    url.searchParams.set('key', apiKey);
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`videos HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    (data.items || []).forEach((v) => {
      const sn = v.snippet || {};
      const cd = v.contentDetails || {};
      const st = v.statistics || {};
      const thumbs = sn.thumbnails || {};
      const thumb = thumbs.medium || thumbs.high || thumbs.default || {};
      result.push({
        videoId: v.id,
        title: sn.title || '',
        channelTitle: sn.videoOwnerChannelTitle || sn.channelTitle || '',
        thumbnail: thumb.url || `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
        duration: cd.duration || '',
        viewCount: Number(st.viewCount || 0),
        likeCount: st.likeCount != null ? Number(st.likeCount) : null
      });
    });
  }
  return result;
}

// ---------------------------------------------------------------
// 파일 IO / 유틸
// ---------------------------------------------------------------
async function loadExistingStats() {
  try {
    if (!existsSync(OUTPUT_FILE)) return null;
    const text = await readFile(OUTPUT_FILE, 'utf8');
    return JSON.parse(text);
  } catch (err) {
    console.warn('[changpop-stats] 기존 통계 파일을 읽지 못함. 새로 시작합니다.', err.message);
    return null;
  }
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

function formatDateKey(date) {
  // YYYY-MM-DD (UTC)
  const d = new Date(date);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function subtractDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampFloat(value, fallback) {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}
