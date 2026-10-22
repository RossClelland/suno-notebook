'use strict';

// ---------- storage ----------

const STORE_KEY = 'song-notebook-v1';

const STATUSES = [
  { id: 'idea', label: 'Idea' },
  { id: 'writing', label: 'Writing' },
  { id: 'generating', label: 'Generating' },
  { id: 'keeper', label: 'Keeper' },
  { id: 'released', label: 'Released' },
];

const LYRIC_TAGS = ['[Intro]', '[Verse]', '[Pre-Chorus]', '[Chorus]', '[Bridge]', '[Instrumental]', '[Break]', '[Outro]', '[End]'];

const CHECKLIST = [
  { id: 'final', label: 'Pick the final take' },
  { id: 'rights', label: 'Check your Suno plan covers commercial use' },
  { id: 'download', label: 'Download the audio (WAV if available)' },
  { id: 'art', label: 'Make the cover art' },
  { id: 'meta', label: 'Write title, credits and description' },
  { id: 'upload', label: 'Upload to your distributor' },
  { id: 'date', label: 'Set a release date' },
  { id: 'share', label: 'Share it on socials' },
];

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return { songs: data.songs || [], styles: data.styles || [] };
    }
  } catch (e) { /* fall through to empty */ }
  return { songs: [], styles: [] };
}

let saveTimer = null;
function save(immediate) {
  clearTimeout(saveTimer);
  const write = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('Could not save. Export a backup from More.'); }
  };
  if (immediate) write(); else saveTimer = setTimeout(write, 300);
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const now = () => new Date().toISOString();

// ---------- helpers ----------

const $view = document.getElementById('view');
const $title = document.getElementById('title');
const $back = document.getElementById('backBtn');
const $action = document.getElementById('actionBtn');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
}

async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast((what || 'Text') + ' copied');
}

function statusLabel(id) {
  return (STATUSES.find(s => s.id === id) || STATUSES[0]).label;
}

function relTime(iso) {
  const d = (Date.now() - new Date(iso)) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return Math.floor(d / 60) + 'm ago';
  if (d < 86400) return Math.floor(d / 3600) + 'h ago';
  if (d < 86400 * 30) return Math.floor(d / 86400) + 'd ago';
  return new Date(iso).toLocaleDateString();
}

function setHeader(title, { back = false, action = null } = {}) {
  $title.textContent = title;
  document.title = title === 'Songs' ? 'Song Notebook' : title + ' · Song Notebook';
  $back.hidden = !back;
  $action.hidden = !action;
  $action.onclick = action;
}

function setTab(name) {
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === name));
}

// ---------- songs list ----------

let songFilter = 'all';
let songQuery = '';

function newSong() {
  const song = {
    id: uid(), title: '', status: 'idea', style: '', exclude: '', lyrics: '', notes: '',
    takes: [], checklist: {}, created: now(), updated: now(),
  };
  state.songs.unshift(song);
  save(true);
  location.hash = '#/song/' + song.id;
}

function renderSongs() {
  setTab('songs');
  setHeader('Songs', { action: newSong });

  if (!state.songs.length) {
    $view.innerHTML = `
      <div class="empty">
        <p><strong>No songs yet.</strong></p>
        <p>Keep each song's style prompt, lyrics, best takes and release steps in one place.</p>
        <button class="btn primary" id="firstSong">Start a song</button>
      </div>`;
    document.getElementById('firstSong').onclick = newSong;
    return;
  }

  const counts = Object.fromEntries(STATUSES.map(s => [s.id, 0]));
  state.songs.forEach(s => counts[s.status] = (counts[s.status] || 0) + 1);

  $view.innerHTML = `
    <input type="search" id="q" placeholder="Search songs, lyrics, styles" value="${esc(songQuery)}">
    <div class="chips" style="margin-top:10px">
      <button class="chip ${songFilter === 'all' ? 'on' : ''}" data-f="all">All ${state.songs.length}</button>
      ${STATUSES.map(s => `<button class="chip ${songFilter === s.id ? 'on' : ''}" data-f="${s.id}">${s.label} ${counts[s.id] || 0}</button>`).join('')}
    </div>
    <div id="list"></div>`;

  const drawList = () => {
    const q = songQuery.trim().toLowerCase();
    const songs = state.songs
      .filter(s => songFilter === 'all' || s.status === songFilter)
      .filter(s => !q || [s.title, s.lyrics, s.style, s.notes].join(' ').toLowerCase().includes(q))
      .sort((a, b) => b.updated.localeCompare(a.updated));
    document.getElementById('list').innerHTML = songs.length ? songs.map(s => `
      <a class="card" href="#/song/${s.id}">
        <div class="row" style="justify-content:space-between">
          <h3>${esc(s.title || 'Untitled song')}</h3>
          <span class="pill ${s.status}">${statusLabel(s.status)}</span>
        </div>
        <p>${esc(s.style ? s.style.slice(0, 80) : 'No style yet')}</p>
        <p>${s.takes.length} take${s.takes.length === 1 ? '' : 's'} · edited ${relTime(s.updated)}</p>
      </a>`).join('') : '<p class="empty">Nothing matches.</p>';
  };

  document.getElementById('q').oninput = e => { songQuery = e.target.value; drawList(); };
  $view.querySelectorAll('.chip').forEach(c => c.onclick = () => { songFilter = c.dataset.f; renderSongs(); });
  drawList();
}

