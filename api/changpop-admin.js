const { readStore, mutateStore } = require('./_lib/github-store');

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function isAuthed(req) {
  const expected = String(process.env.CHANGPOP_ADMIN_KEY || '').trim();
  if (!expected) return false;
  const auth = String(req.headers.authorization || '').trim();
  if (auth.startsWith('Bearer ') && auth.slice(7) === expected) return true;
  if (String(req.headers['x-admin-key'] || '').trim() === expected) return true;
  return false;
}

function normalizeStatus(value) {
  const v = String(value || 'pending').trim();
  return ['pending', 'approved', 'rejected', 'deleted', 'all'].includes(v) ? v : 'pending';
}

module.exports = async (req, res) => {
  if (!isAuthed(req)) return json(res, 401, { error: '관리자 인증이 필요합니다.' });

  if (req.method === 'GET') {
    try {
      const { data } = await readStore();
      const filter = normalizeStatus(req.query?.status || 'pending');
      const submissions = (data.submissions || [])
        .filter((item) => filter === 'all' ? item.status !== 'deleted' : item.status === filter)
        .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
      return json(res, 200, { ok: true, updatedAt: data.updatedAt || null, submissions });
    } catch (err) {
      return json(res, err.statusCode || 500, { error: err.message || '목록을 불러오지 못했습니다.' });
    }
  }

  if (req.method === 'POST') {
    let body = req.body || {};
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body || '{}');
      } catch (e) {
        return json(res, 400, { error: '잘못된 요청 형식입니다.' });
      }
    }
    const id = String(body.id || '').trim();
    const status = normalizeStatus(body.status || 'pending');
    if (!id || status === 'all') return json(res, 400, { error: '잘못된 상태 변경 요청입니다.' });
    try {
      await mutateStore((store) => {
        const target = (store.submissions || []).find((item) => item && item.id === id);
        if (!target) {
          const err = new Error('대상을 찾지 못했습니다.');
          err.statusCode = 404;
          throw err;
        }
        target.status = status;
        target.reviewedAt = new Date().toISOString();
        return store;
      }, `chore(changpop): set submission ${id} -> ${status}`);
      return json(res, 200, { ok: true });
    } catch (err) {
      return json(res, err.statusCode || 500, { error: err.message || '상태 변경에 실패했습니다.' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return json(res, 405, { error: 'Method not allowed' });
};