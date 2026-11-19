import http from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('..', import.meta.url));
const root = join(project, 'frontend');
const envFile = join(project, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const port = process.env.PORT || 3000;
const MAX_BODY = 10 * 1024 * 1024; // ~5 MB image as base64 plus text
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

const send = (res, code, value, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type });
  res.end(typeof value === 'string' ? value : JSON.stringify(value));
};

const fallback = (message, image) =>
  `Thanks for your message. You said: “${message}”${image ? ' I can see you attached an image; tell me what you want to examine.' : ''}\n\nTo enable live AI answers, add your credentials to \`.env\` (see \`.env.example\`) and restart the server.`;

async function chat(body) {
  if (typeof body?.message !== 'string') throw new Error('Message is required.');
  if (!process.env.OPENAI_API_KEY) return { reply: fallback(body.message, body.image) };

  const content = [{ type: 'text', text: body.message }];
  if (body.image?.dataUrl) content.push({ type: 'image_url', image_url: { url: body.image.dataUrl } });
  const history = Array.isArray(body.history) ? body.history.slice(-10).filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string') : [];

  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(55000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'system', content: 'You are Orbit, a helpful concise assistant.' }, ...history, { role: 'user', content }],
      temperature: 0.7
    })
  });
  if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
  const data = await response.json();
  return { reply: data.choices?.[0]?.message?.content || 'No reply received.' };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const parts = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new Error('Request too large.')); req.destroy(); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts).toString()));
    req.on('error', reject);
  });
}

http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'POST' && pathname === '/api/chat') {
      try { return send(res, 200, await chat(JSON.parse(await readBody(req)))); }
      catch (e) { return send(res, 500, { error: e.message || 'Unable to process your message.' }); }
    }
    const file = normalize(join(root, pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + sep) || !existsSync(file) || !(await stat(file)).isFile()) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch { send(res, 500, 'Server error', 'text/plain'); }
}).listen(port, () => console.log(`Orbit is running at http://localhost:${port}`));
