const $ = s => document.querySelector(s);
const STORE = 'orbit-chats', MAX_IMG = 5 * 1024 * 1024;
const icon = n => `<svg class="ic"><use href="#i-${n}"/></svg>`;
const SUGGESTIONS = ['Explain a topic simply', 'Help me write an email', 'Debug my code', 'Plan my week'];

let chats = load(), activeId = chats[0]?.id, image = null, busy = false;

function load() { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch { return []; } }
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(chats)); }
  catch { // storage full: drop saved images from older messages and retry
    chats.forEach(c => c.messages.forEach(m => delete m.image));
    try { localStorage.setItem(STORE, JSON.stringify(chats)); } catch {}
  }
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const current = () => chats.find(c => c.id === activeId);
const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const setStatus = (t, busy) => { const s = $('#status'); s.textContent = t; s.classList.toggle('busy', !!busy); };

// Minimal, safe markdown: code blocks, inline code, bold (input is escaped first)
function md(text) {
  return esc(text)
    .replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, c) => `<pre><code>${c.replace(/\n$/, '')}</code></pre>`)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
}

function newChat() {
  const empty = chats.find(c => !c.messages.length);   // reuse an untouched chat
  if (empty) activeId = empty.id;
  else { const c = { id: uid(), title: 'New conversation', messages: [], created: Date.now() }; chats.unshift(c); activeId = c.id; save(); }
  closeSidebar(); render(); $('#prompt').focus();
}

function renderList() {
  $('#chat-list').innerHTML = chats.length ? chats.map(c => `
    <div class="chat-item ${c.id === activeId ? 'active' : ''}" data-id="${c.id}">
      <button class="pick" title="${esc(c.title)}">${esc(c.title)}</button>
      <button class="icon sm del" aria-label="Delete chat">${icon('x')}</button>
    </div>`).join('') : '<div class="empty-list">No chats yet</div>';
}

function render() {
  if (!current()) { if (!chats.length) return newChat(); activeId = chats[0].id; }
  const chat = current();
  $('#title').textContent = chat.title;
  renderList();
  const box = $('#messages'); box.innerHTML = '';
  if (!chat.messages.length) {
    box.innerHTML = `<div class="welcome"><div class="logo">${icon('spark')}</div><h2>How can I help today?</h2><p>Ask a question, paste code, or attach an image.</p><div class="chips">${SUGGESTIONS.map(s => `<button>${esc(s)}</button>`).join('')}</div></div>`;
  } else chat.messages.forEach(addMessage);
  scrollDown(false);
}

function addMessage(m) {
  const node = $('#message').content.firstElementChild.cloneNode(true);
  node.classList.add(m.role);
  const content = node.querySelector('.content');
  content.innerHTML = m.role === 'assistant' ? md(m.text) : esc(m.text);
  if (m.image) { const pic = new Image(); pic.src = m.image; pic.alt = 'Attached image'; content.append(pic); }
  node.querySelector('.retry').classList.toggle('hidden', m.role !== 'user');
  node._m = m;
  $('#messages').append(node);
  return node;
}

