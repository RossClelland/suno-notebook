'use strict';

// ---------- constants ----------

const STORE_KEY = 'song-notebook-v1';
// Unsaved edits are stashed here, so switching to Suno and back never loses work
// even if Android closes the browser in the background.
const DRAFT_KEY = 'song-notebook-draft';

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

// Fields the editor compares to decide whether there are unsaved changes.
const DRAFT_FIELDS = ['title', 'status', 'style', 'exclude', 'lyrics', 'notes', 'checklist'];

// ---------- storage ----------

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const now = () => new Date().toISOString();

let state = load();

function load() {
  let data = { songs: [], styles: [] };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      data = { songs: parsed.songs || [], styles: parsed.styles || [] };
    }
  } catch (e) { /* start empty */ }
  data.songs.forEach(migrateSong);
  return data;
}

// Songs saved before version history existed get a v1 of their lyrics and style.
function migrateSong(s) {
  if (!s.lyricVersions) s.lyricVersions = s.lyrics ? [{ v: 1, text: s.lyrics, at: s.updated || now() }] : [];
  if (!s.styleVersions) s.styleVersions = (s.style || s.exclude) ? [{ v: 1, style: s.style || '', exclude: s.exclude || '', at: s.updated || now() }] : [];
  s.takes = s.takes || [];
  s.checklist = s.checklist || {};
  s.takes.forEach(t => {
    if (t.lyricV === undefined) t.lyricV = latestV(s.lyricVersions);
    if (t.styleV === undefined) t.styleV = latestV(s.styleVersions);
  });
}

function latestV(list) { return list.length ? list[list.length - 1].v : 0; }

let saveTimer = null;
function save(immediate) {
  clearTimeout(saveTimer);
  const write = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('Could not save. Export a backup from More.'); }
  };
  if (immediate) write(); else saveTimer = setTimeout(write, 300);
}

// Ask the browser not to clear our data when the phone runs low on space.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------- helpers ----------

const $view = document.getElementById('view');
const $title = document.getElementById('title');
const $back = document.getElementById('backBtn');
const $action = document.getElementById('actionBtn');
const $save = document.getElementById('saveBtn');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2000);
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

function setHeader(title, { back = false, action = null, saveBtn = null } = {}) {
  $title.textContent = title;
  document.title = title === 'Songs' ? 'Song Notebook' : title + ' · Song Notebook';
  $back.hidden = !back;
  $action.hidden = !action;
  $action.onclick = action;
  $save.hidden = !saveBtn;
  $save.onclick = saveBtn;
}

function setTab(name) {
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === name));
}

// A small dialog. buttons: [{ label, value, kind }]. Resolves with the chosen value, or null if dismissed.
function dialog({ title, body = '', html = '', buttons = [{ label: 'OK', value: true, kind: 'primary' }], onOpen }) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true">
        <h3>${esc(title)}</h3>
        ${body ? `<p>${esc(body)}</p>` : ''}
        ${html}
        <div class="btn-row">${buttons.map((b, i) => `<button class="btn ${b.kind || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>
      </div>`;
    const close = v => { wrap.remove(); resolve(v); };
    wrap.addEventListener('click', e => { if (e.target === wrap) close(null); });
    wrap.querySelectorAll('[data-i]').forEach(b => b.onclick = () => close(buttons[+b.dataset.i].value));
    document.body.appendChild(wrap);
    if (onOpen) onOpen(wrap);
  });
}

// ---------- lyrics tidy helpers ----------