// ---------- song editor ----------

function renderSong(id) {
  const song = state.songs.find(s => s.id === id);
  if (!song) { location.hash = '#/'; return; }
  setTab('songs');
  setHeader(song.title || 'Untitled song', { back: true });

  const touch = () => { song.updated = now(); save(); };
  const doneCount = CHECKLIST.filter(c => song.checklist[c.id]).length;

  $view.innerHTML = `
    <label for="t">Title</label>
    <input type="text" id="t" value="${esc(song.title)}" placeholder="Song title">

    <label for="st">Status</label>
    <select id="st">${STATUSES.map(s => `<option value="${s.id}" ${s.id === song.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select>

    <label for="sty">Style prompt</label>
    <textarea id="sty" placeholder="e.g. melancholic indie folk, fingerpicked acoustic, warm male vocal, 90 bpm">${esc(song.style)}</textarea>
    <div class="counter" id="styCount"></div>
    <div class="btn-row">
      <button class="btn small" id="copySty">Copy style</button>
      ${state.styles.length ? `<select id="pickSty" style="width:auto;flex:1"><option value="">Use a saved style…</option>${state.styles.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>` : ''}
      <button class="btn small" id="saveSty">Save to library</button>
    </div>

    <label for="ex">Exclude styles</label>
    <input type="text" id="ex" value="${esc(song.exclude)}" placeholder="e.g. autotune, EDM drops">

    <label for="ly">Lyrics</label>
    <div class="tagbar">${LYRIC_TAGS.map(t => `<button class="btn small" data-tag="${t}">${t}</button>`).join('')}</div>
    <textarea id="ly" class="lyrics" placeholder="[Verse]&#10;Write your lyrics here…">${esc(song.lyrics)}</textarea>
    <div class="counter" id="lyCount"></div>
    <div class="btn-row"><button class="btn small" id="copyLy">Copy lyrics</button></div>

    <h2 class="section-title">Takes</h2>
    <p class="hint">Paste the Suno link for any generation worth keeping, then rate it.</p>
    <div id="takes"></div>
    <div class="row">
      <input type="url" id="takeUrl" placeholder="https://suno.com/song/…" style="flex:1">
      <button class="btn primary" id="addTake">Add</button>
    </div>

    <h2 class="section-title">Release checklist <span class="hint">${doneCount}/${CHECKLIST.length}</span></h2>
    <div id="checks">${CHECKLIST.map(c => `
      <label class="check ${song.checklist[c.id] ? 'done' : ''}" style="margin:0;font-size:15px;font-weight:400;color:var(--text)">
        <input type="checkbox" data-c="${c.id}" ${song.checklist[c.id] ? 'checked' : ''}><span>${c.label}</span>
      </label>`).join('')}</div>

    <label for="nt">Notes</label>
    <textarea id="nt" placeholder="Ideas, what to try next, which version to use…">${esc(song.notes)}</textarea>

    <div class="btn-row" style="margin-top:24px">
      <button class="btn small" id="dup">Duplicate</button>
      <button class="btn small danger" id="del">Delete song</button>
    </div>`;

  const $ = id => document.getElementById(id);
  const counts = () => {
    $('styCount').textContent = song.style.length + ' characters';
    $('lyCount').textContent = song.lyrics.length + ' characters';
  };
  counts();

  $('t').oninput = e => { song.title = e.target.value; $title.textContent = song.title || 'Untitled song'; touch(); };
  $('st').onchange = e => { song.status = e.target.value; touch(); };
  $('sty').oninput = e => { song.style = e.target.value; counts(); touch(); };
  $('ex').oninput = e => { song.exclude = e.target.value; touch(); };
  $('ly').oninput = e => { song.lyrics = e.target.value; counts(); touch(); };
  $('nt').oninput = e => { song.notes = e.target.value; touch(); };

  $('copySty').onclick = () => copy(song.style, 'Style');
  $('copyLy').onclick = () => copy(song.lyrics, 'Lyrics');

  if ($('pickSty')) $('pickSty').onchange = e => {
    const s = state.styles.find(x => x.id === e.target.value);
    if (!s) return;
    song.style = s.prompt;
    s.uses = (s.uses || 0) + 1;
    $('sty').value = s.prompt;
    e.target.value = '';
    counts(); touch();
    toast('Style applied');
  };

  $('saveSty').onclick = () => {
    if (!song.style.trim()) { toast('Write a style first'); return; }
    if (state.styles.some(s => s.prompt === song.style)) { toast('Already in your library'); return; }
    const name = prompt('Name this style', song.title || 'New style');
    if (name === null) return;
    state.styles.unshift({ id: uid(), name: name || 'Untitled style', prompt: song.style, tags: '', uses: 1, created: now() });
    save(true);
    toast('Saved to library');
  };

  $view.querySelectorAll('[data-tag]').forEach(b => b.onclick = () => {
    const ta = $('ly');
    const pos = ta.selectionStart ?? ta.value.length;
    const before = ta.value.slice(0, pos);
    const insert = (before && !before.endsWith('\n') ? '\n\n' : '') + b.dataset.tag + '\n';
    ta.value = before + insert + ta.value.slice(ta.selectionEnd ?? pos);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = pos + insert.length;
    song.lyrics = ta.value; counts(); touch();
  });

  const drawTakes = () => {
    const sorted = [...song.takes].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    $('takes').innerHTML = sorted.map(t => `
      <div class="take" data-id="${t.id}">
        <div class="grow">
          <input type="text" class="takeLabel" value="${esc(t.label)}" placeholder="Label, e.g. v2 slower" style="padding:6px 8px;margin-bottom:4px">
          <a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.url.replace(/^https?:\/\//, ''))}</a>
          <div class="stars">${[1, 2, 3, 4, 5].map(n => `<button data-r="${n}" class="${n <= (t.rating || 0) ? 'on' : ''}" aria-label="${n} stars">★</button>`).join('')}</div>
        </div>
        <button class="btn small danger" data-del="1" aria-label="Remove take">✕</button>
      </div>`).join('');
    $('takes').querySelectorAll('.take').forEach(el => {
      const t = song.takes.find(x => x.id === el.dataset.id);
      el.querySelector('.takeLabel').oninput = e => { t.label = e.target.value; touch(); };
      el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
        t.rating = t.rating === +b.dataset.r ? 0 : +b.dataset.r; touch(); drawTakes();
      });
      el.querySelector('[data-del]').onclick = () => {
        if (!confirm('Remove this take?')) return;
        song.takes = song.takes.filter(x => x.id !== t.id); touch(); drawTakes();
      };
    });
  };
  drawTakes();

  $('addTake').onclick = () => {
    let url = $('takeUrl').value.trim();
    if (!url) { toast('Paste a link first'); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    song.takes.push({ id: uid(), url, label: 'Take ' + (song.takes.length + 1), rating: 0, added: now() });
    if (song.status === 'idea' || song.status === 'writing') { song.status = 'generating'; $('st').value = 'generating'; }
    $('takeUrl').value = '';
    touch(); drawTakes();
  };

  $('checks').querySelectorAll('input').forEach(cb => cb.onchange = () => {
    song.checklist[cb.dataset.c] = cb.checked;
    cb.closest('.check').classList.toggle('done', cb.checked);
    if (CHECKLIST.every(c => song.checklist[c.id]) && song.status !== 'released') {
      song.status = 'released'; $('st').value = 'released'; toast('Released! 🎉');
    }
    touch();
  });

  $('dup').onclick = () => {
    const copySong = JSON.parse(JSON.stringify(song));
    Object.assign(copySong, { id: uid(), title: (song.title || 'Untitled song') + ' (copy)', takes: [], checklist: {}, status: 'writing', created: now(), updated: now() });
    state.songs.unshift(copySong);
    save(true);
    location.hash = '#/song/' + copySong.id;
  };

  $('del').onclick = () => {
    if (!confirm('Delete this song? This cannot be undone.')) return;
    state.songs = state.songs.filter(s => s.id !== song.id);
    save(true);
    location.hash = '#/';
  };
}

// ---------- style library ----------

function renderStyles() {
  setTab('styles');
  const add = () => {
    state.styles.unshift({ id: uid(), name: '', prompt: '', tags: '', uses: 0, created: now() });
    save(true);
    renderStyles();
    const first = $view.querySelector('.styleName');
    if (first) first.focus();
  };
  setHeader('Styles', { action: add });

  if (!state.styles.length) {
    $view.innerHTML = `
      <div class="empty">
        <p><strong>Your style library is empty.</strong></p>
        <p>Save the style prompts that gave you great results, so you can reuse them on any song.</p>
        <button class="btn primary" id="firstStyle">Add a style</button>
      </div>`;
    document.getElementById('firstStyle').onclick = add;
    return;
  }

  $view.innerHTML = state.styles.map(s => `
    <div class="card" data-id="${s.id}">
      <input type="text" class="styleName" value="${esc(s.name)}" placeholder="Name, e.g. Dreamy synthpop" style="font-weight:700;margin-bottom:8px">
      <textarea class="stylePrompt" placeholder="Style prompt">${esc(s.prompt)}</textarea>
      <div class="row" style="justify-content:space-between;margin-top:8px">
        <span class="hint">Used ${s.uses || 0} time${s.uses === 1 ? '' : 's'}</span>
        <span class="row">
          <button class="btn small" data-copy="1">Copy</button>
          <button class="btn small" data-new="1">New song</button>
          <button class="btn small danger" data-del="1" aria-label="Delete style">✕</button>
        </span>
      </div>
    </div>`).join('');

  $view.querySelectorAll('.card').forEach(el => {
    const s = state.styles.find(x => x.id === el.dataset.id);
    el.querySelector('.styleName').oninput = e => { s.name = e.target.value; save(); };
    el.querySelector('.stylePrompt').oninput = e => { s.prompt = e.target.value; save(); };
    el.querySelector('[data-copy]').onclick = () => { s.uses = (s.uses || 0) + 1; save(); copy(s.prompt, 'Style'); };
    el.querySelector('[data-new]').onclick = () => {
      s.uses = (s.uses || 0) + 1;
      const song = { id: uid(), title: '', status: 'writing', style: s.prompt, exclude: '', lyrics: '', notes: '', takes: [], checklist: {}, created: now(), updated: now() };
      state.songs.unshift(song);
      save(true);
      location.hash = '#/song/' + song.id;
    };
    el.querySelector('[data-del]').onclick = () => {
      if (!confirm('Delete this style?')) return;
      state.styles = state.styles.filter(x => x.id !== s.id);
      save(true);
      renderStyles();
    };
  });
}

// ---------- settings ----------

let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });

function renderSettings() {
  setTab('settings');
  setHeader('More');
  $view.innerHTML = `
    ${installPrompt ? `<div class="card"><h3>Install the app</h3><p>Add Song Notebook to your home screen so it opens like any other app, even offline.</p><div class="btn-row"><button class="btn primary" id="install">Install</button></div></div>` : ''}
    <div class="card">
      <h3>Backup</h3>
      <p>Your songs are stored on this device only. Export a backup now and then, and import it to move to a new phone.</p>
      <div class="btn-row">
        <button class="btn" id="export">Export backup</button>
        <button class="btn" id="import">Import backup</button>
      </div>
      <input type="file" id="file" accept="application/json,.json" hidden>
    </div>
    <div class="card">
      <h3>About</h3>
      <p>${state.songs.length} songs · ${state.styles.length} saved styles</p>
      <p>Song Notebook is an independent tool and is not affiliated with Suno.</p>
    </div>`;

  const $ = id => document.getElementById(id);
  if ($('install')) $('install').onclick = async () => {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    renderSettings();
  };

  $('export').onclick = () => {
    const blob = new Blob([JSON.stringify({ app: 'song-notebook', version: 1, exported: now(), ...state }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'song-notebook-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  $('import').onclick = () => $('file').click();
  $('file').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.songs)) throw new Error('bad file');
      const songIds = new Set(state.songs.map(s => s.id));
      const styleIds = new Set(state.styles.map(s => s.id));
      const newSongs = data.songs.filter(s => !songIds.has(s.id));
      const newStyles = (data.styles || []).filter(s => !styleIds.has(s.id));
      state.songs.push(...newSongs);
      state.styles.push(...newStyles);
      save(true);
      toast(`Imported ${newSongs.length} songs, ${newStyles.length} styles`);
      renderSettings();
    } catch (err) {
      toast('That file is not a Song Notebook backup');
    }
  };
}

// ---------- router ----------

function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  window.scrollTo(0, 0);
  if (h.startsWith('/song/')) renderSong(h.slice(6));
  else if (h === '/styles') renderStyles();
  else if (h === '/settings') renderSettings();
  else renderSongs();
}

$back.onclick = () => { location.hash = '#/'; };
window.addEventListener('hashchange', route);
window.addEventListener('pagehide', () => save(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });
route();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