function scrollDown(smooth = true, top = false) {
  const b = $('#messages'); b.scrollTo({ top: top ? 0 : b.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

function preview() {
  const box = $('#preview');
  box.innerHTML = image ? `<img src="${image}" alt="Attachment preview"><button type="button" id="remove-image" aria-label="Remove image">${icon('x')}</button>` : '';
  box.classList.toggle('hidden', !image);
}

async function send(text = $('#prompt').value.trim(), attached = image) {
  if (busy || (!text && !attached)) return;
  const chat = current();
  const user = { role: 'user', text: text || 'Please analyze this image.', image: attached || null };
  const history = chat.messages.slice(-10).map(m => ({ role: m.role, content: m.text }));
  if (!chat.messages.length) { chat.title = user.text.slice(0, 40); $('#title').textContent = chat.title; renderList(); $('#messages').innerHTML = ''; }
  chat.messages.push(user); save();
  $('#prompt').value = ''; $('#prompt').style.height = 'auto'; image = null; preview();
  addMessage(user);

  const typing = document.createElement('div');
  typing.className = 'message assistant typing';
  typing.innerHTML = '<span class="avatar"></span><div class="bubble"><div class="content"><i></i><i></i><i></i></div></div>';
  $('#messages').append(typing); scrollDown();
  busy = true; $('.send').disabled = true; setStatus('Thinking…', true);

  let reply;
  try {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 60000);
    const res = await fetch('/api/chat', {
      method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: user.text, image: user.image ? { dataUrl: user.image } : null, history })
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Error(data.error || `Request failed (${res.status})`);
    reply = data.reply;
  } catch (e) {
    reply = `Couldn't get a reply: ${e.name === 'AbortError' ? 'the request timed out' : e.message}. Try again.`;
  }
  typing.remove();
  const bot = { role: 'assistant', text: reply };
  chat.messages.push(bot); save();
  if (current() === chat) { addMessage(bot); scrollDown(); }
  busy = false; $('.send').disabled = false; setStatus('Ready');
}

function closeSidebar() { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('show'); }
function openSidebar() { $('#sidebar').classList.add('open'); $('#scrim').classList.add('show'); }

function setTheme(dark) {
  document.body.classList.toggle('dark', dark);
  $('#theme-icon').setAttribute('href', dark ? '#i-sun' : '#i-moon');
  $('#theme-label').textContent = dark ? 'Light mode' : 'Dark mode';
}

function find(q) {
  q = q.toLowerCase();
  const nodes = [...document.querySelectorAll('#messages .message')];
  nodes.forEach(n => n.classList.remove('hit'));
  const hits = q ? nodes.filter(n => n.textContent.toLowerCase().includes(q)) : [];
  hits.forEach(n => n.classList.add('hit'));
  $('#count').textContent = q ? `${hits.length} found` : '';
  hits[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function exportChat() {
  const c = current(); if (!c) return;
  const text = `${c.title}\n${'='.repeat(c.title.length)}\n\n` + c.messages.map(m => `${m.role.toUpperCase()}:\n${m.text}`).join('\n\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = `${c.title.replace(/[^a-z0-9]+/gi, '-') || 'orbit-chat'}.txt`;
  a.click(); URL.revokeObjectURL(a.href);
}

// ---- Events (delegated where lists re-render) ----
$('#composer').onsubmit = e => { e.preventDefault(); send(); };
$('#prompt').oninput = e => { const t = e.target; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 150) + 'px'; };
$('#prompt').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } };

$('#image').onchange = e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  if (f.size > MAX_IMG) return alert('Please choose an image under 5 MB.');
  const r = new FileReader(); r.onload = () => { image = r.result; preview(); }; r.readAsDataURL(f);
};
$('#preview').onclick = e => { if (e.target.closest('#remove-image')) { image = null; preview(); } };

$('#chat-list').onclick = e => {
  const row = e.target.closest('.chat-item'); if (!row) return;
  const id = row.dataset.id;
  if (e.target.closest('.del')) {
    chats = chats.filter(c => c.id !== id); save();
    if (id === activeId) activeId = chats[0]?.id;
  } else { activeId = id; closeSidebar(); }
  render();
};

$('#messages').onclick = e => {
  const chip = e.target.closest('.chips button'); if (chip) return send(chip.textContent);
  const node = e.target.closest('.message'); if (!node?._m) return;
  if (e.target.closest('.copy')) {
    navigator.clipboard.writeText(node._m.text);
    const b = e.target.closest('.copy'); b.innerHTML = `${icon('check')}<span>Copied</span>`;
    setTimeout(() => b.innerHTML = `${icon('copy')}<span>Copy</span>`, 1500);
  } else if (e.target.closest('.retry')) send(node._m.text, node._m.image);
};

$('#new-chat').onclick = newChat;
$('#clear').onclick = () => { if (confirm('Delete all saved chats?')) { chats = []; activeId = null; save(); newChat(); } };
$('#theme').onclick = () => { const dark = !document.body.classList.contains('dark'); setTheme(dark); localStorage.setItem('orbit-theme', dark ? 'dark' : 'light'); };
$('#top').onclick = () => scrollDown(true, true);
$('#bottom').onclick = () => scrollDown();
$('#search').onclick = () => { const b = $('#search-box'); b.classList.toggle('hidden'); if (b.classList.contains('hidden')) { $('#find').value = ''; find(''); } else $('#find').focus(); };
let t; $('#find').oninput = e => { clearTimeout(t); t = setTimeout(() => find(e.target.value), 150); };
$('#export').onclick = exportChat;
$('#open').onclick = openSidebar; $('#close').onclick = closeSidebar; $('#scrim').onclick = closeSidebar;
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); newChat(); }
  if (e.key === 'Escape') closeSidebar();
});

setTheme((localStorage.getItem('orbit-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark');
render();
