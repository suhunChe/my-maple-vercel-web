const DEFAULT_FILE_PATH = process.env.CHANGPOP_GITHUB_FILE_PATH || 'PageInfo_Update Data/Changpop_Info/ChangpopPendingSubmissions.json';
const DEFAULT_BRANCH = process.env.CHANGPOP_GITHUB_BRANCH || 'main';

function requireConfig() {
  const owner = String(process.env.CHANGPOP_GITHUB_OWNER || '').trim();
  const repo = String(process.env.CHANGPOP_GITHUB_REPO || '').trim();
  const token = String(process.env.CHANGPOP_GITHUB_TOKEN || '').trim();
  if (!owner || !repo || !token) {
    const err = new Error('GitHub 저장소 환경 변수가 설정되지 않았습니다.');
    err.statusCode = 500;
    throw err;
  }
  return { owner, repo, token, branch: DEFAULT_BRANCH, filePath: DEFAULT_FILE_PATH };
}

function encodeGitHubPath(path) {
  return String(path || '').split('/').map(encodeURIComponent).join('/');
}

function defaultStore() {
  return {
    version: 1,
    updatedAt: null,
    submissions: []
  };
}

function normalizeStore(data) {
  const base = data && typeof data === 'object' ? data : {};
  return {
    version: Number(base.version || 1),
    updatedAt: base.updatedAt || null,
    submissions: Array.isArray(base.submissions) ? base.submissions : []
  };
}

async function githubRequest(url, options = {}) {
  const { token } = requireConfig();
  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'MyMaple-Changpop-Submission',
    ...(options.headers || {})
  };
  return fetch(url, { ...options, headers });
}

async function readStore() {
  const { owner, repo, branch, filePath } = requireConfig();
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(filePath)}?ref=${encodeURIComponent(branch)}`;
  const res = await githubRequest(url);
  if (res.status === 404) return { sha: null, data: defaultStore() };
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`GitHub read failed: ${res.status} ${text.slice(0, 200)}`);
    err.statusCode = 500;
    throw err;
  }
  const json = await res.json();
  const raw = Buffer.from(String(json.content || '').replace(/\n/g, ''), json.encoding || 'base64').toString('utf8');
  const parsed = JSON.parse(raw || '{}');
  return { sha: json.sha || null, data: normalizeStore(parsed) };
}

async function writeStore(data, sha, message) {
  const { owner, repo, branch, filePath } = requireConfig();
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeGitHubPath(filePath)}`;
  const body = {
    message,
    content: Buffer.from(JSON.stringify(data, null, 2) + '\n', 'utf8').toString('base64'),
    branch
  };
  if (sha) body.sha = sha;
  return githubRequest(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function mutateStore(mutator, message) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { sha, data } = await readStore();
    const draft = JSON.parse(JSON.stringify(data));
    const next = normalizeStore(await mutator(draft));
    next.updatedAt = new Date().toISOString();
    const res = await writeStore(next, sha, message);
    if (res.ok) return next;
    if (res.status === 409 || res.status === 422) continue;
    const text = await res.text().catch(() => '');
    const err = new Error(`GitHub write failed: ${res.status} ${text.slice(0, 200)}`);
    err.statusCode = 500;
    throw err;
  }
  const err = new Error('GitHub 저장소 업데이트 충돌이 반복되어 실패했습니다.');
  err.statusCode = 409;
  throw err;
}

module.exports = { readStore, mutateStore, normalizeStore };