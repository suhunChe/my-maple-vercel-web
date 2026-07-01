const { mutateStore } = require('./_lib/github-store');

const ALLOWED_CATEGORIES = new Set(['new', 'rediscovery', 'event', 'other']);

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

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function genSubmissionId() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const HH = String(d.getUTCHours()).padStart(2, '0');
  const MM = String(d.getUTCMinutes()).padStart(2, '0');
  const SS = String(d.getUTCSeconds()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 8);
  return `req_${yyyy}${mm}${dd}_${HH}${MM}${SS}_${rand}`;
}

function sanitizePreview(preview, fallbackVideoId) {
  const data = preview && typeof preview === 'object' ? preview : {};
  return {
    videoId: String(data.videoId || fallbackVideoId || '').trim(),
    title: String(data.title || '').trim().slice(0, 180),
    channelTitle: String(data.channelTitle || '').trim().slice(0, 120),
    thumbnail: String(data.thumbnail || '').trim().slice(0, 500),
    publishedAt: String(data.publishedAt || '').trim().slice(0, 50),
    duration: String(data.duration || '').trim().slice(0, 32)
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }
  let body = req.body || {};
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch (e) {
      return json(res, 400, { error: '잘못된 요청 형식입니다.' });
    }
  }
  const rawUrl = String(body.youtubeUrl || '').trim();
  const videoId = extractVideoId(body.videoId || rawUrl);
  if (!videoId) return json(res, 400, { error: '올바른 유튜브 링크가 아닙니다.' });

  const submittedBy = String(body.submittedBy || '익명').trim().slice(0, 24) || '익명';
  const message = String(body.message || '').trim().slice(0, 140);
  const category = ALLOWED_CATEGORIES.has(String(body.category || '')) ? String(body.category) : 'other';
  const preview = sanitizePreview(body.preview, videoId);
  const submission = {
    id: genSubmissionId(),
    videoId,
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    submittedBy,
    message,
    category,
    status: 'pending',
    submittedAt: new Date().toISOString(),
    preview
  };

  try {
    await mutateStore((store) => {
      const exists = (store.submissions || []).some((item) => item && item.videoId === videoId && item.status !== 'rejected' && item.status !== 'deleted');
      if (exists) {
        const err = new Error('duplicate');
        err.statusCode = 409;
        throw err;
      }
      store.submissions = Array.isArray(store.submissions) ? store.submissions : [];
      store.submissions.unshift(submission);
      return store;
    }, `feat(changpop): add submission ${videoId}`);
    return json(res, 200, { ok: true, submissionId: submission.id });
  } catch (err) {
    if (err.statusCode === 409) return json(res, 409, { error: '이미 신청 대기 중이거나 등록된 영상입니다.' });
    return json(res, err.statusCode || 500, { error: err.message || '신청 저장에 실패했습니다.' });
  }
};