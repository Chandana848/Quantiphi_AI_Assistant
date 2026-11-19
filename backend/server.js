import http from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('..', import.meta.url));
const root = join(project, 'frontend');
const envFile = join(project, '.env');
if (existsSync(envFile)) for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) { const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, ''); }
const port = process.env.PORT || 3000;
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const send = (res, code, value, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(typeof value === 'string' ? value : JSON.stringify(value)); };
function fallback(message, image) { return `Thanks for your message. You said: Ã¢â‚¬Å“${message}Ã¢â‚¬Â${image ? ' I can see that you attached an image; tell me what you want to examine.' : ''}\n\nTo enable live AI answers, add credentials to **.env** (from **.env.example**) and restart.`; }
async function chat(body) {
  if (!process.env.OPENAI_API_KEY) return { reply: fallback(body.message, body.image) };
  const content = [{ type: 'text', text: body.message }]; if (body.image?.dataUrl) content.push({ type: 'image_url', image_url: { url: body.image.dataUrl } });
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const response = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages: [{ role: 'system', content: 'You are Orbit, a helpful concise assistant.' }, ...(body.history || []), { role: 'user', content }], temperature: .7 }) });
  if (!response.ok) throw new Error(`AI provider returned ${response.status}`); const data = await response.json(); return { reply: data.choices?.[0]?.message?.content || 'No reply received.' };
}
http.createServer(async (req, res) => { try {
  if (req.method === 'POST' && req.url === '/api/chat') { let raw = ''; req.on('data', c => raw += c); req.on('end', async () => { try { send(res, 200, await chat(JSON.parse(raw))); } catch (e) { send(res, 500, { error: e.message || 'Unable to process your message.' }); } }); return; }
  const pathname = req.url === '/' ? '/index.html' : new URL(req.url, `http://${req.headers.host}`).pathname; const file = normalize(join(root, pathname));
  if (!file.startsWith(root) || !existsSync(file) || !(await stat(file)).isFile()) return send(res, 404, 'Not found', 'text/plain'); res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(res);
} catch { send(res, 500, 'Server error', 'text/plain'); } }).listen(port, () => console.log(`Orbit is running at http://localhost:${port}`));
