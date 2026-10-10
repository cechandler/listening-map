/* ===== Looks: the page theme and light or dark mode =====
   Loaded in <head> so the page paints in the chosen look. A theme is a CSS layer in src/client/themes/<id>.css,
   scoped by the build to :root[data-skin="<id>"]. Light or dark is data-theme ("light", "dark", or none for the
   system setting), which every theme follows. The course file sets the default theme (THEME) and which themes
   students may pick (THEMES). Choices are kept on the viewer's device only. */
const LOOKS = [
  {id: 'studio', name: 'Studio', blurb: 'Quiet and clean. The original look.',
   fonts: 'family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500',
   light: ['#eef0f3', '#ffffff', '#c2550f', '#1b8cc4', '#181c24'], dark: ['#12151b', '#1a1e26', '#f08a3c', '#52b8ec', '#e7eaf0']},
  {id: 'keycap', name: 'Keycap', blurb: 'Warm paper, ink outlines, hard shadows, and red keys that press down.',
   fonts: 'family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Instrument+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500',
   light: ['#F3EFE6', '#FFFDF8', '#C8291D', '#84CC5F', '#161513'], dark: ['#141311', '#1D1B18', '#FF6A5C', '#9BDC78', '#ECE7DC']},
  {id: 'tapedeck', name: 'Tape deck', blurb: 'Studio hardware: an LCD readout and clips like a DAW arrangement.',
   fonts: 'family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;700',
   light: ['#D5D7D3', '#E9EAE7', '#E8590C', '#0E0F0D', '#9EF01A'], dark: ['#0F1012', '#1A1C1F', '#FF7A1A', '#050606', '#9EF01A']},
  {id: 'score', name: 'Score', blurb: 'Engraved paper: serif headings, hairline rules, and bracketed sections.',
   fonts: 'family=Spectral:ital,wght@0,500;0,700;1,500&family=Public+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500',
   light: ['#FBF8F1', '#FFFFFF', '#7E1A2A', '#1E6E47', '#1B1A17'], dark: ['#17161A', '#201F24', '#E8899A', '#7FD1A6', '#EAE6DD']}
];
const LOOK_KEY = 'listeningmap.look', MODE_KEY = 'listeningmap.mode';
let onLookChange = null;
function lookStore(key, val){
  try { if (val === undefined) return localStorage.getItem(key); if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val); } catch(e){}
  return null;
}
function lookChoices(){
  const cfg = typeof CONFIG === 'object' && CONFIG ? CONFIG : {};
  const ids = Array.isArray(cfg.THEMES) && cfg.THEMES.length ? cfg.THEMES : LOOKS.map(l => l.id);
  const list = LOOKS.filter(l => ids.includes(l.id));
  return list.length ? list : LOOKS.slice(0, 1);
}
function defaultLook(){
  const cfg = typeof CONFIG === 'object' && CONFIG ? CONFIG : {}, list = lookChoices();
  return (list.find(l => l.id === cfg.THEME) || list[0]).id;
}
function currentLook(){ const id = lookStore(LOOK_KEY), list = lookChoices(); return list.some(l => l.id === id) ? id : defaultLook(); }
function currentMode(){ const m = lookStore(MODE_KEY); return m === 'light' || m === 'dark' ? m : 'system'; }
function loadLookFonts(look){
  if (!look.fonts) return;
  const href = 'https:\/\/fonts.googleapis.com/css2?' + look.fonts + '&display=swap';
  if (document.querySelector(`link[data-look-font="${look.id}"]`)) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.setAttribute('data-look-font', look.id);
  document.head.appendChild(l);
}
function applyLook(id, mode){
  const root = document.documentElement, look = lookChoices().find(l => l.id === id) || lookChoices()[0];
  root.setAttribute('data-skin', look.id);
  if (mode === 'light' || mode === 'dark') root.setAttribute('data-theme', mode); else root.removeAttribute('data-theme');
  loadLookFonts(look);
  if (typeof onLookChange === 'function') onLookChange();
}
function setLook(id){ lookStore(LOOK_KEY, id === defaultLook() ? null : id); applyLook(id, currentMode()); renderLookPicker(); }
function setMode(m){ lookStore(MODE_KEY, m === 'system' ? null : m); applyLook(currentLook(), m); renderLookPicker(); }
function isDarkNow(){
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'dark' || (t !== 'light' && !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches));
}
function renderLookPicker(){
  const grid = document.getElementById('lookGrid'); if (!grid) return;
  const cur = currentLook(), dark = isDarkNow();
  grid.innerHTML = lookChoices().map(l => {
    const c = dark ? l.dark : l.light;
    return `<button type="button" class="lookcard${l.id === cur ? ' on' : ''}" data-look="${l.id}" aria-pressed="${l.id === cur}" style="--lk-bg:${c[0]};--lk-panel:${c[1]};--lk-acc:${c[2]};--lk-2:${c[3]};--lk-ink:${c[4]}">
      <span class="lookswatch" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <span class="lookname">${l.name}</span><span class="lookblurb">${l.blurb}</span></button>`;
  }).join('');
  const mode = currentMode();
  document.querySelectorAll('#lookPop [data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode));
}
function initLookPicker(){
  const pop = document.getElementById('lookPop'), btn = document.getElementById('bLook');
  if (!pop || !btn) return;
  const show = on => { pop.hidden = !on; btn.setAttribute('aria-expanded', on); if (on) renderLookPicker(); };
  btn.onclick = () => show(pop.hidden);
  document.getElementById('lookClose').onclick = () => show(false);
  document.getElementById('lookGrid').onclick = e => { const c = e.target.closest('[data-look]'); if (c) setLook(c.dataset.look); };
  pop.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { renderLookPicker(); if (typeof onLookChange === 'function') onLookChange(); }); } catch(e){} }
}
applyLook(currentLook(), currentMode());