const SECTION_RE = /^\s*(?:#{1,6}\s*)?(?:\*\*|__|\*)?\s*[\[(]?\s*(intro|verse|pre[- ]?chorus|post[- ]?chorus|chorus|bridge|hook|refrain|outro|instrumental|interlude|break|solo|breakdown)(\s*\d+)?\s*[\])]?\s*:?\s*(?:\*\*|__|\*)?\s*$/i;
const FIELD_RE = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*(title|song title|style|style prompt|genre|lyrics)\s*(?::\s*(?:\*\*|__)?|(?:\*\*|__)\s*:|(?:\*\*|__)?\s*$)\s*(.*)$/i;
const CHATTER_RE = /^(sure|here('|’)s|here is|certainly|absolutely|of course|okay|ok,|great|let me know|feel free|i hope|hope you|would you like|want me to|if you('|’)d like|enjoy|this song|these lyrics|note:|notes:|tip:)/i;

function sectionTag(name, num) {
  const n = name.toLowerCase().replace(/\s+/g, '-');
  const map = { 'pre-chorus': 'Pre-Chorus', 'prechorus': 'Pre-Chorus', 'post-chorus': 'Post-Chorus', 'postchorus': 'Post-Chorus' };
  const label = map[n] || name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  return '[' + label + (num ? ' ' + num.trim() : '') + ']';
}

function stripMarkdown(line) {
  return line
    .replace(/^\s*>\s?/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|\s)\*(\S.*?\S|\S)\*(?=\s|$)/g, '$1$2')
    .replace(/^\s*[-*]\s+/, '')
    .replace(/\s+$/, '');
}

// Turns pasted text into { title, style, lyrics } with Suno section tags.
function parseAiText(raw) {
  const lines = raw.replace(/\r\n?/g, '\n').replace(/```[a-z]*\n?/gi, '').split('\n');
  let title = '', style = '';
  const out = [];
  let started = false;

  for (let line of lines) {
    const field = line.match(FIELD_RE);
    if (field && !SECTION_RE.test(line)) {
      const key = field[1].toLowerCase();
      const val = stripMarkdown(field[2]).replace(/^["“]|["”]$/g, '').trim();
      if (key.includes('title')) { if (!title) title = val; continue; }
      if (key === 'lyrics') { started = true; if (val) out.push(val); continue; }
      if (!style && val) { style = val; continue; }
      if (!val) continue;
    }
    const sec = line.match(SECTION_RE);
    if (sec) {
      started = true;
      if (out.length && out[out.length - 1] !== '') out.push('');
      out.push(sectionTag(sec[1], sec[2]));
      continue;
    }
    if (/^\s*\[.+\]\s*$/.test(line)) {
      started = true;
      if (out.length && out[out.length - 1] !== '') out.push('');
      out.push(line.trim());
      continue;
    }
    // A markdown heading before the lyrics is usually the song title.
    const heading = line.match(/^\s*#{1,6}\s*(.+)$/);
    if (heading && !started) { if (!title) title = stripMarkdown(heading[1]).replace(/^["“]|["”]$/g, ''); continue; }
    if (!started) {
      if (!line.trim() || CHATTER_RE.test(line.trim())) continue;
      started = true;
    }
    out.push(stripMarkdown(line));
  }

  // Drop sign-off chatter at the end ("Let me know if you'd like changes!").
  while (out.length && (out[out.length - 1] === '' || CHATTER_RE.test(out[out.length - 1].trim()))) out.pop();

  const lyrics = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title, style, lyrics };
}

function tidyLyrics(text) {
  return parseAiText(text).lyrics || text;
}

// ---------- songs list ----------

let songFilter = 'all';
let songQuery = '';
let pendingDraft = null; // prefill for the next new song

function blankSong(extra) {
  return Object.assign({
    id: uid(), title: '', status: 'idea', style: '', exclude: '', lyrics: '', notes: '',
    takes: [], checklist: {}, lyricVersions: [], styleVersions: [], created: now(), updated: now(),
  }, extra || {});
}

function newSong(extra) {
  pendingDraft = blankSong(extra);
  location.hash = '#/new';
}

function renderSongs() {
  setTab('songs');
  setHeader('Songs', { action: () => newSong() });

  if (!state.songs.length) {
    $view.innerHTML = `
      <div class="empty">
        <p><strong>No songs yet.</strong></p>
        <p>Keep each song's style prompt, lyrics, best takes and release steps in one place.</p>
        <button class="btn primary" id="firstSong">Start a song</button>
      </div>`;
    document.getElementById('firstSong').onclick = () => newSong();
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
        <p>${s.takes.length} take${s.takes.length === 1 ? '' : 's'} · lyrics v${latestV(s.lyricVersions)} · style v${latestV(s.styleVersions)} · ${relTime(s.updated)}</p>
      </a>`).join('') : '<p class="empty">Nothing matches.</p>';
  };

  document.getElementById('q').oninput = e => { songQuery = e.target.value; drawList(); };
  $view.querySelectorAll('.chip').forEach(c => c.onclick = () => { songFilter = c.dataset.f; renderSongs(); });
  drawList();
}

