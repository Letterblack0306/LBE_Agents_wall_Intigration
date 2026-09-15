#!/usr/bin/env node
import http from 'node:http';
import crypto from 'node:crypto';

const host = '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '8080', 10);
const maxBodyBytes = Number.parseInt(process.env.JSON_BODY_LIMIT_BYTES || '32768', 10);
const corsAllowlist = (process.env.CORS_ALLOWLIST || 'https://letterblack.net,https://letterblack.ae')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
const rateLimitWindowMs = 60_000;
const rateLimitMax = Number.parseInt(process.env.RATE_LIMIT_MAX || '60', 10);
const rateBuckets = new Map();
const connectionTokens = (process.env.LBE_CLOUD_TOKENS || process.env.LBE_CLOUD_TOKEN || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const demoProofs = new Map();
const workspaceConnections = new Map();

function nowIso() {
  return new Date().toISOString();
}

function json(res, status, body, headers = {}) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(`${payload}\n`);
}

function error(res, status, code, message, details) {
  json(res, status, {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  });
}

function safeLog(req, status) {
  console.log(JSON.stringify({
    ts: nowIso(),
    method: req.method,
    path: new URL(req.url, 'http://localhost').pathname,
    status,
  }));
}

function authenticate(req, res) {
  if (connectionTokens.length === 0) {
    error(res, 503, 'AUTH_NOT_CONFIGURED', 'Connection API authentication is not configured.');
    return null;
  }
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || !connectionTokens.includes(match[1])) {
    error(res, 401, 'AUTH_REQUIRED', 'A valid bearer token is required for connection API routes.');
    return null;
  }
  const tokenHash = crypto.createHash('sha256').update(match[1]).digest('hex').slice(0, 16);
  return { subject: `token:${tokenHash}` };
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && corsAllowlist.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'origin');
  }
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
}

function rateLimit(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || { resetAt: now + rateLimitWindowMs, count: 0 };
  if (now > bucket.resetAt) {
    bucket.resetAt = now + rateLimitWindowMs;
    bucket.count = 0;
  }
  bucket.count += 1;
  rateBuckets.set(ip, bucket);
  if (bucket.count > rateLimitMax) {
    error(res, 429, 'RATE_LIMITED', 'Too many requests. Try again later.');
    safeLog(req, 429);
    return false;
  }
  return true;
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const err = new Error('JSON body exceeds size limit');
      err.code = 'PAYLOAD_TOO_LARGE';
      throw err;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const err = new Error('Request body must be valid JSON');
    err.code = 'INVALID_JSON';
    throw err;
  }
}

function validateProposal(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) errors.push('body must be a JSON object');
  if (typeof body?.action !== 'string' || body.action.trim() === '') errors.push('action is required');
  if (body?.target !== undefined && typeof body.target !== 'string') errors.push('target must be a string');
  if (body?.metadata !== undefined && (typeof body.metadata !== 'object' || Array.isArray(body.metadata))) {
    errors.push('metadata must be an object');
  }
  return errors;
}

function hasForbiddenPayloadKey(value) {
  if (!value || typeof value !== 'object') return false;
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (normalized.includes('secret')
      || normalized.includes('token')
      || normalized.includes('password')
      || normalized.includes('privatekey')
      || normalized === 'rawfiles'
      || normalized === 'auditlog'
      || normalized === 'shelloutput') {
      return true;
    }
    if (hasForbiddenPayloadKey(nested)) return true;
  }
  return false;
}

function validateWorkspacePayload(body, expectedWorkspaceId, kind) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) errors.push('body must be a JSON object');
  if (hasForbiddenPayloadKey(body)) {
    errors.push('payload must not include secrets, tokens, raw private files, full audit logs, or shell output');
  }

  const workspaceId = body?.workspaceId || expectedWorkspaceId;
  if (typeof workspaceId !== 'string' || workspaceId.trim() === '') errors.push('workspaceId is required');
  if (expectedWorkspaceId && body?.workspaceId && body.workspaceId !== expectedWorkspaceId) {
    errors.push('workspaceId must match the route workspace id');
  }

  if (body?.lbeVersion !== undefined && typeof body.lbeVersion !== 'string') errors.push('lbeVersion must be a string');
  if (body?.mode !== undefined && typeof body.mode !== 'string') errors.push('mode must be a string');
  if (body?.status !== undefined && typeof body.status !== 'string') errors.push('status must be a string');
  if (body?.policyHash !== undefined && typeof body.policyHash !== 'string') errors.push('policyHash must be a string');
  if (body?.gatesHash !== undefined && typeof body.gatesHash !== 'string') errors.push('gatesHash must be a string');
  if (body?.lastProofId !== undefined && typeof body.lastProofId !== 'string') errors.push('lastProofId must be a string');
  if (body?.capabilities !== undefined
    && (!Array.isArray(body.capabilities) || body.capabilities.some((entry) => typeof entry !== 'string'))) {
    errors.push('capabilities must be an array of strings');
  }
  if ((kind === 'proof' || kind === 'events') && body?.summary !== undefined && typeof body.summary !== 'object') {
    errors.push('summary must be an object when present');
  }
  return { errors, workspaceId };
}

