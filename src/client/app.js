const $ = s => document.querySelector(s);
const COLORS = ['rose','amber','olive','green','teal','sky','blue','violet','plum','slate'];
const CFG = typeof CONFIG === 'object' && CONFIG ? CONFIG : {};
const TIER_NAMES = Array.isArray(CFG.LEVEL_NAMES) && CFG.LEVEL_NAMES.length ? CFG.LEVEL_NAMES : ['Phrases','Sections','Large form'];
const MK_KINDS = {cadence:['C','Cadence'],modulation:['M','Modulation'],climax:['!','Climax'],texture:['T','Texture change'],elision:['E','Elision'],other:['•','Other']};
// Label suggestions. A course file picks groups by name ("VOCAB": ["Song form", "Production"]) or adds its own
// ({"name": "Fugue", "words": ["Subject", "Answer", "Episode"]}). Letters always come first unless the course places them.
const VOCAB_LIBRARY = [
  ['Letters',['A','B','C','D','E','F','W','X','Y','Z','a','b','c','d','e','f','w','x','y','z']],
  ['Song form',['Intro','Verse','Pre-chorus','Chorus','Post-chorus','Bridge','Break','Solo','Outro','Refrain']],
  ['Classical form',['Exposition','Transition','Development','Retransition','Recapitulation','Coda','Theme','Variation']],
  ['Phrase and theme',['Presentation','Continuation','Antecedent','Consequent','Basic idea','Cadential','Sentence','Period']],
  ['Production',['Intro','Build','Drop','Breakdown','Hook','Riser','Fill','Turnaround','Interlude','Outro']]
];
const VOCAB = (groups => groups.some(g => g[0] === 'Letters') ? groups : [VOCAB_LIBRARY[0], ...groups])(Array.isArray(CFG.VOCAB) && CFG.VOCAB.length
  ? CFG.VOCAB.map(v => typeof v === 'string' ? VOCAB_LIBRARY.find(g => g[0] === v) : v && Array.isArray(v.words) ? [String(v.name || ''), v.words.map(String)] : null).filter(Boolean)
  : VOCAB_LIBRARY.slice(1, 4));
const MARKER_CHIPS = Array.isArray(CFG.MARKER_CHIPS) && CFG.MARKER_CHIPS.length ? CFG.MARKER_CHIPS.map(String) : ['PAC','IAC','HC','DC','PC','V:HC','to V','to vi','Climax','Retransition'];
// Fill patterns for blocks and instrument entries, so they can be told apart by more than color.
const TEXTURES = ['solid','stripes','dots','dashes','circles','lines','crosshatch','grid'];
const EPS = 1e-6;
// True when the page is served by a course's Apps Script web app (google.script.run is there).
const IN_COURSE_FRAME = !!(window.google && google.script && google.script.run);
// Labels this viewer used lately, offered under Recent. Kept on this device only.
const RECENT_KEY = 'listeningmap.recent';
function recentLabels(){ try { const r = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(r) ? r.filter(x => typeof x === 'string').slice(0, 12) : []; } catch(e){ return []; } }
function noteRecent(label){
  label = String(label || '').trim(); if (!label) return;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([label, ...recentLabels().filter(x => x !== label)].slice(0, 12))); } catch(e){}
}
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const gut = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gut')) || 120;
const mk = (start, end, label = '', color = 'slate', o = {}) => ({id: uid(), start, end, label, color, aux: false, elide: false, comment: '', ...o});

// The active lane takes Split, and Enter/Exit for instruments: a level (activeTier) or an instrument (activeInst).
let laneFocus = 'tier', activeInst = null;
let S, pps = 10, sel = null, activeTier = 0, presenting = false, peaks = null, undoStack = [], redoStack = [], pendingAudio = null, waveMsg = '';

/* ---------- time helpers ---------- */
const dur = () => S.source.duration || 1;
function fmt(t){ t = Math.max(0, t); const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + s.toFixed(1).padStart(4, '0'); }
function beatLen(){ return 60 / (S.grid.bpm || 120); }
function barLen(){ return beatLen() * (S.grid.bpb || 4); }
function mpos(t){
  if (!S.grid.on) return '';
  const rel = t - S.grid.offset;
  if (rel < -EPS) return 'pickup';
  const bi = Math.floor(rel / beatLen() + 1e-6);
  return 'm. ' + (Math.floor(bi / S.grid.bpb) + 1) + ' b. ' + (bi % S.grid.bpb + 1);
}
function mbar(t){ if (!S.grid.on) return ''; const rel = t - S.grid.offset; return rel < -EPS ? 'pickup' : 'm. ' + (Math.floor(rel / barLen() + 1e-6) + 1); }
function snapT(t, ev){
  if (S.grid.on && S.grid.snap && !(ev && ev.altKey)){ const b = beatLen(); t = S.grid.offset + Math.round((t - S.grid.offset) / b) * b; }
  return clamp(t, 0, dur());
}

/* ---------- history ---------- */
const snapshot = () => JSON.stringify(S);
function commit(prev){ undoStack.push(prev); if (undoStack.length > 300) undoStack.shift(); redoStack = []; }
function edit(fn){ if (presenting) return; const prev = snapshot(); fn(); if (snapshot() !== prev) commit(prev); renderAll(); }
function doUndo(){ if (!undoStack.length || presenting) return; redoStack.push(snapshot()); S = JSON.parse(undoStack.pop()); validateSel(); renderAll(); renderInfo(); }
function doRedo(){ if (!redoStack.length || presenting) return; undoStack.push(snapshot()); S = JSON.parse(redoStack.pop()); validateSel(); renderAll(); renderInfo(); }
function validateSel(){
  activeTier = clamp(activeTier, 0, S.tiers.length - 1);
  if (activeInst && !S.instruments.some(i => i.id === activeInst)){ activeInst = null; laneFocus = 'tier'; }
  if (!sel) return;
  if (sel.kind === 'span'){ const arr = S.tiers[sel.tier]; if (!arr){ sel = null; return; } sel.ids = sel.ids.filter(id => arr.some(s => s.id === id)); if (!sel.ids.length) sel = null; }
  else if (sel.kind === 'tier'){ if (!S.tiers[sel.tier]) sel = null; }
  else if (sel.kind === 'marker'){ if (!S.markers.some(m => m.id === sel.id)) sel = null; }
  else if (sel.kind === 'inst'){ if (!S.instruments.some(i => i.id === sel.id)) sel = null; }
  else if (sel.kind === 'ispan'){
    const i = S.instruments.find(i => i.id === sel.inst); if (!i){ sel = null; return; }
    const ids = selIds().filter(id => i.spans.some(s => s.id === id));
    if (!ids.length) sel = null; else { if (!ids.includes(sel.id)) sel.id = ids[0]; sel.ids = ids; }
  }
}

/* ---------- player ---------- */
const P = {
  kind: null, audio: new Audio(), yt: null, ytReady: false, _t: 0,
  t(){ if (this.kind === 'audio') return this.audio.currentTime || 0; if (this.kind === 'yt' && this.ytReady) return this.yt.getCurrentTime() || 0; return this._t; },
  playing(){ if (this.kind === 'audio') return !this.audio.paused; if (this.kind === 'yt' && this.ytReady) return this.yt.getPlayerState() === 1; return false; },
  play(){ if (this.kind === 'audio') this.audio.play().catch(() => toast('Playback could not start. Try pressing play again.')); else if (this.kind === 'yt' && this.ytReady) this.yt.playVideo(); else toast('Load audio to hear the piece.'); },
  pause(){ if (this.kind === 'audio') this.audio.pause(); else if (this.kind === 'yt' && this.ytReady) this.yt.pauseVideo(); },
  toggle(){ this.playing() ? this.pause() : this.play(); },
  seek(t){ t = clamp(t, 0, dur()); this._t = t; if (this.kind === 'audio') this.audio.currentTime = t; else if (this.kind === 'yt' && this.ytReady) this.yt.seekTo(t, true); },
  useAudio(url){ this.stopYT(); this.kind = 'audio'; this.audio.src = url; this.audio.load(); },
  stopYT(){ if (this.yt){ try { this.yt.destroy(); } catch(e){} this.yt = null; this.ytReady = false; $('#ytBox').hidden = true; $('#ytBox').innerHTML = '<div id="yt"></div>'; } },
  none(){ this.stopYT(); this.audio.pause(); this.audio.removeAttribute('src'); this.kind = null; }
};

function loadYTApi(){
  return new Promise((res, rej) => {
    if (window.YT && YT.Player) return res();
    const timer = setTimeout(() => rej(new Error('timeout')), 9000);
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); res(); };
    const s = document.createElement('script');
    s.src = 'https:\/\/www.youtube.com/iframe_api';
    s.onerror = () => { clearTimeout(timer); rej(new Error('blocked')); };
    document.head.appendChild(s);
  });
}
async function useYouTube(id, onReady){
  P.none(); peaks = null; waveMsg = 'No waveform for YouTube sources';
  try { await loadYTApi(); }
  catch(e){
    showBanner('YouTube playback could not load here. Check your connection, or use <b>Open audio</b> with a file.');
    return;
  }
  $('#ytBox').hidden = false;
  P.kind = 'yt';
  P.yt = new YT.Player('yt', {
    videoId: id, width: 320, height: 180, playerVars: {playsinline: 1, rel: 0, modestbranding: 1},
    events: {
      onReady: () => { P.ytReady = true; onReady && onReady(P.yt.getDuration(), (P.yt.getVideoData() || {}).title); },
      onError: () => showBanner('That video could not be played here. Some videos block embedding; try another link or an audio file.')
    }
  });
}
function ytId(u){
  u = u.trim();
  const m = u.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(u) ? u : null;
}

/* ---------- waveform ---------- */
function computePeaks(buf, n = 8000){
  const d = buf.getChannelData(0), step = Math.max(1, Math.floor(d.length / n)), out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++){
    let lo = 0, hi = 0; const a = i * step, b = Math.min(d.length, a + step);
    for (let j = a; j < b; j += 4){ const v = d[j]; if (v < lo) lo = v; if (v > hi) hi = v; }
    out[i * 2] = lo; out[i * 2 + 1] = hi;
  }
  return out;
}
function drawWave(){
  const c = $('#wv'); if (!c) return;
  const W = dur() * pps, cw = Math.max(1, Math.min(Math.ceil(W), 14000)), dpr = Math.min(2, window.devicePixelRatio || 1), h = 66;
  c.style.width = W + 'px'; c.width = Math.min(cw * dpr, 16000); c.height = h * dpr;
  const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  const cs = getComputedStyle(document.documentElement);
  g.fillStyle = cs.getPropertyValue('--wave').trim() || '#888';
  const mid = c.height / 2;
  if (!peaks){ g.fillRect(0, mid, c.width, Math.max(1, dpr)); return; }
  const n = peaks.length / 2;
  for (let x = 0; x < c.width; x++){
    const a = Math.floor(x / c.width * n), b = Math.max(a + 1, Math.floor((x + 1) / c.width * n));
    let lo = 0, hi = 0;
    for (let i = a; i < b && i < n; i++){ if (peaks[i * 2] < lo) lo = peaks[i * 2]; if (peaks[i * 2 + 1] > hi) hi = peaks[i * 2 + 1]; }
    const y1 = mid - hi * mid * .92, y2 = mid - lo * mid * .92;
    g.fillRect(x, y1, 1, Math.max(1, y2 - y1));
  }
}