// ---------- song editor ----------

// The editor works on a copy (draft). Nothing reaches storage until Save,
// and leaving with unsaved changes asks first (see the router guard below).
let editor = null;

function snapshot(s) {
  return JSON.stringify(DRAFT_FIELDS.map(f => s[f]));
}

function readStash() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch (e) { return null; }
}

function clearStash() {
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
}

function stashDraft() {
  if (!editor) return;
  try {
    if (isDirty()) localStorage.setItem(DRAFT_KEY, JSON.stringify({ isNew: editor.isNew, draft: editor.draft }));
    else clearStash();
  } catch (e) { /* storage full: the save prompt still protects the edits */ }
}

function isEmptySong(s) {
  return !s.title.trim() && !s.style.trim() && !s.exclude.trim() && !s.lyrics.trim() && !s.notes.trim() && !s.takes.length;
}

function isDirty() {
  if (!editor) return false;
  if (editor.isNew) return !isEmptySong(editor.draft);
  return snapshot(editor.draft) !== editor.base;
}

// Writes the draft into storage, adding a new lyric or style version when either changed.
function commit() {
  const d = editor.draft;
  let song = state.songs.find(s => s.id === d.id);
  if (!song) {
    song = blankSong({ id: d.id, created: d.created });
    state.songs.unshift(song);
  }
  const lastLyric = song.lyricVersions[song.lyricVersions.length - 1];
  if (d.lyrics !== (lastLyric ? lastLyric.text : '') && (d.lyrics.trim() || lastLyric)) {
    song.lyricVersions.push({ v: latestV(song.lyricVersions) + 1, text: d.lyrics, at: now() });
  }
  const lastStyle = song.styleVersions[song.styleVersions.length - 1];
  const styleChanged = !lastStyle ? (d.style.trim() || d.exclude.trim()) : (d.style !== lastStyle.style || d.exclude !== lastStyle.exclude);
  if (styleChanged) {
    song.styleVersions.push({ v: latestV(song.styleVersions) + 1, style: d.style, exclude: d.exclude, at: now() });
  }
  DRAFT_FIELDS.forEach(f => song[f] = JSON.parse(JSON.stringify(d[f])));
  clearStash();
  song.takes = d.takes;
  song.updated = now();
  save(true);

  d.lyricVersions = song.lyricVersions;
  d.styleVersions = song.styleVersions;
  editor.isNew = false;
  editor.base = snapshot(d);
  if (location.hash === '#/new') {
    history.replaceState(null, '', '#/song/' + d.id);
    currentHash = location.hash;
  }
  return song;
}

