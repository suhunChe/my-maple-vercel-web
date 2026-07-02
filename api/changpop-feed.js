const { readFile } = require('node:fs/promises');
const { join } = require('node:path');

const CONFIG_PATH = join(process.cwd(), 'MyMaple_PageInfo', 'Special_Image', 'Changpop_Info', 'ChangpopConfig.json');
const DEFAULT_CACHE_MINUTES = 30;
const DEFAULT_MAX_RESULTS = 50;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function parseQuery(req) {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    return Object.fromEntries(url.searchParams.entries());
  } catch (e) {
    return {};
  }
}

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
    const idx = segs.findIndex((p) => p === 'shorts' || p === 'embed' || p === 'live');
    if (idx >= 0 && segs[idx + 1] && /^[A-Za-z0-9_-]{11}$/.test(segs[idx + 1])) return segs[idx + 1];
  }
  return '';
}

async function loadConfig() {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(String(raw || '').replace(/^\uFEFF/, ''));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function getApiKey() {
  return String(
    process.env.YOUTUBE_API_KEY
    || process.env.YOUTUBE_API_KEY_LOCAL
    || process.env.YOUTUBE_API_KEY_DEV
    || ''
  ).trim();
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

async function youtubeJson(url) {
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`YouTube API HTTP ${res.status} ${text.slice(0, 200)}`);
    err.statusCode = res.status;
    throw err;
  }
  return res.json();
}

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

    const json = await youtubeJson(url);
    (json.items || []).forEach((it) => {
      const sn = it.snippet || {};
      const cd = it.contentDetails || {};
      const videoId = cd.videoId || (sn.resourceId && sn.resourceId.videoId);
      if (!videoId) return;
      if (sn.title === 'Private video' || sn.title === 'Deleted video') return;
      const thumbs = sn.thumbnails || {};
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

  const detailsMap = new Map();
  for (let i = 0; i < limited.length; i += 50) {
    const chunk = limited.slice(i, i + 50);
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet,contentDetails,statistics');
    url.searchParams.set('id', chunk.map((x) => x.videoId).join(','));
    url.searchParams.set('key', apiKey);
    const json = await youtubeJson(url);
    (json.items || []).forEach((v) => {
      detailsMap.set(v.id, {
        publishedAt: (v.snippet && v.snippet.publishedAt) || '',
        duration: (v.contentDetails && v.contentDetails.duration) || '',
        viewCount: Number((v.statistics && v.statistics.viewCount) || 0),
        likeCount: v.statistics && v.statistics.likeCount != null ? Number(v.statistics.likeCount) : null
      });
    });
  }

  return limited.map((it) => {
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

async function fetchPreview(videoId, apiKey) {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet,contentDetails');
  url.searchParams.set('id', videoId);
  url.searchParams.set('key', apiKey);
  const json = await youtubeJson(url);
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

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return json(res, 500, {
      error: 'YOUTUBE_API_KEY 가 설정되지 않았습니다. 배포 환경에서는 Vercel Environment Variables, 로컬 개발에서는 .env.local 또는 vercel dev 환경 변수를 확인해 주세요.'
    });
  }

  const query = parseQuery(req);
  const videoId = extractVideoId(query.videoId || query.youtubeUrl || '');

  try {
    if (videoId) {
      const item = await fetchPreview(videoId, apiKey);
      if (!item) return json(res, 404, { error: '영상 정보를 찾지 못했습니다.' });
      return json(res, 200, { ok: true, item });
    }

    const cfg = await loadConfig();
    const playlistId = String(cfg.playlistId || '').trim();
    const maxResults = clampInt(cfg.maxResults, DEFAULT_MAX_RESULTS, 1, 200);
    const cacheMinutes = clampInt(cfg.cacheMinutes, DEFAULT_CACHE_MINUTES, 0, 1440);

    if (!playlistId) {
      return json(res, 500, { error: 'ChangpopConfig.json 에 playlistId 가 설정되지 않았습니다.' });
    }

    const items = await fetchPlaylistItems(playlistId, apiKey, maxResults);
    return json(res, 200, {
      ok: true,
      playlistId,
      maxResults,
      cacheMinutes,
      fetchedAt: Date.now(),
      items
    });
  } catch (err) {
    return json(res, err.statusCode || 500, { error: err.message || '창팝 데이터를 불러오지 못했습니다.' });
  }
};