/* ---------- model operations ---------- */
function splitTier(k, t){
  const arr = S.tiers[k]; const i = arr.findIndex(s => t > s.start + 0.05 && t < s.end - 0.05);
  if (i < 0) return null;
  const s = arr[i]; const r = {...s, id: uid(), start: t, label: '', comment: '', elide: false};
  s.end = t; arr.splice(i + 1, 0, r); return r;
}
function selSpans(){ if (!sel || sel.kind !== 'span') return []; return S.tiers[sel.tier].filter(s => sel.ids.includes(s.id)); }
// Instrument entries can be selected together (Shift + click); sel.id is the one clicked first.
const selIds = () => sel ? sel.ids || [sel.id] : [];
function selEntries(){ if (!sel || sel.kind !== 'ispan') return []; const i = S.instruments.find(i => i.id === sel.inst); return i ? i.spans.filter(s => selIds().includes(s.id)) : []; }
const focusTier = k => { activeTier = k; laneFocus = 'tier'; };
const focusInst = id => { activeInst = id; laneFocus = 'inst'; };
// Splits the active lane at the playhead: the level or instrument of the region selected most recently.
function cmdSplit(){
  if (presenting) return;
  const t = snapT(P.t()); let r = null;
  const ins = laneFocus === 'inst' && S.instruments.find(i => i.id === activeInst);
  if (ins){
    const s = ins.spans.find(s => t > s.start + 0.05 && t < s.end - 0.05);
    if (!s){ toast(ins.spans.some(s => t >= s.start && t <= s.end) ? 'There is already a boundary at the playhead.' : ins.name + ' is not playing at the playhead.'); return; }
    edit(() => { r = {...s, id: uid(), start: t, comment: ''}; s.end = t; ins.spans.push(r); ins.spans.sort((a, b) => a.start - b.start); sel = {kind: 'ispan', inst: ins.id, id: r.id}; });
    return;
  }
  edit(() => { r = splitTier(activeTier, t); if (r) sel = {kind: 'span', tier: activeTier, ids: [r.id]}; });
  if (!r) toast('There is already a boundary at the playhead.');
  else focusLabel();
}
// J: join the selected neighboring blocks (or instrument entries) into one.
function cmdJoinSel(){
  if (presenting || !sel) return;
  if (sel.kind === 'span'){
    const sp = selSpans(), k = sel.tier, arr = S.tiers[k];
    if (sp.length < 2){ toast('Shift + click a neighboring block to select both, then press J.'); return; }
    const idx = sp.map(s => arr.indexOf(s)).sort((a, b) => a - b);
    for (let i = 1; i < idx.length; i++) if (idx[i] !== idx[i - 1] + 1){ toast('Joined blocks must be next to each other.'); return; }
    return edit(() => {
      const keep = arr[idx[0]], rest = idx.slice(1).map(i => arr[i]);
      keep.end = rest[rest.length - 1].end;
      if (!keep.label) keep.label = (rest.find(s => s.label) || {}).label || '';
      keep.comment = [keep.comment, ...rest.map(s => s.comment)].filter(Boolean).join('\n');
      S.tiers[k] = arr.filter(s => !rest.includes(s));
      sel = {kind: 'span', tier: k, ids: [keep.id]};
    });
  }
  if (sel.kind === 'ispan'){
    const es = selEntries().sort((a, b) => a.start - b.start), ins = S.instruments.find(i => i.id === sel.inst);
    if (es.length < 2){ toast('Shift + click another entry in this lane to select both, then press J.'); return; }
    return edit(() => {
      const keep = es[0], rest = es.slice(1);
      keep.end = Math.max(...es.map(s => s.end));
      keep.comment = [keep.comment, ...rest.map(s => s.comment)].filter(Boolean).join('\n');
      ins.spans = ins.spans.filter(s => !rest.includes(s) && (s === keep || s.start >= keep.end || s.end <= keep.start));
      sel = {kind: 'ispan', inst: ins.id, id: keep.id};
    });
  }
  toast('Select neighboring blocks or instrument entries to join.');
}
// E and X: the active instrument enters or exits at the playhead, so entries can be marked while listening.
function laneInst(){
  if (sel && (sel.kind === 'inst' || sel.kind === 'ispan')) return S.instruments.find(i => i.id === (sel.kind === 'inst' ? sel.id : sel.inst));
  return laneFocus === 'inst' ? S.instruments.find(i => i.id === activeInst) : null;
}
function cmdEnter(){
  if (presenting) return;
  const ins = laneInst(); if (!ins){ toast(S.instruments.length ? 'Press 1 to ' + Math.min(9, S.instruments.length) + ' to pick an instrument, then E when it enters.' : 'Add an instrument first.'); return; }
  const t = snapT(P.t());
  if (ins.spans.some(s => t >= s.start && t < s.end)){ toast(ins.name + ' is already playing here.'); return; }
  edit(() => {
    const next = ins.spans.filter(s => s.start > t).sort((a, b) => a.start - b.start)[0];
    ins.spans.push({id: uid(), start: t, end: next ? next.start : dur(), comment: ''}); ins.spans.sort((a, b) => a.start - b.start);
    focusInst(ins.id);
  });
  toast(ins.name + ' enters at ' + fmt(t));
}
function cmdExit(){
  if (presenting) return;
  const ins = laneInst(); if (!ins){ toast('Press 1 to 9 to pick an instrument, then X when it stops.'); return; }
  const t = snapT(P.t()), s = ins.spans.find(s => t > s.start && t <= s.end);
  if (!s){ toast(ins.name + ' is not playing at the playhead.'); return; }
  edit(() => { s.end = t; focusInst(ins.id); });
  toast(ins.name + ' exits at ' + fmt(t));
}
// 1 to 9: make that instrument the active lane.
function pickInst(n){
  const ins = S.instruments[n - 1]; if (!ins) return;
  focusInst(ins.id); sel = {kind: 'inst', id: ins.id}; renderAll();
  toast(n + ' · ' + ins.name + ': E enters, X exits, S splits');
}
// Levels are drawn top down from the highest; instruments top down in order. dir -1 moves up the screen.
function moveTier(k, dir){
  const j = k - dir; if (j < 0 || j >= S.tiers.length) return;
  edit(() => {
    [S.tiers[k], S.tiers[j]] = [S.tiers[j], S.tiers[k]];
    [S.tierNames[k], S.tierNames[j]] = [S.tierNames[j], S.tierNames[k]];
    if (sel && (sel.kind === 'span' || sel.kind === 'tier') && sel.tier === k) sel.tier = j;
    else if (sel && (sel.kind === 'span' || sel.kind === 'tier') && sel.tier === j) sel.tier = k;
    if (activeTier === k) activeTier = j; else if (activeTier === j) activeTier = k;
  });
  const a = cmFilter.has('t' + k), b = cmFilter.has('t' + j);
  cmFilter.delete('t' + k); cmFilter.delete('t' + j); if (a) cmFilter.add('t' + j); if (b) cmFilter.add('t' + k);
  renderComments();
}
function moveInst(id, dir){
  const i = S.instruments.findIndex(x => x.id === id), j = i + dir; if (i < 0 || j < 0 || j >= S.instruments.length) return;
  edit(() => { [S.instruments[i], S.instruments[j]] = [S.instruments[j], S.instruments[i]]; });
}
function cmdGroup(){
  if (presenting) return;
  const sp = selSpans(); if (!sp.length){ toast('Select one or more adjacent blocks to group.'); return; }
  const k = sel.tier, arr = S.tiers[k];
  const idx = sp.map(s => arr.indexOf(s)).sort((a, b) => a - b);
  for (let i = 1; i < idx.length; i++) if (idx[i] !== idx[i - 1] + 1){ toast('Grouped blocks must be next to each other.'); return; }
  const start = arr[idx[0]].start, end = arr[idx[idx.length - 1]].end;
  edit(() => {
    if (!S.tiers[k + 1]){ S.tiers.push([mk(0, dur())]); S.tierNames[k + 1] = S.tierNames[k + 1] || TIER_NAMES[k + 1] || 'Level ' + (k + 2); }
    const up = S.tiers[k + 1];
    splitTier(k + 1, start); splitTier(k + 1, end);
    const inside = up.filter(s => s.start >= start - 0.051 && s.end <= end + 0.051);
    const first = inside[0]; first.start = start; first.end = end;
    if (!first.label) first.color = arr[idx[0]].color;
    S.tiers[k + 1] = up.filter(s => s === first || !inside.includes(s));
    sel = {kind: 'span', tier: k + 1, ids: [first.id]}; focusTier(k + 1);
  });
  focusLabel();
}
function cmdJoin(dir){
  const sp = selSpans(); if (!sp.length) return;
  const k = sel.tier, arr = S.tiers[k], i = arr.indexOf(sp[0]);
  if (dir < 0 && i === 0){ toast('This block has no neighbor on the left.'); return; }
  if (dir > 0 && i === arr.length - 1){ toast('This block has no neighbor on the right.'); return; }
  edit(() => {
    if (dir < 0){ arr[i - 1].end = arr[i].end; arr.splice(i, 1); sel = {kind: 'span', tier: k, ids: [arr[i - 1].id]}; }
    else { arr[i + 1].start = arr[i].start; arr.splice(i, 1); sel = {kind: 'span', tier: k, ids: [arr[i].id]}; }
  });
}
function cmdMarker(){
  if (presenting) return;
  const t = snapT(P.t()); let m;
  edit(() => { m = {id: uid(), time: t, label: '', kind: 'cadence', comment: ''}; S.markers.push(m); S.markers.sort((a, b) => a.time - b.time); sel = {kind: 'marker', id: m.id}; });
  focusLabel();
}
function cmdDelete(dir){
  if (presenting || !sel) return;
  if (sel.kind === 'span') return cmdJoin(dir);
  if (sel.kind === 'marker') return edit(() => { S.markers = S.markers.filter(m => m.id !== sel.id); sel = null; });
  if (sel.kind === 'ispan') return edit(() => { const i = S.instruments.find(i => i.id === sel.inst), ids = selIds(); i.spans = i.spans.filter(s => !ids.includes(s.id)); sel = {kind: 'inst', id: i.id}; });
}
function selStart(){
  if (!sel) return null;
  if (sel.kind === 'span') return Math.min(...selSpans().map(s => s.start));
  if (sel.kind === 'marker') return S.markers.find(m => m.id === sel.id).time;
  if (sel.kind === 'ispan') return S.instruments.find(i => i.id === sel.inst).spans.find(s => s.id === sel.id).start;
  return null;
}
function playFromSel(){ const t = selStart(); if (t == null){ toast('Select a block or marker first.'); return; } P.seek(t); P.play(); }
function navSel(dx, dy, extend){
  if (!sel || sel.kind !== 'span'){ const arr = S.tiers[activeTier]; const s = arr.find(s => P.t() >= s.start && P.t() < s.end) || arr[0]; sel = {kind: 'span', tier: activeTier, ids: [s.id]}; renderAll(); return; }
  let k = sel.tier, arr = S.tiers[k];
  const cur = arr.filter(s => sel.ids.includes(s.id));
  if (dy){
    k = clamp(k + dy, 0, S.tiers.length - 1); if (k === sel.tier) return;
    const mid = (cur[0].start + cur[0].end) / 2;
    const s = S.tiers[k].find(s => mid >= s.start && mid < s.end) || S.tiers[k][0];
    sel = {kind: 'span', tier: k, ids: [s.id]}; focusTier(k);
  } else {
    const idxs = cur.map(s => arr.indexOf(s)); const edge = dx > 0 ? Math.max(...idxs) : Math.min(...idxs);
    const n = clamp(edge + dx, 0, arr.length - 1);
    sel = {kind: 'span', tier: k, ids: extend ? [...new Set([...sel.ids, arr[n].id])] : [arr[n].id]};
  }
  renderAll();
}
function focusLabel(){ requestAnimationFrame(() => { const el = $('#iLabel'); if (el && !presenting){ el.focus(); el.select(); } }); }