function publicWorkspaceRecord(record) {
  return {
    workspaceId: record.workspaceId,
    status: record.status,
    mode: record.mode,
    lbeVersion: record.lbeVersion,
    capabilities: record.capabilities,
    policyHash: record.policyHash,
    gatesHash: record.gatesHash,
    lastProofId: record.lastProofId,
    lastSeenAt: record.lastSeenAt,
    proofSummaries: record.proofSummaries.slice(-5),
    eventSummaries: record.eventSummaries.slice(-5),
  };
}

function registerWorkspaceConnection(workspaceId, body, auth, kind) {
  const existing = workspaceConnections.get(workspaceId) || {
    workspaceId,
    proofSummaries: [],
    eventSummaries: [],
  };
  const record = {
    ...existing,
    workspaceId,
    owner: auth.subject,
    status: body.status || existing.status || 'connected',
    mode: body.mode || existing.mode || 'local',
    lbeVersion: body.lbeVersion || existing.lbeVersion || null,
    capabilities: body.capabilities || existing.capabilities || [],
    policyHash: body.policyHash || existing.policyHash || null,
    gatesHash: body.gatesHash || existing.gatesHash || null,
    lastProofId: body.lastProofId || body.proofId || existing.lastProofId || null,
    lastSeenAt: nowIso(),
  };
  if (kind === 'proof') {
    record.proofSummaries.push({
      proofId: body.proofId || body.lastProofId || null,
      result: body.result || body.status || null,
      summary: body.summary || null,
      receivedAt: record.lastSeenAt,
    });
  }
  if (kind === 'events') {
    record.eventSummaries.push({
      eventId: body.eventId || null,
      type: body.type || null,
      summary: body.summary || null,
      receivedAt: record.lastSeenAt,
    });
  }
  workspaceConnections.set(workspaceId, record);
  return record;
}

async function handleConnection(req, res, expectedWorkspaceId, kind) {
  const auth = authenticate(req, res);
  if (!auth) return;
  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    const status = err.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
    return error(res, status, err.code || 'BAD_REQUEST', err.message);
  }
  const { errors, workspaceId } = validateWorkspacePayload(body, expectedWorkspaceId, kind);
  if (errors.length) {
    return error(res, 400, 'SCHEMA_VALIDATION_FAILED', 'Connection payload is invalid.', errors);
  }
  const record = registerWorkspaceConnection(workspaceId, body, auth, kind);
  const sessionId = crypto.createHash('sha256')
    .update(`${auth.subject}:${workspaceId}:${record.lastSeenAt}`)
    .digest('hex')
    .slice(0, 24);
  return json(res, 200, {
    ok: true,
    sessionId,
    heartbeatSeconds: 30,
    serverMode: 'control_plane',
    execution: 'local_only',
    workspace: publicWorkspaceRecord(record),
  });
}

function decisionFor(body, mode) {
  const action = String(body.action || '').toLowerCase();
  const target = String(body.target || '').toLowerCase();
  const denied = action.includes('shell')
    || action.includes('exec')
    || action.includes('run')
    || target.includes('.env')
    || target.includes('secret');
  const proofId = crypto.createHash('sha256')
    .update(JSON.stringify({ mode, action: body.action, target: body.target || '' }))
    .digest('hex')
    .slice(0, 16);
  const proof = {
    id: proofId,
    mode,
    result: denied ? 'deny' : 'allow',
    reason: denied
      ? 'Demo policy denies shell-like actions and secret-looking targets.'
      : 'Demo policy allows this proposal for explanation only.',
    executed: false,
    writes_project_files: false,
    shell_execution: false,
    created_at: nowIso(),
    proposal: {
      action: body.action,
      target: body.target || null,
    },
  };
  demoProofs.set(proofId, proof);
  return proof;
}

