/**
 * Probe Soft Soft recordings/summary for PMI 579 bullets vs neighbor 578.
 * Run inside Map API container (has SV_API_* + node).
 */
import https from 'node:https';

const agent = new https.Agent({ rejectUnauthorized: false });
const server = process.env.SV_HOST || '172.20.0.146';
const user = process.env.SV_API_USER;
const pass = process.env.SV_API_PASS;
const cams = (process.env.SV_CAMS || [
  'i150200700_579_2_24_bullet',
  'i150200700_579_2_25_bullet',
  'i150200700_579_2_26_bullet',
  'i150200700_579_2_27_bullet',
  'i150200700_578_2_10_bullet',
].join(',')).split(',').map((s) => s.trim()).filter(Boolean);

function req(method, path, headers = {}, body = null, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const r = https.request(
      {
        hostname: server,
        port: 8971,
        path,
        method,
        headers,
        agent,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            ms: Date.now() - t0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    r.on('error', reject);
    r.on('timeout', () => {
      r.destroy();
      reject(new Error(`timeout after ${timeoutMs}ms`));
    });
    if (body) r.write(body);
    r.end();
  });
}

function summarizeHours(raw) {
  let days;
  try {
    days = JSON.parse(raw);
  } catch {
    return { parseError: raw.slice(0, 200) };
  }
  if (!Array.isArray(days)) return { unexpected: typeof days, sample: String(raw).slice(0, 120) };
  const out = [];
  for (const day of days.slice(-3)) {
    const hours = (day.hours || []).map((h) => ({
      h: h.hour,
      dur: h.duration,
      ev: h.events ?? null,
      obj: h.objects ?? null,
      mot: h.motion ?? null,
    }));
    const last = hours.slice(-8);
    const totalDur = hours.reduce((a, h) => a + (Number(h.dur) || 0), 0);
    out.push({ day: day.day, hours: hours.length, totalDur, last8: last });
  }
  return { days: days.length, recent: out };
}

const loginBody = JSON.stringify({ user, password: pass });
console.log(JSON.stringify({ server, user, passLen: (pass || '').length, cams }, null, 2));

const login = await req(
  'POST',
  '/api/login',
  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginBody) },
  loginBody,
  90_000,
);
console.log('LOGIN', login.status, `${login.ms}ms`, login.body.slice(0, 160));
let token;
try {
  const j = JSON.parse(login.body);
  token = j.token || j.access_token;
} catch {
  token = null;
}
if (!token) {
  console.error('No token — abort');
  process.exit(2);
}

for (const cam of cams) {
  try {
    const r = await req(
      'GET',
      `/api/${encodeURIComponent(cam)}/recordings/summary?timezone=America/Mexico_City`,
      { Authorization: `Bearer ${token}` },
      null,
      120_000,
    );
    const sum = summarizeHours(r.body);
    console.log(JSON.stringify({ cam, status: r.status, ms: r.ms, bytes: r.body.length, ...sum }, null, 2));
  } catch (err) {
    console.log(JSON.stringify({ cam, error: String(err.message || err) }));
  }
}