/* ---------- rendering: timeline ---------- */
const tl = $('#tl'), inner = $('#inner');
function ticks(){
  const W = dur() * pps; let h = '';
  if (S.grid.on){
    const bl = barLen(); let every = 1;
    for (const n of [1, 2, 4, 8, 16, 32, 64]){ every = n; if (n * bl * pps >= 38) break; }
    const minor = bl * pps >= 10;
    for (let b = 0; ; b++){
      const t = S.grid.offset + b * bl; if (t > dur() + EPS) break;
      const x = t * pps;
      if (b % every === 0) h += `<i class="tk" style="left:${x}px"><b>${b + 1}</b></i>`;
      else if (minor) h += `<i class="tk min" style="left:${x}px"></i>`;
    }
  } else {
    let step = 60; for (const n of [1, 2, 5, 10, 15, 30, 60, 120]){ step = n; if (n * pps >= 56) break; }
    for (let t = 0; t <= dur() + EPS; t += step) h += `<i class="tk" style="left:${t * pps}px"><b>${fmt(t).replace(/\.0$/, '')}</b></i>`;
    if (step >= 2 && pps * step / 5 >= 8) for (let t = step / 5; t < dur(); t += step / 5) if (Math.abs(t / step - Math.round(t / step)) > 1e-3) h += `<i class="tk min" style="left:${t * pps}px"></i>`;
  }
  return h;
}
function renderTimeline(){
  const W = Math.max(1, dur() * pps), g = gut();
  const gridOn = S.grid.on && barLen() * pps >= 6;
  inner.classList.toggle('gridbg', gridOn);
  if (gridOn){ inner.style.setProperty('--barpx', (barLen() * pps) + 'px'); inner.style.setProperty('--bar0', ((S.grid.offset % barLen()) * pps) + 'px'); }
  let h = `<div class="row r-ruler"><div class="lab">${S.grid.on ? 'Measure' : 'Time'}</div><div class="trk" data-k="ruler" style="width:${W}px">${ticks()}</div></div>`;
  h += `<div class="row r-mk"><div class="lab">Markers</div><div class="trk" data-k="mktrk" style="width:${W}px">`;
  for (const m of S.markers){
    const on = sel && sel.kind === 'marker' && sel.id === m.id;
    h += `<div class="mk${on ? ' sel' : ''}" data-k="mk" data-id="${m.id}" style="left:${m.time * pps}px${mkTint(m)}" title="${esc(MK_KINDS[m.kind][1] + ' at ' + fmt(m.time))}"><span class="mk-g">${MK_KINDS[m.kind][0]}</span><span class="mk-l">${esc(m.label)}</span></div>`;
  }
  h += `</div></div>`;
  for (let k = S.tiers.length - 1; k >= 0; k--){
    const arr = S.tiers[k], tsel = sel && sel.kind === 'tier' && sel.tier === k;
    h += `<div class="row r-tier${k === activeTier && laneFocus === 'tier' ? ' act' : ''}"><div class="lab click${tsel ? ' sel' : ''}" data-k="tierlab" data-tier="${k}" title="Click to rename or make this the active level"><span class="lname">${esc(S.tierNames[k] || 'Level ' + (k + 1))}</span><small>L${k + 1}</small>${moveBtns('tier', k, k < S.tiers.length - 1, k > 0)}</div><div class="trk" data-k="tier" data-tier="${k}" style="width:${W}px">`;
    for (const s of arr){
      const on = sel && sel.kind === 'span' && sel.tier === k && sel.ids.includes(s.id);
      h += `<div class="sp c-${s.color} tx-${s.texture || 'solid'}${s.align === 'right' ? ' ar' : ''}${s.aux ? ' aux' : ''}${s.elide ? ' elide' : ''}${on ? ' sel' : ''}${s.comment ? ' hc' : ''}" data-k="sp" data-tier="${k}" data-id="${s.id}" style="left:${s.start * pps}px;width:${Math.max(1, (s.end - s.start) * pps)}px" title="${esc((s.label || 'Unlabeled') + ', ' + fmt(s.start) + ' to ' + fmt(s.end))}"><span class="sp-l">${esc(s.label)}</span></div>`;
    }
    for (let i = 0; i < arr.length - 1; i++) h += `<div class="bnd" data-k="bnd" data-tier="${k}" data-i="${i}" style="left:${arr[i].end * pps}px"></div>`;
    h += `</div></div>`;
  }
  // The audio lane sits between levels (above) and instruments (below), so its label adds either one.
  h += `<div class="row r-wave"><div class="lab audiolab"><span class="lname">Audio</span><span class="addbtns edit-only"><button class="addb" data-k="addlevel" type="button" title="Add a level above the audio"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10V2M2.5 5.5 6 2l3.5 3.5"/></svg>Level</button><button class="addb" data-k="addinst" type="button" title="Add an instrument below the audio"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2.5 6.5 6 10l3.5-3.5"/></svg>Instrument</button></span></div><div class="trk" data-k="wave" style="width:${W}px"><canvas id="wv"></canvas>${!peaks && waveMsg ? `<span class="wavemsg" style="position:absolute">${esc(waveMsg)}</span>` : ''}</div></div>`;
  S.instruments.forEach((ins, n) => {
    const isel = sel && sel.kind === 'inst' && sel.id === ins.id, act = laneFocus === 'inst' && activeInst === ins.id;
    h += `<div class="row r-inst${act ? ' act' : ''}"><div class="lab click${isel ? ' sel' : ''}" data-k="instlab" data-id="${ins.id}" title="${n < 9 ? 'Press ' + (n + 1) + ' to make this the active lane' : ''}"><span class="txkey c-${ins.color}"></span><span class="lname">${esc(ins.name)}</span>${n < 9 ? `<small>${n + 1}</small>` : ''}${moveBtns('inst', ins.id, n > 0, n < S.instruments.length - 1)}</div><div class="trk" data-k="itrk" data-id="${ins.id}" style="width:${W}px">`;
    for (const s of ins.spans){
      const on = sel && sel.kind === 'ispan' && sel.inst === ins.id && selIds().includes(s.id);
      h += `<div class="is c-${ins.color} tx-${s.texture || 'solid'}${on ? ' sel' : ''}${s.comment ? ' hc' : ''}" data-k="is" data-inst="${ins.id}" data-id="${s.id}" style="left:${s.start * pps}px;width:${Math.max(2, (s.end - s.start) * pps)}px" title="${esc(ins.name + ': ' + fmt(s.start) + ' to ' + fmt(s.end))}"><i class="ih l" data-k="ih" data-side="l" data-inst="${ins.id}" data-id="${s.id}"></i><i class="ih r" data-k="ih" data-side="r" data-inst="${ins.id}" data-id="${s.id}"></i></div>`;
    }
    h += `</div></div>`;
  });
  for (const m of S.markers) h += `<div class="stem" style="left:${g + m.time * pps}px${mkTint(m)}"></div>`;
  h += `<div class="ph" id="ph"></div>`;
  keepTouched();
  inner.innerHTML = h;
  inner.style.width = (g + W) + 'px';
  drawWave(); placePH();
}
// Small up and down arrows on a lane name, for reordering levels and instruments.
function moveBtns(what, id, up, down){
  const b = (dir, on, label, d) => `<button class="mv" data-k="mv" data-what="${what}" data-id="${id}" data-dir="${dir}" type="button" aria-label="${label}" title="${label}"${on ? '' : ' disabled'}><svg viewBox="0 0 10 10" aria-hidden="true"><path d="${d}"/></svg></button>`;
  return `<span class="mvs edit-only">${b(-1, up, 'Move up', 'M2 6.5 5 3.5l3 3')}${b(1, down, 'Move down', 'M2 3.5 5 6.5l3-3')}</span>`;
}
// While fingers are on the screen, the browser sends each finger's touch events to the element it first landed on. A redraw
// (a tap that selects, or each step of a pinch) replaces those elements, and events sent to an element that has left the
// page never reach the document, so a pinch would stop after one step. Until the fingers lift, the replaced elements wait
// in a hidden holder that stays in the page.
let touchesDown = 0;
function keepTouched(){
  if (!touchesDown || !inner.firstChild) return;
  let keep = document.getElementById('touchKeep');
  if (!keep){ keep = document.createElement('div'); keep.id = 'touchKeep'; keep.hidden = true; document.body.appendChild(keep); }
  inner.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  while (inner.firstChild) keep.appendChild(inner.firstChild);
}
const countTouches = e => { touchesDown = e.touches.length; if (!touchesDown){ const k = document.getElementById('touchKeep'); if (k) k.remove(); } };
['touchstart', 'touchend', 'touchcancel'].forEach(t => document.addEventListener(t, countTouches, {passive: true, capture: true}));
function placePH(){ const ph = $('#ph'); if (ph) ph.style.left = (gut() + P.t() * pps) + 'px'; }