async function handleDemo(req, res, mode) {
  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    const status = err.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
    return error(res, status, err.code || 'BAD_REQUEST', err.message);
  }
  const validationErrors = validateProposal(body);
  if (validationErrors.length) {
    return error(res, 400, 'SCHEMA_VALIDATION_FAILED', 'Demo proposal payload is invalid.', validationErrors);
  }
  const proof = decisionFor(body, mode);
  return json(res, 200, {
    ok: true,
    demo: true,
    mode,
    decision: proof.result,
    reason: proof.reason,
    executed: false,
    proof_id: proof.id,
    proof_url: `/v1/demo/proof/${proof.id}`,
  });
}

async function route(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (!rateLimit(req, res)) return;

  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true, service: 'sentinel-public-api', status: 'healthy' });
  }
  if (req.method === 'GET' && url.pathname === '/v1/info') {
    return json(res, 200, {
      ok: true,
      service: 'Sentinel public demo API',
      mode: 'demo-only',
      execution: 'disabled',
      routes: [
        'GET /health',
        'GET /v1/info',
        'POST /v1/connect',
        'GET /v1/me',
        'GET /v1/me/workspaces',
        'POST /v1/workspaces/:workspaceId/ping',
        'POST /v1/workspaces/:workspaceId/proof',
        'POST /v1/workspaces/:workspaceId/events',
        'POST /v1/demo/verify',
        'POST /v1/demo/dryrun',
        'GET /v1/demo/proof/:id',
      ],
      boundary: 'LBE Cloud connects to local workspaces. LBE Local owns policy, proof, and execution.',
    });
  }
  if (req.method === 'POST' && url.pathname === '/v1/connect') {
    return handleConnection(req, res, null, 'connect');
  }
  if (req.method === 'GET' && url.pathname === '/v1/me') {
    const auth = authenticate(req, res);
    if (!auth) return;
    return json(res, 200, {
      ok: true,
      subject: auth.subject,
      serverMode: 'control_plane',
      execution: 'local_only',
    });
  }
  if (req.method === 'GET' && url.pathname === '/v1/me/workspaces') {
    const auth = authenticate(req, res);
    if (!auth) return;
    const workspaces = [...workspaceConnections.values()]
      .filter((record) => record.owner === auth.subject)
      .map(publicWorkspaceRecord);
    return json(res, 200, { ok: true, workspaces });
  }
  const workspaceMatch = url.pathname.match(/^\/v1\/workspaces\/([^/]+)\/(ping|proof|events)$/);
  if (req.method === 'POST' && workspaceMatch) {
    return handleConnection(req, res, decodeURIComponent(workspaceMatch[1]), workspaceMatch[2]);
  }
  if (req.method === 'POST' && url.pathname === '/v1/demo/verify') {
    return handleDemo(req, res, 'verify');
  }
  if (req.method === 'POST' && url.pathname === '/v1/demo/dryrun') {
    return handleDemo(req, res, 'dryrun');
  }
  if (req.method === 'GET' && url.pathname.startsWith('/v1/demo/proof/')) {
    const id = url.pathname.split('/').pop();
    const proof = demoProofs.get(id);
    if (!proof) return error(res, 404, 'PROOF_NOT_FOUND', 'No demo proof exists for that id.');
    return json(res, 200, { ok: true, demo: true, proof });
  }
  if (url.pathname === '/v1/run' || url.pathname === '/run') {
    return error(res, 404, 'ROUTE_NOT_AVAILABLE', 'Public run execution is not available.');
  }
  return error(res, 404, 'NOT_FOUND', 'Route not found.');
}

const server = http.createServer((req, res) => {
  route(req, res)
    .then(() => safeLog(req, res.statusCode))
    .catch((err) => {
      error(res, 500, 'INTERNAL_ERROR', 'Unexpected server error.');
      console.error(JSON.stringify({ ts: nowIso(), error: err.message }));
    });
});

server.listen(port, host, () => {
  console.log(JSON.stringify({ ts: nowIso(), service: 'sentinel-public-api', host, port }));
});