function renderSong(id) {
  let draft, base, isNew = false;
  const stash = readStash();
  let restored = false;
  if (id === null) {
    if (!pendingDraft && stash && stash.isNew) { draft = stash.draft; restored = true; }
    else draft = pendingDraft || blankSong();
    pendingDraft = null;
    isNew = true;
    base = snapshot(blankSong());
  } else {
    const song = state.songs.find(s => s.id === id);
    if (!song) { clearStash(); location.hash = '#/'; return; }
    base = snapshot(song);
    if (stash && !stash.isNew && stash.draft.id === id) { draft = stash.draft; restored = true; }
    else draft = JSON.parse(JSON.stringify(song));
    // Versions and takes always come from storage, never from an old stash.
    draft.lyricVersions = song.lyricVersions;
    draft.styleVersions = song.styleVersions;
    draft.takes = song.takes;
  }
  editor = { draft, isNew, base };
  if (restored) setTimeout(() => toast('Restored your unsaved changes'), 300);
  setTab('songs');

  const refreshSaveBtn = () => {
    const dirty = isDirty();
    $save.disabled = !dirty;
    $save.textContent = dirty ? 'Save' : 'Saved';
  };
  const doSave = () => {
    if (isNew && isEmptySong(draft)) { toast('Nothing to save yet'); return; }
    commit();
    isNew = false;
    toast('Saved');
    renderVersionInfo();
    drawTakes();
    refreshSaveBtn();
  };
  setHeader(draft.title || (isNew ? 'New song' : 'Untitled song'), { back: true, saveBtn: doSave });

  const doneCount = CHECKLIST.filter(c => draft.checklist[c.id]).length;

  const checklistOpen = draft.status === 'keeper' || draft.status === 'released';

  $view.innerHTML = `
    <div class="row song-head">
      <input type="text" id="t" value="${esc(draft.title)}" placeholder="Song title" aria-label="Title" style="flex:1">
      <select id="st" aria-label="Status" style="width:auto">${STATUSES.map(s => `<option value="${s.id}" ${s.id === draft.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
    </div>

    <label for="nt">What it's about</label>
    <textarea id="nt" class="short" placeholder="Theme, story, mood, lines you like…">${esc(draft.notes)}</textarea>

    <section class="card section">
      <div class="section-head">
        <h3>Lyrics <span class="ver" id="lyVer"></span></h3>
        <span class="hint" id="lyCount"></span>
      </div>
      <div class="tagbar">${LYRIC_TAGS.map(t => `<button class="btn small" data-tag="${t}">${t}</button>`).join('')}</div>
      <textarea id="ly" class="lyrics" placeholder="[Verse]&#10;Write your lyrics here…" aria-label="Lyrics">${esc(draft.lyrics)}</textarea>
      <div class="btn-row">
        <button class="btn small primary" id="copyLy">Copy lyrics</button>
        <button class="btn small" id="tidyLy">Tidy</button>
      </div>
    </section>

    <section class="card section">
      <div class="section-head">
        <h3>Style <span class="ver" id="styVer"></span></h3>
        <span class="hint" id="styCount"></span>
      </div>
      <textarea id="sty" placeholder="e.g. melancholic indie folk, fingerpicked acoustic, warm male vocal, 90 bpm" aria-label="Style prompt">${esc(draft.style)}</textarea>
      <label for="ex">Exclude styles</label>
      <input type="text" id="ex" value="${esc(draft.exclude)}" placeholder="e.g. autotune, EDM drops">
      <div class="btn-row">
        <button class="btn small primary" id="copySty">Copy style</button>
        <button class="btn small" id="saveSty">Save to library</button>
        ${state.styles.length ? `<select id="pickSty" style="width:auto;flex:1"><option value="">Use a saved style…</option>${state.styles.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>` : ''}
      </div>
    </section>

    <section class="card section">
      <h3>Takes</h3>
      <p class="hint">Paste the Suno link for any generation worth keeping. Each take remembers which lyrics and style versions it used.</p>
      <div id="takes"></div>
      <div class="row">
        <input type="url" id="takeUrl" placeholder="https://suno.com/song/…" style="flex:1">
        <button class="btn primary" id="addTake">Add</button>
      </div>
    </section>

    <details class="card section" ${checklistOpen ? 'open' : ''}>
      <summary><h3>Release checklist</h3><span class="hint" id="checkCount">${doneCount}/${CHECKLIST.length}</span></summary>
      <div id="checks">${CHECKLIST.map(c => `
        <label class="check ${draft.checklist[c.id] ? 'done' : ''}">
          <input type="checkbox" data-c="${c.id}" ${draft.checklist[c.id] ? 'checked' : ''}><span>${c.label}</span>
        </label>`).join('')}</div>
    </details>

    <div class="btn-row" style="margin-top:16px">
      ${isNew ? '' : '<button class="btn small" id="dup">Duplicate</button>'}
      ${isNew ? '' : '<button class="btn small danger" id="del">Delete song</button>'}
    </div>`;

  const $ = id => document.getElementById(id);
  const changed = () => { refreshSaveBtn(); renderVersionInfo(); stashDraft(); };
  const counts = () => {
    $('styCount').textContent = draft.style.length + ' chars';
    $('lyCount').textContent = draft.lyrics.length + ' chars';
  };
  counts();

  function renderVersionInfo() {
    const lv = latestV(draft.lyricVersions);
    const sv = latestV(draft.styleVersions);
    const lastLyric = draft.lyricVersions[draft.lyricVersions.length - 1];
    const lastStyle = draft.styleVersions[draft.styleVersions.length - 1];
    const lyEdited = (lastLyric ? lastLyric.text : '') !== draft.lyrics;
    const styEdited = lastStyle ? (lastStyle.style !== draft.style || lastStyle.exclude !== draft.exclude) : !!(draft.style || draft.exclude);
    $('lyVer').innerHTML = lv || lyEdited ? `<button class="ver-btn" id="lyHist">${lv ? 'v' + lv : 'new'}${lyEdited ? ' · edited' : ''}${lv > 1 ? ' · history' : ''}</button>` : '';
    $('styVer').innerHTML = sv || styEdited ? `<button class="ver-btn" id="styHist">${sv ? 'v' + sv : 'new'}${styEdited ? ' · edited' : ''}${sv > 1 ? ' · history' : ''}</button>` : '';
    if ($('lyHist')) $('lyHist').onclick = e => { e.preventDefault(); showHistory('lyrics'); };
    if ($('styHist')) $('styHist').onclick = e => { e.preventDefault(); showHistory('style'); };
  }
  renderVersionInfo();
  refreshSaveBtn();

  async function showHistory(kind) {
    const list = kind === 'lyrics' ? draft.lyricVersions : draft.styleVersions;
    if (!list.length) { toast('Save to create the first version'); return; }
    const items = [...list].reverse().map(v => {
      const text = kind === 'lyrics' ? v.text : v.style + (v.exclude ? '\nExclude: ' + v.exclude : '');
      const takes = draft.takes.filter(t => (kind === 'lyrics' ? t.lyricV : t.styleV) === v.v).length;
      return `<div class="version">
        <div class="row" style="justify-content:space-between">
          <strong>v${v.v}</strong>
          <span class="hint">${relTime(v.at)}${takes ? ` · ${takes} take${takes === 1 ? '' : 's'}` : ''}</span>
        </div>
        <pre>${esc(text.length > 400 ? text.slice(0, 400) + '…' : text)}</pre>
        <div class="btn-row">
          <button class="btn small" data-copy="${v.v}">Copy</button>
          <button class="btn small" data-restore="${v.v}">Use this version</button>
        </div>
      </div>`;
    }).join('');
    let chosen = null;
    await dialog({
      title: (kind === 'lyrics' ? 'Lyrics' : 'Style') + ' history',
      html: `<div class="versions">${items}</div>`,
      buttons: [{ label: 'Close', value: null }],
      onOpen: wrap => {
        wrap.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => {
          const v = list.find(x => x.v === +b.dataset.copy);
          copy(kind === 'lyrics' ? v.text : v.style, kind === 'lyrics' ? 'Lyrics' : 'Style');
        });
        wrap.querySelectorAll('[data-restore]').forEach(b => b.onclick = () => {
          chosen = list.find(x => x.v === +b.dataset.restore);
          wrap.remove();
          applyVersion();
        });
      },
    });
    function applyVersion() {
      if (!chosen) return;
      if (kind === 'lyrics') { draft.lyrics = chosen.text; $('ly').value = chosen.text; }
      else { draft.style = chosen.style; draft.exclude = chosen.exclude; $('sty').value = chosen.style; $('ex').value = chosen.exclude; }
      counts(); changed();
      toast(`Loaded v${chosen.v}. Save to make it current.`);
    }
  }

  $('t').oninput = e => { draft.title = e.target.value; $title.textContent = draft.title || 'Untitled song'; changed(); };
  $('st').onchange = e => { draft.status = e.target.value; changed(); };
  $('sty').oninput = e => { draft.style = e.target.value; counts(); changed(); };
  $('ex').oninput = e => { draft.exclude = e.target.value; changed(); };
  $('ly').oninput = e => { draft.lyrics = e.target.value; counts(); changed(); };
  $('nt').oninput = e => { draft.notes = e.target.value; changed(); };

  $('copySty').onclick = () => copy(draft.style, 'Style');
  $('copyLy').onclick = () => copy(draft.lyrics, 'Lyrics');
  $('tidyLy').onclick = () => {
    const tidy = tidyLyrics(draft.lyrics);
    if (tidy === draft.lyrics) { toast('Already tidy'); return; }
    draft.lyrics = tidy; $('ly').value = tidy; counts(); changed();
    toast('Lyrics tidied');
  };

  if ($('pickSty')) $('pickSty').onchange = e => {
    const s = state.styles.find(x => x.id === e.target.value);
    if (!s) return;
    draft.style = s.prompt;
    s.uses = (s.uses || 0) + 1;
    save();
    $('sty').value = s.prompt;
    e.target.value = '';
    counts(); changed();
    toast('Style applied');
  };

  $('saveSty').onclick = async () => {
    if (!draft.style.trim()) { toast('Write a style first'); return; }
    if (state.styles.some(s => s.prompt === draft.style)) { toast('Already in your library'); return; }
    let input;
    const ok = await dialog({
      title: 'Save style to library',
      html: `<input type="text" id="styName" value="${esc(draft.title || '')}" placeholder="Name, e.g. Dreamy folk">`,
      buttons: [{ label: 'Save', value: true, kind: 'primary' }, { label: 'Cancel', value: null }],
      onOpen: wrap => { input = wrap.querySelector('#styName'); input.focus(); input.select(); },
    });
    if (!ok) return;
    state.styles.unshift({ id: uid(), name: input.value.trim() || 'Untitled style', prompt: draft.style, tags: '', uses: 1, created: now() });
    save(true);
    toast('Saved to library');
  };

  $view.querySelectorAll('[data-tag]').forEach(b => b.onclick = () => {
    const ta = $('ly');
    const pos = ta.selectionStart ?? ta.value.length;
    const before = ta.value.slice(0, pos);
    const insert = (before && !before.endsWith('\n') ? '\n\n' : (before && !before.endsWith('\n\n') ? '\n' : '')) + b.dataset.tag + '\n';
    ta.value = before + insert + ta.value.slice(ta.selectionEnd ?? pos);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = pos + insert.length;
    draft.lyrics = ta.value; counts(); changed();
  });

  function showVersion(kind, v) {
    const list = kind === 'lyrics' ? draft.lyricVersions : draft.styleVersions;
    const ver = list.find(x => x.v === v);
    if (!ver) { toast('No saved version for this take'); return; }
    const text = kind === 'lyrics' ? ver.text : ver.style + (ver.exclude ? '\n\nExclude: ' + ver.exclude : '');
    dialog({
      title: `${kind === 'lyrics' ? 'Lyrics' : 'Style'} v${v}`,
      html: `<pre class="full">${esc(text)}</pre>`,
      buttons: [{ label: 'Copy', value: 'copy', kind: 'primary' }, { label: 'Close', value: null }],
    }).then(r => { if (r === 'copy') copy(kind === 'lyrics' ? ver.text : ver.style, kind === 'lyrics' ? 'Lyrics' : 'Style'); });
  }

  // Takes change storage straight away (with a save of any pending edits),
  // so the take is linked to the exact versions it was generated from.
  const persistTakes = () => {
    if (isNew) return;
    const song = state.songs.find(s => s.id === draft.id);
    if (song) { song.takes = draft.takes; song.updated = now(); save(true); }
  };

  function drawTakes() {
    const sorted = [...draft.takes].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    $('takes').innerHTML = sorted.map(t => `
      <div class="take" data-id="${t.id}">
        <div class="grow">
          <input type="text" class="takeLabel" value="${esc(t.label)}" placeholder="Label, e.g. v2 slower" style="padding:6px 8px;margin-bottom:4px">
          <a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.url.replace(/^https?:\/\//, ''))}</a>
          <div class="row" style="margin-top:4px">
            <div class="stars">${[1, 2, 3, 4, 5].map(n => `<button data-r="${n}" class="${n <= (t.rating || 0) ? 'on' : ''}" aria-label="${n} stars">★</button>`).join('')}</div>
            ${t.lyricV ? `<button class="ver-btn" data-lv="${t.lyricV}">Lyrics v${t.lyricV}</button>` : ''}
            ${t.styleV ? `<button class="ver-btn" data-sv="${t.styleV}">Style v${t.styleV}</button>` : ''}
          </div>
        </div>
        <button class="btn small danger" data-del="1" aria-label="Remove take">✕</button>
      </div>`).join('');
    $('takes').querySelectorAll('.take').forEach(el => {
      const t = draft.takes.find(x => x.id === el.dataset.id);
      el.querySelector('.takeLabel').oninput = e => { t.label = e.target.value; persistTakes(); };
      el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
        t.rating = t.rating === +b.dataset.r ? 0 : +b.dataset.r; persistTakes(); drawTakes();
      });
      const lv = el.querySelector('[data-lv]');
      if (lv) lv.onclick = () => showVersion('lyrics', t.lyricV);
      const sv = el.querySelector('[data-sv]');
      if (sv) sv.onclick = () => showVersion('style', t.styleV);
      el.querySelector('[data-del]').onclick = async () => {
        const ok = await dialog({ title: 'Remove this take?', buttons: [{ label: 'Remove', value: true, kind: 'danger' }, { label: 'Cancel', value: null }] });
        if (!ok) return;
        draft.takes = draft.takes.filter(x => x.id !== t.id); persistTakes(); drawTakes();
      };
    });
  }
  drawTakes();

  $('addTake').onclick = () => {
    let url = $('takeUrl').value.trim();
    if (!url) { toast('Paste a link first'); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (draft.status === 'idea' || draft.status === 'writing') { draft.status = 'generating'; $('st').value = 'generating'; }
    // Save first so the take points at the lyrics and style you just used.
    draft.takes.push({ id: uid(), url, label: 'Take ' + (draft.takes.length + 1), rating: 0, added: now() });
    commit();
    isNew = false;
    const t = draft.takes[draft.takes.length - 1];
    t.lyricV = latestV(draft.lyricVersions);
    t.styleV = latestV(draft.styleVersions);
    persistTakes();
    $('takeUrl').value = '';
    renderVersionInfo(); drawTakes(); refreshSaveBtn();
    toast('Take added and song saved');
  };

  $('checks').querySelectorAll('input').forEach(cb => cb.onchange = () => {
    draft.checklist[cb.dataset.c] = cb.checked;
    cb.closest('.check').classList.toggle('done', cb.checked);
    $('checkCount').textContent = CHECKLIST.filter(c => draft.checklist[c.id]).length + '/' + CHECKLIST.length;
    if (CHECKLIST.every(c => draft.checklist[c.id]) && draft.status !== 'released') {
      draft.status = 'released'; $('st').value = 'released'; toast('Released! 🎉');
    }
    changed();
  });

  if ($('dup')) $('dup').onclick = async () => {
    if (isDirty()) {
      const r = await dialog({ title: 'Save changes first?', body: 'The copy is made from the saved song.', buttons: [{ label: 'Save', value: true, kind: 'primary' }, { label: 'Cancel', value: null }] });
      if (!r) return;
      commit();
    }
    const d = JSON.parse(JSON.stringify(draft));
    newSong({
      title: (d.title || 'Untitled song') + ' (copy)', status: 'writing',
      style: d.style, exclude: d.exclude, lyrics: d.lyrics, notes: d.notes,
    });
  };

  if ($('del')) $('del').onclick = async () => {
    const ok = await dialog({ title: 'Delete this song?', body: 'This cannot be undone.', buttons: [{ label: 'Delete', value: true, kind: 'danger' }, { label: 'Cancel', value: null }] });
    if (!ok) return;
    state.songs = state.songs.filter(s => s.id !== draft.id);
    save(true);
    clearStash();
    editor = null;
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
      save();
      newSong({ status: 'writing', style: s.prompt });
    };
    el.querySelector('[data-del]').onclick = async () => {
      const ok = await dialog({ title: 'Delete this style?', buttons: [{ label: 'Delete', value: true, kind: 'danger' }, { label: 'Cancel', value: null }] });
      if (!ok) return;
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
      <p>Your songs are stored on this device only, inside this browser. Export a backup now and then, and import it to move to a new phone.</p>
      <div class="btn-row">
        <button class="btn" id="export">Export backup</button>
        <button class="btn" id="import">Import backup</button>
      </div>
      <input type="file" id="file" accept="application/json,.json" hidden>
    </div>
    <div class="card">
      <h3>Feedback</h3>
      <p>Song Notebook is new. Tell me what's missing or annoying, it takes two minutes.</p>
      <div class="btn-row"><a class="btn primary" href="https://tally.so/r/Z9j1by" target="_blank" rel="noopener">Send feedback</a></div>
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
    const blob = new Blob([JSON.stringify({ app: 'song-notebook', version: 2, exported: now(), ...state }, null, 2)], { type: 'application/json' });
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
      newSongs.forEach(migrateSong);
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

let currentHash = location.hash || '#/';

function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  currentHash = location.hash || '#/';
  editor = null;
  window.scrollTo(0, 0);
  if (h === '/new') renderSong(null);
  else if (h.startsWith('/song/')) renderSong(h.slice(6));
  else if (h === '/styles') renderStyles();
  else if (h === '/settings') renderSettings();
  else renderSongs();
}

// Leaving a song with unsaved changes (back button, tabs, Android back) asks first.
window.addEventListener('hashchange', async () => {
  if (!isDirty()) { route(); return; }
  const target = location.hash || '#/';
  history.pushState(null, '', currentHash);
  const choice = await dialog({
    title: 'Save changes?',
    body: editor.isNew ? 'This song has not been saved yet.' : 'You have unsaved changes to this song.',
    buttons: [
      { label: 'Save', value: 'save', kind: 'primary' },
      { label: 'Discard', value: 'discard', kind: 'danger' },
      { label: 'Keep editing', value: null },
    ],
  });
  if (!choice) return;
  if (choice === 'save') commit();
  else clearStash();
  editor = null;
  location.hash = target;
});

$back.onclick = () => { location.hash = '#/'; };
window.addEventListener('beforeunload', e => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('pagehide', () => save(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) { save(true); stashDraft(); } });

// Reopen a song that was left with unsaved changes.
const startStash = readStash();
if (startStash && startStash.draft) {
  const want = startStash.isNew ? '#/new' : '#/song/' + startStash.draft.id;
  if (location.hash !== want) history.replaceState(null, '', want);
  currentHash = want;
}
route();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