/* ---------- rendering: inspector ---------- */
// A marker with its own color sets --mk, which every theme draws marker glyphs and stems with.
const mkTint = m => m.color && COLORS.includes(m.color) ? `;--mk:var(--c-${m.color})` : '';
function textures(cur, color){ return `<div class="swatches">${TEXTURES.map(t => `<button class="sw txsw c-${color} tx-${t}${t === cur ? ' on' : ''}" data-act="texture" data-t="${t}" type="button" aria-label="${t}" title="${t[0].toUpperCase() + t.slice(1)}"></button>`).join('')}</div>`; }
function swatches(cur, withDefault){ return `<div class="swatches">${withDefault ? `<button class="sw sw-ink${cur ? '' : ' on'}" data-act="color" data-c="" type="button" aria-label="Default" title="Default"></button>` : ''}${COLORS.map(c => `<button class="sw c-${c}${c === cur ? ' on' : ''}" data-act="color" data-c="${c}" type="button" aria-label="${c}" title="${c[0].toUpperCase() + c.slice(1)}"></button>`).join('')}</div>`; }
// The title of an inspector panel, with its color and texture choices beside it.
function ihead(title, style){ return `<div class="ihead"><div class="ititle">${title}</div>${style ? `<div class="istyle">${style}</div>` : ''}</div>`; }
const styleRow = (name, html) => `<div class="srow"><span>${name}</span>${html}</div>`;
function timesLine(a, b){ const bars = S.grid.on ? ` · ${mbar(a)} to ${mbar(b)}` : ''; return `${fmt(a)} to ${fmt(b)} · ${(b - a).toFixed(1)}s${bars}`; }
function renderInspector(){
  const el = $('#insp');
  if (!sel){
    el.innerHTML = `<div class="eyebrow">Inspector</div><h2>Nothing selected</h2>
      <p class="note" style="max-width:60ch">Click a block, marker, or instrument entry to edit it. While listening, press <kbd>S</kbd> at each formal boundary to split the active level (<b>${esc(S.tierNames[activeTier] || 'Level ' + (activeTier + 1))}</b>), then select neighboring blocks and press <kbd>G</kbd> to group them into a larger unit on the level above.</p>`;
    return;
  }
  if (presenting) return renderInspectorRO(el);
  if (sel.kind === 'span'){
    const sp = selSpans();
    if (sp.length > 1){
      const a = Math.min(...sp.map(s => s.start)), b = Math.max(...sp.map(s => s.end));
      el.innerHTML = `<div class="stack">${ihead(`<div class="eyebrow">${esc(S.tierNames[sel.tier])} · ${sp.length} blocks</div><h2>Multiple blocks selected</h2><div class="meta">${timesLine(a, b)}</div>`,
          styleRow('Color for all', swatches(null)) + styleRow('Texture for all', textures(null, sp[0].color)))}
        <div class="actions"><button class="btn pri" data-act="group" type="button">Group into one block above <kbd>G</kbd></button><button class="btn" data-act="join" type="button">Join into one block <kbd>J</kbd></button><button class="btn" data-act="playsel" type="button">Play from start</button></div></div>`;
    } else {
      const s = sp[0];
      el.innerHTML = `<div class="stack">
        ${ihead(`<div class="eyebrow">${esc(S.tierNames[sel.tier] || 'Level ' + (sel.tier + 1))} · Level ${sel.tier + 1}</div><h2>${esc(s.label) || 'Unlabeled block'}</h2><div class="meta">${timesLine(s.start, s.end)}</div>`,
          styleRow('Color', swatches(s.color)) + styleRow('Texture', textures(s.texture || 'solid', s.color)))}
        <label class="field"><span>Label</span><input type="text" id="iLabel" value="${esc(s.label)}" placeholder="e.g. Verse 1, A, Presentation" autocomplete="off"></label>
        <div class="chipgroup">${labelGroups().map(([name, words]) => `<div class="eyebrow" style="margin-top:2px">${esc(name)}</div><div class="chips">${words.map(w => `<button class="chip" data-act="vocab" data-w="${esc(w)}" type="button">${esc(w)}</button>`).join('')}</div>`).join('')}</div>
        <div class="checks">
          <label class="toggle"><input type="checkbox" id="iAux"${s.aux ? ' checked' : ''}> Auxiliary (intro, transition, coda, tag)</label>
          <label class="toggle"><input type="checkbox" id="iElide"${s.elide ? ' checked' : ''}> Elided with the previous block</label>
          <label class="toggle"><input type="checkbox" id="iAlign"${s.align === 'right' ? ' checked' : ''}> Label at the right end (leading into the next block)</label>
        </div>
        <label class="field"><span>Commentary</span><textarea id="iComment" placeholder="What happens here? Cite what you hear: texture, harmony, cadence, instrumentation.">${esc(s.comment)}</textarea></label>
        <div class="actions">
          <button class="btn" data-act="playsel" type="button">Play from here <kbd>Ctrl Space</kbd></button>
          <button class="btn" data-act="split" type="button">Split at playhead</button>
          <button class="btn" data-act="group" type="button">Group up</button>
          <button class="btn" data-act="joinl" type="button">Join left</button>
          <button class="btn" data-act="joinr" type="button">Join right</button>
        </div></div>`;
      bindField($('#iLabel'), v => { s.label = v; });
      $('#iLabel').addEventListener('change', () => noteRecent(s.label));
      bindField($('#iComment'), v => { s.comment = v; });
      $('#iAux').onchange = e => edit(() => { s.aux = e.target.checked; });
      $('#iElide').onchange = e => edit(() => { s.elide = e.target.checked; });
      $('#iAlign').onchange = e => edit(() => { if (e.target.checked) s.align = 'right'; else delete s.align; });
    }
  } else if (sel.kind === 'marker'){
    const m = S.markers.find(m => m.id === sel.id);
    el.innerHTML = `<div class="stack">
      ${ihead(`<div class="eyebrow">Marker · ${MK_KINDS[m.kind][1]}</div><h2>${esc(m.label) || 'Unlabeled marker'}</h2><div class="meta">${fmt(m.time)}${S.grid.on ? ' · ' + mpos(m.time) : ''}</div>`,
        styleRow('Color', swatches(m.color, true)))}
      <div class="row2">
        <label class="field"><span>Label</span><input type="text" id="iLabel" value="${esc(m.label)}" placeholder="e.g. PAC, to V, climax" autocomplete="off"></label>
        <label class="field"><span>Type</span><select id="iKind">${Object.entries(MK_KINDS).map(([k, v]) => `<option value="${k}"${k === m.kind ? ' selected' : ''}>${v[1]}</option>`).join('')}</select></label>
      </div>
      <div class="chips">${MARKER_CHIPS.map(w => `<button class="chip" data-act="vocab" data-w="${esc(w)}" type="button">${esc(w)}</button>`).join('')}</div>
      <label class="field"><span>Commentary</span><textarea id="iComment" placeholder="Describe the moment.">${esc(m.comment)}</textarea></label>
      <div class="actions"><button class="btn" data-act="playsel" type="button">Play from here</button><button class="btn" data-act="mkhere" type="button">Move to playhead</button><button class="btn" data-act="del" type="button">Delete marker</button></div></div>`;
    bindField($('#iLabel'), v => { m.label = v; });
    bindField($('#iComment'), v => { m.comment = v; });
    $('#iKind').onchange = e => edit(() => { m.kind = e.target.value; });
  } else if (sel.kind === 'tier'){
    const k = sel.tier;
    el.innerHTML = `<div class="stack"><div><div class="eyebrow">Level ${k + 1} of ${S.tiers.length}</div><h2>${esc(S.tierNames[k])}</h2><div class="meta">${S.tiers[k].length} blocks · active level for splitting</div></div>
      <label class="field"><span>Level name</span><input type="text" id="iLabel" value="${esc(S.tierNames[k])}" autocomplete="off"></label>
      <div class="actions"><button class="btn" data-act="mvup" type="button"${k < S.tiers.length - 1 ? '' : ' disabled'}>Move up</button><button class="btn" data-act="mvdown" type="button"${k > 0 ? '' : ' disabled'}>Move down</button>${S.tiers.length > 1 ? `<button class="btn" data-act="rmlevel" type="button">Remove this level</button>` : ''}</div></div>`;
    bindField($('#iLabel'), v => { S.tierNames[k] = v; });
  } else if (sel.kind === 'inst'){
    const ins = S.instruments.find(i => i.id === sel.id);
    el.innerHTML = `<div class="stack">${ihead(`<div class="eyebrow">Instrument</div><h2>${esc(ins.name)}</h2><div class="meta">${ins.spans.length} ${ins.spans.length === 1 ? 'entry' : 'entries'} · drag across its lane to add more</div>`,
        styleRow('Color', swatches(ins.color)))}
      <label class="field"><span>Name</span><input type="text" id="iLabel" value="${esc(ins.name)}" autocomplete="off"></label>
      <p class="note" style="margin:0">Select an entry in the lane to give it a texture of its own.</p>
      <div class="actions"><button class="btn" data-act="enter" type="button">Enters at playhead <kbd>E</kbd></button><button class="btn" data-act="exit" type="button">Exits at playhead <kbd>X</kbd></button></div>
      <div class="actions"><button class="btn sm" data-act="mvup" type="button"${S.instruments[0] === ins ? ' disabled' : ''}>Move up</button><button class="btn sm" data-act="mvdown" type="button"${S.instruments[S.instruments.length - 1] === ins ? ' disabled' : ''}>Move down</button><button class="btn sm" data-act="rminst" type="button">Delete instrument</button></div></div>`;
    bindField($('#iLabel'), v => { ins.name = v; });
  } else if (sel.kind === 'ispan'){
    const ins = S.instruments.find(i => i.id === sel.inst), s = ins.spans.find(s => s.id === sel.id);
    el.innerHTML = `<div class="stack">${ihead(`<div class="eyebrow">Instrument entry</div><h2>${esc(ins.name)}</h2><div class="meta">${timesLine(s.start, s.end)}</div>`,
        styleRow('Texture', textures(s.texture || 'solid', ins.color)))}
      <label class="field"><span>Commentary</span><textarea id="iComment" placeholder="Role in the texture: melody, countermelody, pad, rhythm…">${esc(s.comment || '')}</textarea></label>
      <div class="actions"><button class="btn" data-act="playsel" type="button">Play from here</button><button class="btn" data-act="split" type="button">Split at playhead <kbd>S</kbd></button>${selIds().length > 1 ? `<button class="btn" data-act="join" type="button">Join selected <kbd>J</kbd></button>` : ''}<button class="btn" data-act="del" type="button">Delete ${selIds().length > 1 ? selIds().length + ' entries' : 'entry'}</button></div></div>`;
    bindField($('#iComment'), v => { s.comment = v; });
  }
}
function renderInspectorRO(el){
  let label = '', meta = '', body = '', eyebrow = '';
  if (sel.kind === 'span'){ const s = selSpans()[0]; eyebrow = S.tierNames[sel.tier]; label = s.label || 'Unlabeled block'; meta = timesLine(s.start, s.end) + (s.aux ? ' · auxiliary' : '') + (s.elide ? ' · elided' : ''); body = s.comment; }
  else if (sel.kind === 'marker'){ const m = S.markers.find(m => m.id === sel.id); eyebrow = MK_KINDS[m.kind][1]; label = m.label || 'Marker'; meta = fmt(m.time) + (S.grid.on ? ' · ' + mpos(m.time) : ''); body = m.comment; }
  else if (sel.kind === 'ispan'){ const ins = S.instruments.find(i => i.id === sel.inst), s = ins.spans.find(s => s.id === sel.id); eyebrow = 'Instrument'; label = ins.name; meta = timesLine(s.start, s.end); body = s.comment; }
  else if (sel.kind === 'inst'){ const ins = S.instruments.find(i => i.id === sel.id); eyebrow = 'Instrument'; label = ins.name; meta = ins.spans.map(s => fmt(s.start) + ' to ' + fmt(s.end)).join(', '); }
  else { eyebrow = 'Level'; label = S.tierNames[sel.tier]; }
  el.innerHTML = `<div class="stack"><div><div class="eyebrow">${esc(eyebrow)}</div><div class="ro-label">${esc(label)}</div><div class="meta">${esc(meta)}</div></div>${body ? `<div class="ro-body">${esc(body)}</div>` : ''}${selStart() != null ? `<div class="actions"><button class="btn" data-act="playsel" type="button">Play from here</button></div>` : ''}</div>`;
}
function bindField(el, apply){
  if (!el) return; let prev = null;
  el.addEventListener('focus', () => { prev = snapshot(); });
  el.addEventListener('input', () => { if (presenting) return; apply(el.value); renderTimeline(); renderComments(); updateDocTitle(); updatePieceSummary(); });
  el.addEventListener('change', () => { if (prev && prev !== snapshot()) commit(prev); prev = snapshot(); });
}
$('#insp').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'playsel') return playFromSel();
  if (presenting) return;
  if (a === 'color') return edit(() => {
    if (sel.kind === 'span') selSpans().forEach(s => s.color = b.dataset.c);
    else if (sel.kind === 'marker'){ const m = S.markers.find(m => m.id === sel.id); if (b.dataset.c) m.color = b.dataset.c; else delete m.color; }
    else if (sel.kind === 'inst') S.instruments.find(i => i.id === sel.id).color = b.dataset.c;
  });
  if (a === 'texture') return edit(() => {
    const t = b.dataset.t === 'solid' ? null : b.dataset.t, set = o => { if (t) o.texture = t; else delete o.texture; };
    if (sel.kind === 'span') selSpans().forEach(set);
    else if (sel.kind === 'ispan') selEntries().forEach(set);
  });
  if (a === 'vocab') return edit(() => { target().label = b.dataset.w; if (sel.kind === 'span') noteRecent(b.dataset.w); });
  if (a === 'group') return cmdGroup();
  if (a === 'split') return cmdSplit();
  if (a === 'joinl') return cmdJoin(-1);
  if (a === 'joinr') return cmdJoin(1);
  if (a === 'del') return cmdDelete(-1);
  if (a === 'mkhere') return edit(() => { const m = S.markers.find(m => m.id === sel.id); m.time = snapT(P.t()); S.markers.sort((x, y) => x.time - y.time); });
  if (a === 'rmlevel') return edit(() => { S.tiers.splice(sel.tier, 1); S.tierNames.splice(sel.tier, 1); sel = null; validateSel(); });
  if (a === 'rminst') return edit(() => { S.instruments = S.instruments.filter(i => i.id !== sel.id); sel = null; });
  if (a === 'enter') return cmdEnter();
  if (a === 'exit') return cmdExit();
  if (a === 'join') return cmdJoinSel();
  if (a === 'mvup' || a === 'mvdown'){ const d = a === 'mvup' ? -1 : 1; return sel.kind === 'tier' ? moveTier(sel.tier, d) : moveInst(sel.id, d); }
});
// Label suggestion groups for blocks: Letters, then what this viewer used lately, then the course's groups.
function labelGroups(){
  const recent = recentLabels(), i = VOCAB.findIndex(g => g[0] === 'Letters');
  if (!recent.length) return VOCAB;
  const out = VOCAB.slice(); out.splice(i + 1, 0, ['Recent', recent]); return out;
}
function target(){ if (sel.kind === 'span') return selSpans()[0]; if (sel.kind === 'marker') return S.markers.find(m => m.id === sel.id); return {}; }

/* ---------- rendering: comments, info ---------- */
// Comments can be narrowed to some levels, the markers, or some instruments (an empty set shows everything), and drawn
// with color dots or with each title set in a pill of its color. The style is kept on this device.
let cmFilter = new Set(), cmStyle = 'dots';
try { if (localStorage.getItem('listeningmap.cmstyle') === 'pills') cmStyle = 'pills'; } catch(e){}
const cmShows = key => !cmFilter.size || cmFilter.has(key);
function renderComments(){
  const out = [], count = {};
  const tally = key => { count[key] = (count[key] || 0) + 1; return cmShows(key); };
  const walk = (k, a, b, depth) => {
    if (k < 0) return;
    for (const s of S.tiers[k]){
      const mid = (s.start + s.end) / 2; if (mid < a || mid >= b) continue;
      const shown = s.comment && tally('t' + k);
      if (shown) out.push({t: s.start, depth, head: s.label || 'Unlabeled', sub: (S.tierNames[k] || 'Level ' + (k + 1)) + ' · ' + fmt(s.start) + ' to ' + fmt(s.end), body: s.comment, c: s.color});
      walk(k - 1, s.start, s.end, shown ? depth + 1 : depth);
    }
  };
  walk(S.tiers.length - 1, 0, dur() + 1, 0);
  for (const m of S.markers) if (m.comment && tally('mk')) out.push({t: m.time, depth: 0, head: (m.label || MK_KINDS[m.kind][1]), sub: 'Marker · ' + fmt(m.time) + (S.grid.on ? ' · ' + mpos(m.time) : ''), body: m.comment, mk: MK_KINDS[m.kind][0], tint: mkTint(m)});
  for (const i of S.instruments) for (const s of i.spans) if (s.comment && tally('i' + i.id)) out.push({t: s.start, depth: 0, head: i.name, sub: 'Instrument · ' + fmt(s.start) + ' to ' + fmt(s.end), body: s.comment, c: i.color});
  // Filter chips, one per level (top down), the markers, and each instrument, with how many comments each has.
  const chip = (key, name, n) => `<button class="chip" type="button" data-cmf="${esc(key)}" aria-pressed="${cmFilter.has(key)}">${esc(name)} <span class="n">${n || 0}</span></button>`;
  let f = `<button class="chip" type="button" data-cmf="" aria-pressed="${!cmFilter.size}">All</button><span class="cmf-sep" aria-hidden="true"></span>`;
  for (let k = S.tiers.length - 1; k >= 0; k--) f += chip('t' + k, S.tierNames[k] || 'Level ' + (k + 1), count['t' + k]);
  f += chip('mk', 'Markers', count.mk);
  if (S.instruments.length) f += `<span class="cmf-sep" aria-hidden="true"></span>` + S.instruments.map(i => chip('i' + i.id, i.name, count['i' + i.id])).join('');
  $('#cmFilters').innerHTML = f;
  document.querySelectorAll('[data-cmstyle]').forEach(b => b.setAttribute('aria-pressed', b.dataset.cmstyle === cmStyle));
  const el = $('#comments');
  el.classList.toggle('pills', cmStyle === 'pills');
  const head = o => cmStyle === 'pills'
    ? (o.mk ? `<span class="cmpill mkpill"${o.tint ? ` style="${o.tint.slice(1)}"` : ''}><b>${o.mk}</b>${esc(o.head)}</span>` : `<span class="cmpill c-${o.c}">${esc(o.head)}</span>`)
    : (o.mk ? `<span class="mk-g"${o.tint ? ` style="${o.tint.slice(1)}"` : ''}>${o.mk}</span>` : `<span class="dot c-${o.c}"></span>`) + esc(o.head);
  el.innerHTML = out.length ? out.map(o => `<button class="cm" data-seek="${o.t}" style="--d:${o.depth}" type="button"><div class="cm-h">${head(o)} <span class="meta">${esc(o.sub)}</span></div><div class="cm-b">${esc(o.body).replace(/\n/g, '<br>')}</div></button>`).join('')
    : cmFilter.size ? `<p class="note">No commentary in what is chosen above. Choose <b>All</b> to see everything.</p>`
    : `<p class="note">No commentary yet. Select any block, marker, or instrument entry and write in its Commentary box. It collects here in formal order, larger sections first.</p>`;
}
$('#comments').addEventListener('click', e => { const b = e.target.closest('[data-seek]'); if (b){ P.seek(+b.dataset.seek); scrollTo(+b.dataset.seek); } });
$('#cmFilters').addEventListener('click', e => {
  const b = e.target.closest('[data-cmf]'); if (!b) return;
  const k = b.dataset.cmf;
  if (!k) cmFilter.clear(); else if (cmFilter.has(k)) cmFilter.delete(k); else cmFilter.add(k);
  renderComments();
});
document.querySelectorAll('[data-cmstyle]').forEach(b => b.onclick = () => {
  cmStyle = b.dataset.cmstyle; try { localStorage.setItem('listeningmap.cmstyle', cmStyle); } catch(e){}
  renderComments();
});

function renderInfo(){
  const el = $('#pieceBody'), g = S.grid, ro = presenting ? ' disabled' : '';
  el.innerHTML = `<div class="piecegrid">
    <div class="stack">
      <div class="row3">
        <label class="field"><span>Title</span><input type="text" id="mTitle" value="${esc(S.meta.title)}"${ro}></label>
        <label class="field"><span>Composer or artist</span><input type="text" id="mComposer" value="${esc(S.meta.composer)}"${ro}></label>
        <label class="field"><span>Analyst (student name)</span><input type="text" id="mStudent" value="${esc(S.meta.student)}"${ro}></label>
      </div>
      <label class="field"><span>Overall notes</span><textarea id="mNotes" rows="2" placeholder="Summarize the form, e.g. verse and chorus form with a contrasting bridge."${ro}>${esc(S.meta.notes)}</textarea></label>
      <div class="meta">Source: ${esc(S.source.type === 'youtube' ? 'YouTube ' + S.source.youtubeId : S.source.name)} · ${fmt(dur())}</div>
    </div>
    <div class="stack gridset"><div><div class="eyebrow">Measure grid</div><p class="note" style="margin:2px 0 0">Count in measures instead of seconds. Set the tempo and where m. 1 begins.</p></div>
      <label class="toggle"><input type="checkbox" id="gOn"${g.on ? ' checked' : ''}${ro}> Show measures</label>
      <div class="row3">
        <label class="field"><span>Tempo (BPM)</span><input type="number" id="gBpm" min="20" max="320" step="0.1" value="${g.bpm}"${ro}></label>
        <label class="field"><span>Beats per measure</span><input type="number" id="gBpb" min="1" max="16" step="1" value="${g.bpb}"${ro}></label>
        <label class="field"><span>m. 1 starts at (sec)</span><input type="number" id="gOff" min="0" step="0.01" value="${g.offset}"${ro}></label>
      </div>
      <div class="actions edit-only"><button class="btn sm" id="gTap" type="button">Tap tempo</button><button class="btn sm" id="gHere" type="button">Start m. 1 at playhead</button></div>
    </div></div>`;
  updatePieceSummary();
  if (presenting) return;
  bindField($('#mTitle'), v => { S.meta.title = v; });
  bindField($('#mComposer'), v => { S.meta.composer = v; });
  bindField($('#mStudent'), v => { S.meta.student = v; });
  bindField($('#mNotes'), v => { S.meta.notes = v; });
  $('#gOn').onchange = e => edit(() => { S.grid.on = e.target.checked; });
  const num = (id, key, lo, hi) => { const el = $(id); el.onchange = () => { const v = parseFloat(el.value); if (isFinite(v)) edit(() => { S.grid[key] = clamp(v, lo, hi); }); }; };
  num('#gBpm', 'bpm', 20, 320); num('#gBpb', 'bpb', 1, 16); num('#gOff', 'offset', 0, dur());
  $('#gHere').onclick = () => { edit(() => { S.grid.offset = +P.t().toFixed(2); S.grid.on = true; }); renderInfo(); };
  let taps = [];
  $('#gTap').onclick = () => {
    const now = performance.now(); if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now); if (taps.length > 9) taps.shift();
    if (taps.length >= 3){ const bpm = +(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1))).toFixed(1); S.grid.bpm = bpm; $('#gBpm').value = bpm; renderTimeline(); }
    $('#gTap').textContent = taps.length < 3 ? 'Keep tapping…' : 'Tap tempo (' + S.grid.bpm + ')';
  };
}
// The collapsed panel still shows what the piece is and how the grid is set.
function updatePieceSummary(){
  const g = S.grid;
  $('#pieceSum').textContent = [[S.meta.title, S.meta.composer].filter(Boolean).join(', '), g.on ? `${g.bpm} BPM, ${g.bpb} beats per measure` : 'Measure grid off'].filter(Boolean).join(' · ');
}

function updateDocTitle(){ $('#docTitle').textContent = [S.meta.title, S.meta.composer].filter(Boolean).join(' · '); }
function renderAll(){ validateSel(); renderTimeline(); renderInspector(); renderComments(); updateDocTitle(); updatePieceSummary(); $('#snap').checked = !!S.grid.snap; $('#bUndo').disabled = !undoStack.length; $('#bRedo').disabled = !redoStack.length; }

/* ---------- pointer interaction ---------- */
function tAt(ev){ return clamp((ev.clientX - inner.getBoundingClientRect().left - gut()) / pps, 0, dur()); }
// One drag at a time, following only the pointer that started it. A pinch (a second finger) aborts the drag and undoes it.
let abortDrag = null;
function drag(ev, move, opts = {}){
  ev.preventDefault();
  if (abortDrag) abortDrag();
  const prev = snapshot(), id = ev.pointerId; let moved = false; const x0 = ev.clientX;
  const off = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); abortDrag = null; };
  const mv = e => { if (e.pointerId !== id) return; if (!moved && Math.abs(e.clientX - x0) < 3) return; moved = true; move(e); if (!opts.scrub) renderTimeline(); };
  const up = e => {
    if (e.pointerId !== id) return;
    off();
    opts.end && opts.end(moved, e);
    if (!opts.scrub){ if (moved && snapshot() !== prev) commit(prev); renderAll(); }
  };
  abortDrag = () => { off(); if (!opts.scrub && snapshot() !== prev){ S = JSON.parse(prev); validateSel(); renderAll(); } };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
inner.addEventListener('pointerdown', ev => {
  if (ev.button > 0) return;
  const el = ev.target.closest('[data-k]'); if (!el) return;
  const k = el.dataset.k;
  if (k === 'addinst' || k === 'addlevel' || k === 'mv') return;
  if (k === 'ruler' || k === 'wave' || k === 'mktrk'){
    P.seek(tAt(ev)); placePH();
    return drag(ev, e => { P.seek(tAt(e)); placePH(); }, {scrub: true});
  }
  if (k === 'sp'){
    const tier = +el.dataset.tier, id = el.dataset.id;
    if (ev.shiftKey && sel && sel.kind === 'span' && sel.tier === tier){
      const arr = S.tiers[tier], idx = [...sel.ids.map(i => arr.findIndex(s => s.id === i)), arr.findIndex(s => s.id === id)];
      const a = Math.min(...idx), b = Math.max(...idx); sel.ids = arr.slice(a, b + 1).map(s => s.id);
    } else sel = {kind: 'span', tier, ids: [id]};
    focusTier(tier); renderAll(); return;
  }
  if (k === 'tierlab'){ sel = {kind: 'tier', tier: +el.dataset.tier}; focusTier(+el.dataset.tier); renderAll(); return; }
  if (k === 'instlab'){ sel = {kind: 'inst', id: el.dataset.id}; focusInst(el.dataset.id); renderAll(); return; }
  if (k === 'mk'){
    sel = {kind: 'marker', id: el.dataset.id}; renderAll();
    if (presenting) return;
    const m = S.markers.find(m => m.id === el.dataset.id);
    return drag(ev, e => { m.time = snapT(tAt(e), e); }, {end: () => S.markers.sort((a, b) => a.time - b.time)});
  }
  if (k === 'is' || k === 'ih') focusInst(el.dataset.inst);
  if (presenting) { if (k === 'is'){ sel = {kind: 'ispan', inst: el.dataset.inst, id: el.dataset.id}; renderAll(); } return; }
  if (k === 'bnd'){
    const arr = S.tiers[+el.dataset.tier], i = +el.dataset.i;
    return drag(ev, e => { const t = clamp(snapT(tAt(e), e), arr[i].start + 0.1, arr[i + 1].end - 0.1); arr[i].end = arr[i + 1].start = t; });
  }
  if (k === 'ih'){
    ev.stopPropagation();
    const ins = S.instruments.find(i => i.id === el.dataset.inst), s = ins.spans.find(s => s.id === el.dataset.id), side = el.dataset.side;
    sel = {kind: 'ispan', inst: ins.id, id: s.id};
    return drag(ev, e => { const t = snapT(tAt(e), e); if (side === 'l') s.start = clamp(t, 0, s.end - 0.1); else s.end = clamp(t, s.start + 0.1, dur()); }, {end: () => ins.spans.sort((a, b) => a.start - b.start)});
  }
  if (k === 'is'){
    if (ev.shiftKey && sel && sel.kind === 'ispan' && sel.inst === el.dataset.inst){ const ids = selIds(); sel.ids = ids.includes(el.dataset.id) ? ids.filter(x => x !== el.dataset.id || x === sel.id) : [...ids, el.dataset.id]; }
    else sel = {kind: 'ispan', inst: el.dataset.inst, id: el.dataset.id};
    renderAll(); return;
  }
  if (k === 'itrk'){
    focusInst(el.dataset.id);
    const ins = S.instruments.find(i => i.id === el.dataset.id), t0 = snapT(tAt(ev), ev);
    const s = {id: uid(), start: t0, end: t0, comment: ''}; let added = false;
    return drag(ev, e => {
      if (!added){ ins.spans.push(s); added = true; }
      const t = snapT(tAt(e), e); s.start = Math.min(t0, t); s.end = Math.max(t0, t);
    }, {end: moved => {
      if (!moved || s.end - s.start < 0.15){ ins.spans = ins.spans.filter(x => x !== s); sel = {kind: 'inst', id: ins.id}; }
      else { ins.spans.sort((a, b) => a.start - b.start); sel = {kind: 'ispan', inst: ins.id, id: s.id}; }
    }});
  }
});
inner.addEventListener('dblclick', e => { if (e.target.closest('.sp, .mk')) focusLabel(); });
inner.addEventListener('click', e => {
  const mv = e.target.closest('[data-k="mv"]');
  if (mv){ if (mv.dataset.what === 'tier') moveTier(+mv.dataset.id, +mv.dataset.dir); else moveInst(mv.dataset.id, +mv.dataset.dir); return; }
  const b = e.target.closest('[data-k="addinst"],[data-k="addlevel"]'); if (!b) return;
  if (b.dataset.k === 'addinst') edit(() => {
    const n = S.instruments.length; const ins = {id: uid(), name: 'Instrument ' + (n + 1), color: COLORS[(n * 3 + 4) % COLORS.length], spans: []};
    S.instruments.push(ins); sel = {kind: 'inst', id: ins.id}; focusInst(ins.id);
  });
  else edit(() => { const k = S.tiers.length; S.tiers.push([mk(0, dur())]); S.tierNames[k] = TIER_NAMES[k] || 'Level ' + (k + 1); sel = {kind: 'tier', tier: k}; focusTier(k); });
  if (b.dataset.k === 'addinst') focusLabel();
});

/* ---------- zoom, scroll, transport ---------- */
function visW(){ return tl.clientWidth - gut(); }
const MAX_PPS = 600;
function fitPps(){ return Math.max(0.5, (visW() - 8) / dur()); }
function fit(){ pps = fitPps(); }
// Zooming out stops at the whole piece in view; there is nothing to see past that.
function zoom(f){ const t = P.t(); pps = clamp(pps * f, Math.min(fitPps(), MAX_PPS), MAX_PPS); renderTimeline(); tl.scrollLeft = t * pps - visW() / 2; }
// Zoom keeping the moment under the pointer (clientX) in place.
function zoomAt(f, clientX){
  const x = clamp(clientX - tl.getBoundingClientRect().left - gut(), 0, visW());
  const t = (tl.scrollLeft + x) / pps, next = clamp(pps * f, Math.min(fitPps(), MAX_PPS), MAX_PPS);
  if (Math.abs(next - pps) < 1e-9) return;
  pps = next; renderTimeline(); tl.scrollLeft = t * pps - x;
}

/* Pinch and wheel zoom on the timeline.
   - Trackpad pinch in Chrome, Edge, and Firefox, and Ctrl (or ⌘) + mouse wheel everywhere, arrive as wheel events with ctrlKey.
   - Trackpad pinch in Safari arrives as gesturestart/gesturechange with a running scale.
   - Touchscreens pinch with two fingers (touch events); the timeline's touch-action keeps the browser from zooming the page.
   Gestures fire many events a frame, so the zoom is gathered and applied once per animation frame. */
const Z = {f: 1, x: 0, raf: 0, safari: false, touch: null};
function queueZoom(f, clientX){
  if (!isFinite(f) || f <= 0) return;
  Z.f *= f; Z.x = clientX;
  if (!Z.raf) Z.raf = requestAnimationFrame(() => { Z.raf = 0; const f = Z.f; Z.f = 1; zoomAt(f, Z.x); });
}
tl.addEventListener('wheel', e => {
  if (e.ctrlKey || e.metaKey){
    e.preventDefault();
    if (Z.safari) return;
    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * visW() : e.deltaY;
    // A wheel notch (about 100px) zooms by about 1.5, like the + and - keys; a trackpad pinch sends many small deltas.
    queueZoom(Math.exp(-clamp(px, -50, 50) * 0.008), e.clientX);
  } else if (e.shiftKey && !e.deltaX && e.deltaY){
    e.preventDefault(); tl.scrollLeft += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  }
}, {passive: false});
let gScale = 1;
tl.addEventListener('gesturestart', e => { if (Z.touch) return; e.preventDefault(); Z.safari = true; gScale = 1; });
tl.addEventListener('gesturechange', e => { if (Z.touch || !Z.safari) return; e.preventDefault(); queueZoom(e.scale / gScale, e.clientX); gScale = e.scale; });
tl.addEventListener('gestureend', e => { e.preventDefault(); Z.safari = false; });
const tdist = e => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
const tmid = e => (e.touches[0].clientX + e.touches[1].clientX) / 2;
// Touch listeners sit on the document and test where the fingers are: the first finger's tap re-renders the timeline,
// so later touch events can target a removed element that no longer bubbles up to it.
const inTl = t => { const r = tl.getBoundingClientRect(); return t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom; };
document.addEventListener('touchstart', e => {
  if (e.touches.length !== 2 || !inTl(e.touches[0]) || !inTl(e.touches[1])) return;
  if (abortDrag) abortDrag();
  Z.touch = {d: tdist(e) || 1, x: tmid(e)};
}, {passive: true});
document.addEventListener('touchmove', e => {
  if (!Z.touch || e.touches.length !== 2) return;
  if (e.cancelable) e.preventDefault();
  const d = tdist(e) || 1, x = tmid(e);
  tl.scrollLeft -= x - Z.touch.x;
  queueZoom(d / Z.touch.d, x);
  Z.touch.d = d; Z.touch.x = x;
}, {passive: false});
const endTouch = e => { if (e.touches.length < 2) Z.touch = null; };
document.addEventListener('touchend', endTouch); document.addEventListener('touchcancel', endTouch);
function scrollTo(t){ const x = t * pps; if (x < tl.scrollLeft || x > tl.scrollLeft + visW() - 30) tl.scrollLeft = x - visW() * 0.25; }
$('#zIn').onclick = () => zoom(1.5); $('#zOut').onclick = () => zoom(1 / 1.5); $('#zFit').onclick = () => { fit(); renderTimeline(); };
document.querySelectorAll('[data-skip]').forEach(b => b.onclick = () => { P.seek(P.t() + +b.dataset.skip); scrollTo(P.t()); });
$('#bPlay').onclick = () => P.toggle();
$('#bSplit').onclick = cmdSplit; $('#bGroup').onclick = cmdGroup; $('#bMark').onclick = cmdMarker;
$('#bUndo').onclick = doUndo; $('#bRedo').onclick = doRedo; $('#bJoin').onclick = cmdJoinSel;
// Name the modifier keys the way this computer does.
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
if (IS_MAC){ document.querySelectorAll('.modk').forEach(k => k.textContent = '⌘'); document.querySelectorAll('.altk').forEach(k => k.textContent = '⌥ Option'); }
$('#bRedo').title = IS_MAC ? 'Redo (⌘⇧Z)' : 'Redo (Ctrl+Y)';

// The big clock: a large time readout for the room, so people can write down when things happen.
let bigClock = false;
function setBigClock(on){
  bigClock = on; $('#bigClock').hidden = !on; $('#bClock').setAttribute('aria-pressed', on);
  try { localStorage.setItem('listeningmap.bigclock', on ? '1' : ''); } catch(e){}
}
$('#bClock').onclick = () => setBigClock(!bigClock);
$('#bcClose').onclick = () => setBigClock(false);
try { if (localStorage.getItem('listeningmap.bigclock')) setBigClock(true); } catch(e){}
$('#snap').onchange = e => edit(() => { S.grid.snap = e.target.checked; if (e.target.checked && !S.grid.on) toast('Snapping uses the measure grid. Turn it on under Piece and grid.'); });
$('#present').onchange = e => { presenting = e.target.checked; document.body.classList.toggle('present', presenting); renderAll(); renderInfo(); };

let wasPlaying = null;
function loop(){
  if (!S){ requestAnimationFrame(loop); return; }
  const t = P.t(), playing = P.playing();
  placePH();
  const r = $('#readout'); const pos = mpos(t);
  r.innerHTML = fmt(t) + '<small>' + (pos || '&nbsp;') + '</small>';
  if (bigClock){ $('#bcTime').textContent = fmt(t); $('#bcPos').textContent = pos; }
  if (playing !== wasPlaying){ $('#playIcon').innerHTML = playing ? '<path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z"/>' : '<path d="M7 4.5v15l13-7.5z"/>'; $('#bPlay').setAttribute('aria-label', playing ? 'Pause' : 'Play'); wasPlaying = playing; }
  if (playing){ const x = t * pps; if (x > tl.scrollLeft + visW() - 40 || x < tl.scrollLeft) tl.scrollLeft = x - 40; }
  requestAnimationFrame(loop);
}

/* ---------- keyboard ---------- */
// In a text box, ⌘Z / Ctrl+Z undoes typing; once there is nothing typed to undo there, it undoes the last edit.
let focusVal = null;
document.addEventListener('focusin', e => { focusVal = 'value' in e.target ? e.target.value : null; });
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (tag === 'input' || tag === 'textarea' || tag === 'select'){
    if (e.key === 'Escape') e.target.blur();
    else if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z') && e.target.value === focusVal && e.target.type !== 'file'){ e.preventDefault(); e.target.blur(); doUndo(); }
    return;
  }
  if (e.key === ' '){ e.preventDefault(); return mod ? playFromSel() : P.toggle(); }
  if (mod && (e.key === 'z' || e.key === 'Z')){ e.preventDefault(); return e.shiftKey ? doRedo() : doUndo(); }
  if (mod && (e.key === 'y' || e.key === 'Y')){ e.preventDefault(); return doRedo(); }
  if (mod && e.shiftKey && (e.key === 'd' || e.key === 'D')){ e.preventDefault(); return cmdDelete(-1); }
  if (e.altKey && e.key.startsWith('Arrow')){ e.preventDefault(); const m = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1]}[e.key]; return navSel(m[0], m[1], e.shiftKey); }
  if (mod) return;
  switch (e.key){
    case 'ArrowRight': case 'ArrowLeft': e.preventDefault(); P.seek(P.t() + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : 10)); scrollTo(P.t()); break;
    case 's': case 'S': cmdSplit(); break;
    case 'g': case 'G': cmdGroup(); break;
    case 'm': case 'M': cmdMarker(); break;
    case 'j': case 'J': cmdJoinSel(); break;
    case 'e': case 'E': cmdEnter(); break;
    case 'x': case 'X': cmdExit(); break;
    case 'c': case 'C': setBigClock(!bigClock); break;
    case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9': if (!e.shiftKey) pickInst(+e.key); break;
    case 'Delete': e.preventDefault(); cmdDelete(-1); break;
    case 'Backspace': e.preventDefault(); cmdDelete(1); break;
    case '+': case '=': zoom(1.5); break;
    case '-': case '_': zoom(1 / 1.5); break;
    case '0': fit(); renderTimeline(); break;
    case 'Escape': if (!$('#menu').hidden) showMenu(false); else { sel = null; renderAll(); } break;
  }
});

/* ---------- files ---------- */
function blankState(src){
  return {app: 'listening-map', version: 1,
    meta: {title: (src.name || '').replace(/\.[^.]+$/, ''), composer: '', student: '', notes: ''},
    source: src, grid: {on: false, bpm: 120, bpb: 4, offset: 0, snap: false},
    tierNames: ['Phrases'], tiers: [[mk(0, src.duration)]], markers: [], instruments: []};
}
function startNew(src){ S = blankState(src); undoStack = []; redoStack = []; sel = null; activeTier = 0; laneFocus = 'tier'; activeInst = null; cmFilter.clear(); hideBanner(); fit(); renderAll(); renderInfo(); tl.scrollLeft = 0; }
async function decodePeaks(arrayBuf){
  try { const ac = new (window.AudioContext || window.webkitAudioContext)(); const b = await ac.decodeAudioData(arrayBuf); ac.close && ac.close(); return {peaks: computePeaks(b), duration: b.duration}; }
  catch(e){ return null; }
}
$('#fAudio').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  await attachAudioFile(f, !pendingAudio);
};
async function attachAudioFile(f, fresh){
  const url = URL.createObjectURL(f);
  P.useAudio(url); peaks = null; waveMsg = 'Reading waveform…'; if (!fresh) renderTimeline();
  const d = await decodePeaks(await f.arrayBuffer());
  let duration = d ? d.duration : await new Promise(r => { P.audio.onloadedmetadata = () => r(P.audio.duration); P.audio.onerror = () => r(0); });
  if (!duration){ toast('That file could not be read as audio.'); P.none(); return; }
  peaks = d ? d.peaks : null; waveMsg = d ? '' : 'Waveform unavailable for this format';
  if (fresh) startNew({type: 'file', name: f.name, duration});
  else {
    if (Math.abs(duration - dur()) > 2) toast(`This audio is ${fmt(duration)} long; the analysis expects ${fmt(dur())}. Check that it is the same recording.`);
    S.source.name = f.name; pendingAudio = null; hideBanner(); renderAll();
  }
}
const showYT = on => { $('#ytPop').hidden = !on; $('#bYT').setAttribute('aria-expanded', on); if (on) $('#ytUrl').focus(); };
$('#bYT').onclick = () => showYT($('#ytPop').hidden);
$('#ytCancel').onclick = () => showYT(false);
$('#ytPop').onsubmit = e => {
  e.preventDefault();
  const id = ytId($('#ytUrl').value); if (!id){ toast('That does not look like a YouTube link.'); return; }
  showYT(false); pendingAudio = null; hideBanner();
  useYouTube(id, (d, title) => startNew({type: 'youtube', youtubeId: id, name: title || 'YouTube ' + id, duration: d || 1}));
};
$('#fOpen').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  let data; try { data = JSON.parse(await f.text()); } catch(err){ toast('That file is not a Listening Map analysis.'); return; }
  openAnalysis(data, f.name);
};
// Opens an analysis object (from a file or a course submission). Returns false if it isn't one.
function openAnalysis(data, label){
  if (!data || data.app !== 'listening-map' || !Array.isArray(data.tiers) || !data.source){ toast('That file is not a Listening Map analysis.'); return false; }
  S = data; S.markers ||= []; S.instruments ||= [];
  for (const i of S.instruments){ if (i.texture){ if (i.texture !== 'solid') (i.spans || []).forEach(s => { s.texture ||= i.texture; }); delete i.texture; } } S.tierNames ||= []; S.grid ||= {on: false, bpm: 120, bpb: 4, offset: 0, snap: false}; S.meta ||= {title: '', composer: '', student: '', notes: ''};
  undoStack = []; redoStack = []; sel = null; activeTier = 0; laneFocus = 'tier'; activeInst = null; peaks = null; cmFilter.clear(); P.none(); P._t = 0;
  if (S.source.type === 'youtube'){ waveMsg = 'No waveform for YouTube sources'; hideBanner(); useYouTube(S.source.youtubeId); }
  else if (S.source.type === 'demo'){ hideBanner(); loadDemoAudio(); }
  else { pendingAudio = S.source.name; waveMsg = 'Audio not loaded'; showBanner(`This analysis was made with <b>${esc(S.source.name)}</b>. Load that file to hear it. <label class="btn sm" for="fAudio">Choose audio file</label>`); }
  fit(); renderAll(); renderInfo(); tl.scrollLeft = 0;
  toast('Opened ' + (S.meta.student ? S.meta.student + '’s analysis' : label));
  return true;
}

function slug(s){ return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }
function baseName(){ return [slug(S.meta.title) || 'analysis', slug(S.meta.student)].filter(Boolean).join('_'); }
// Downloads a file. Inside a course site (the Apps Script frame) some browsers block downloads without saying so,
// so the banner also offers the text to copy.
function offerFile(name, text){
  try {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type: 'text/plain'})); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch(e){}
  if (!IN_COURSE_FRAME){ toast('Saved ' + name); return; }
  showBanner(`Downloading <b>${esc(name)}</b>. Nothing arrived? <button class="btn sm" type="button" id="copyOpen">Show the text to copy</button> <button class="btn sm" type="button" id="copyHide">Dismiss</button>`);
  $('#copyOpen').onclick = () => showCopy(name, text);
  $('#copyHide').onclick = hideBanner;
}
function showCopy(name, text){
  const d = $('#copyBox'); $('#copyTitle').textContent = name; $('#copyText').value = text;
  if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  $('#copyText').select();
}
$('#copyGo').onclick = async () => {
  const t = $('#copyText'); t.select();
  try { await navigator.clipboard.writeText(t.value); toast('Copied.'); } catch(e){ try { document.execCommand('copy'); toast('Copied.'); } catch(e2){ toast('Select the text and copy it.'); } }
};
$('#copyClose').onclick = () => { const d = $('#copyBox'); if (d.close) d.close(); else d.removeAttribute('open'); };
$('#bExport').onclick = () => offerFile(baseName() + '.listening-map.json', JSON.stringify(S, null, 2));
// Whether the Piece and grid panel is folded is kept on this device.
try { if (localStorage.getItem('listeningmap.piece') === 'closed') $('#piece').open = false; } catch(e){}
$('#piece').addEventListener('toggle', () => { try { localStorage.setItem('listeningmap.piece', $('#piece').open ? 'open' : 'closed'); } catch(e){} });

/* ---------- settings menu ---------- */
// The Settings menu holds what is used now and then: files, the look, and the shortcut list.
const menuItems = () => [...document.querySelectorAll('#menu .mi')].filter(b => b.offsetParent);
function showMenu(on){ $('#menu').hidden = !on; $('#bMenu').setAttribute('aria-expanded', on); if (on) menuItems()[0].focus(); }
$('#bMenu').onclick = () => showMenu($('#menu').hidden);
$('#menu').addEventListener('click', e => { if (e.target.closest('.mi')) showMenu(false); });
$('#menu').addEventListener('keydown', e => {
  const items = menuItems(), i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){ e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
  else if (e.key === 'Escape'){ e.stopPropagation(); showMenu(false); $('#bMenu').focus(); }
  else if (e.key === 'Tab') showMenu(false);
});
document.addEventListener('pointerdown', e => { if (!$('#menu').hidden && !e.target.closest('.menuwrap')) showMenu(false); });
$('#bImport').onclick = () => $('#fOpen').click();
const showKeys = on => { $('#keysPop').hidden = !on; $('#bKeys').setAttribute('aria-expanded', on); };
$('#bKeys').onclick = () => showKeys($('#keysPop').hidden);
$('#keysClose').onclick = () => showKeys(false);

/* ---------- banner, toast ---------- */
function showBanner(html){ const b = $('#banner'); b.innerHTML = html; b.hidden = false; }
function hideBanner(){ $('#banner').hidden = true; }
let toastT; function toast(msg){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3200); }

/* ---------- demo track (synthesized in the browser) ---------- */
async function makeDemo(){
  const sr = 22050, D = 80, ctx = new OfflineAudioContext(1, sr * D, sr);
  const comp = ctx.createDynamicsCompressor(); comp.connect(ctx.destination);
  const out = ctx.createGain(); out.gain.value = 0.8; out.connect(comp);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600; lp.connect(out);
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const nb = ctx.createBuffer(1, sr, sr), nd = nb.getChannelData(0); for (let i = 0; i < sr; i++) nd[i] = Math.random() * 2 - 1;
  const tone = (type, m, t, len, vol, a = .01, r = .08, dest = lp) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz(m);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.setValueAtTime(vol, t + Math.max(a, len - r)); g.gain.linearRampToValueAtTime(0, t + len);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + len + .02);
  };
  const noise = (t, vol, freq, len) => {
    const s = ctx.createBufferSource(); s.buffer = nb; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + len);
    s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * .5); s.stop(t + len + .02);
  };
  const kick = t => { const o = ctx.createOscillator(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + .14); const g = ctx.createGain(); g.gain.setValueAtTime(.9, t); g.gain.exponentialRampToValueAtTime(.001, t + .3); o.connect(g); g.connect(out); o.start(t); o.stop(t + .32); };
  const CH = {C: [60, 64, 67], Am: [57, 60, 64], F: [53, 57, 60], G: [55, 59, 62], Dm: [50, 53, 57]};
  const V = ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G'], K = ['F', 'G', 'C', 'Am', 'F', 'G', 'C', 'C'];
  const plan = [['intro', ['C', 'Am', 'F', 'G']], ['verse', V], ['chorus', K], ['verse2', V], ['chorus', K], ['outro', ['F', 'G', 'C', 'C']]];
  let bar = 0;
  for (const [sec, prog] of plan){
    prog.forEach((c, bi) => {
      const t = bar * 2, ch = CH[c];
      const fade = sec === 'outro' ? 1 - bi / 5 : 1;
      ch.forEach(n => tone('triangle', n, t, 2.05, .07 * fade, .25, .4));
      if (sec !== 'intro'){
        if (sec === 'outro') { tone('triangle', ch[0] - 24, t, 1.9, .28 * fade, .01, .3); }
        else for (let e = 0; e < 8; e++) tone('triangle', ch[0] - 24, t + e * .25, .22, .28, .005, .05);
      }
      if (sec === 'verse' || sec === 'verse2' || sec === 'chorus'){
        const beats = sec === 'chorus' ? [0, 1, 2, 3] : [0, 2];
        beats.forEach(b => kick(t + b * .5));
        if (sec !== 'verse') [1, 3].forEach(b => noise(t + b * .5, .35, 1200, .16));
        for (let e = 0; e < 8; e++) noise(t + e * .25, e % 2 ? .07 : .12, 7000, .05);
      }
      if (sec === 'chorus'){
        const pat = [0, 1, 2, 1, 2, 0, 1, 2];
        pat.forEach((p, e) => tone('square', ch[p] + 12, t + e * .25, .22, .05, .005, .06));
      }
      bar++;
    });
  }
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0), n = d.length, ab = new ArrayBuffer(44 + n * 2), v = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0, o = 44; i < n; i++, o += 2){ const s = clamp(d[i], -1, 1); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return {blob: new Blob([ab], {type: 'audio/wav'}), buffer: buf};
}
let demoCache = null;
async function loadDemoAudio(){
  waveMsg = 'Generating the demo track…'; renderTimeline();
  try {
    demoCache = demoCache || await makeDemo();
    if (S.source.type !== 'demo') return;
    P.useAudio(URL.createObjectURL(demoCache.blob)); peaks = computePeaks(demoCache.buffer); waveMsg = ''; renderTimeline();
  } catch(e){ waveMsg = 'The demo track could not be generated in this browser'; renderTimeline(); }
}
function demoState(){
  const s = (a, b, label, color, o) => mk(a, b, label, color, o);
  return {app: 'listening-map', version: 1,
    meta: {title: 'Demo Track in C', composer: 'Generated in the browser', student: 'Example analysis', notes: 'Verse and chorus form in two rotations, framed by an auxiliary intro and outro. Choruses add drums on every beat, a backbeat, and an arpeggiated lead.'},
    source: {type: 'demo', name: 'Demo track (generated)', duration: 80},
    grid: {on: true, bpm: 120, bpb: 4, offset: 0, snap: true},
    tierNames: ['Phrases', 'Sections'],
    tiers: [
      [s(0, 8, 'Intro', 'sky', {aux: true}), s(8, 16, 'a', 'teal'), s(16, 24, 'a′', 'teal', {comment: 'Same opening as a, but IV is replaced by ii so the phrase leans harder into V.'}), s(24, 32, 'c', 'amber'), s(32, 40, 'c′', 'amber', {comment: 'Ends on the tonic: the first real arrival of the song.'}),
       s(40, 48, 'a', 'teal'), s(48, 56, 'a′', 'teal'), s(56, 64, 'c', 'amber'), s(64, 72, 'c′', 'amber'), s(72, 80, 'Outro', 'sky', {aux: true})],
      [s(0, 8, 'Intro', 'sky', {aux: true, comment: 'Pad alone states the verse progression I vi IV V.'}), s(8, 24, 'Verse 1', 'teal', {comment: 'Bass and kick enter together. Eighth-note bass keeps the energy moderate.'}), s(24, 40, 'Chorus', 'amber', {texture: 'dots', comment: 'Progression rotates to start on IV. Drum density doubles and the lead enters.'}),
       s(40, 56, 'Verse 2', 'teal', {comment: 'A backbeat is added that was missing from verse 1, so the second rotation is not an exact repeat.'}), s(56, 72, 'Chorus', 'amber', {texture: 'dots'}), s(72, 80, 'Outro', 'sky', {aux: true, comment: 'Drums and lead drop out; the texture fades over IV V I.'})]
    ],
    markers: [
      {id: uid(), time: 8, label: 'Groove enters', kind: 'texture', comment: ''},
      {id: uid(), time: 38, label: 'PAC', kind: 'cadence', comment: 'V to I in the last two bars of the chorus.'},
      {id: uid(), time: 56, label: 'Climax', kind: 'climax', color: 'rose', comment: 'Fullest texture of the piece begins here.'},
      {id: uid(), time: 70, label: 'PAC', kind: 'cadence', comment: ''}
    ],
    instruments: [
      {id: uid(), name: 'Pad', color: 'slate', spans: [{id: uid(), start: 0, end: 80, comment: 'Sustained triads throughout.'}]},
      {id: uid(), name: 'Bass', color: 'blue', spans: [{id: uid(), start: 8, end: 80, comment: ''}]},
      {id: uid(), name: 'Drums', color: 'rose', spans: [{id: uid(), start: 8, end: 72, comment: ''}]},
      {id: uid(), name: 'Lead', color: 'amber', spans: [{id: uid(), start: 24, end: 40, comment: 'Arpeggiates the chord tones in eighth notes.'}, {id: uid(), start: 56, end: 72, texture: 'stripes', comment: ''}]}
    ]};
}

/* ---------- boot ---------- */
S = demoState();
activeTier = 0;
$('#courseName').textContent = CFG.COURSE || '';
fit(); renderAll(); renderInfo();
requestAnimationFrame(loop);
loadDemoAudio();
showBanner(esc(CFG.WELCOME || 'You are looking at an example analysis of a short generated track. Press play to listen, then open your own audio or a YouTube link to start a new analysis.'));
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(renderTimeline, 120); });
// A new look changes the waveform color and may change the label gutter, so redraw the timeline.
onLookChange = () => { if (S) renderTimeline(); };
initLookPicker();
initCourse();
