/* ===== Course connection =====
   Served by a course's Apps Script web app, the page talks to that course's server (src/server/Code.js) through
   google.script.run: students submit analyses, and instructors list and open them. In the local preview a stand-in
   (preview-mock.js) answers instead. Anywhere else (a plain file), the course features stay hidden and the page
   works on its own with Export. Runs before app.js in one script, so only functions live at the top level here. */
function server(fn, ...args){
  if (window.google && google.script && google.script.run)
    return new Promise((res, rej) => google.script.run.withSuccessHandler(res).withFailureHandler(rej)[fn](...args));
  if (typeof MOCK_SERVER !== 'undefined' && MOCK_SERVER[fn]) return Promise.resolve().then(() => MOCK_SERVER[fn](...args));
  return Promise.reject(new Error('OFFLINE'));
}
function serverMessage(err){
  const m = String((err && err.message) || err || '');
  if (/^OFFLINE/.test(m)) return 'This copy of the page is not connected to a course.';
  return m.replace(/^(Exception|Error):\s*/, '').replace(/^[A-Z]+:\s*/, '') || 'Something went wrong. Try again.';
}
let SESSION = null;
async function initCourse(){
  if (!IN_COURSE_FRAME && typeof MOCK_SERVER === 'undefined') return;
  try { SESSION = await server('getSession'); }
  catch(e){ showBanner(esc(serverMessage(e))); return; }
  if (SESSION.course) $('#courseName').textContent = SESSION.course;
  $('#bSubmit').hidden = !SESSION.canSubmit;
  $('#bSubs').hidden = !SESSION.teacher;
  $('#bSubmit').onclick = openSubmit;
  $('#subCancel').onclick = () => { $('#submitPop').hidden = true; };
  $('#submitPop').onsubmit = e => { e.preventDefault(); doSubmit(); };
  $('#bSubs').onclick = () => { const p = $('#subsPanel'); p.hidden = !p.hidden; if (!p.hidden) loadSubs(); };
  $('#subsClose').onclick = () => { $('#subsPanel').hidden = true; };
  $('#subsRefresh').onclick = loadSubs;
  $('#subsFilter').onchange = renderSubs;
  $('#subsList').addEventListener('click', e => { const b = e.target.closest('[data-sub]'); if (b) openSubmission(b.dataset.sub, b); });
  $('#submitPop').addEventListener('click', e => { const b = e.target.closest('[data-sub]'); if (b) openSubmission(b.dataset.sub, b); });
}

/* ---------- students: submit ---------- */
function openSubmit(){
  if (!SESSION) return;
  const pop = $('#submitPop'), asg = SESSION.assignments || [];
  $('#subCourse').textContent = SESSION.course || 'your course';
  $('#subAsgWrap').hidden = !asg.length;
  $('#subAsg').innerHTML = asg.map(a => `<option>${esc(a)}</option>`).join('');
  $('#subName').value = S.meta.student || SESSION.name || '';
  const mine = SESSION.mine || [];
  const src = S.source.type === 'file' ? ' Your audio file is not sent, only the analysis. Your instructor needs the same recording to hear it.' : '';
  $('#subNote').innerHTML = (S.source.type === 'demo' ? '<b>This is the example analysis.</b> Open your own audio or a YouTube link first. ' : '')
    + `Signed in as ${esc(SESSION.email)}. You can submit again; your instructor sees every version.${src}`
    + (mine.length ? `<br>Your submissions: ${mine.slice(0, 5).map(m => `${esc(m.assignment || m.title || 'Analysis')} (${esc(whenText(m.when))}) <button class="btn sm" type="button" data-sub="${esc(m.id)}">Open</button>`).join(' · ')}` : '');
  pop.hidden = false; $('#subName').focus();
}
async function doSubmit(){
  const name = $('#subName').value.trim();
  if (!name){ toast('Add your name first.'); $('#subName').focus(); return; }
  if (S.source.type === 'demo'){ toast('Open your own audio or a YouTube link and make your analysis first.'); return; }
  if (name !== S.meta.student) edit(() => { S.meta.student = name; });
  renderInfo();
  const go = $('#subGo'); go.disabled = true; go.textContent = 'Submitting…';
  try {
    const r = await server('submitAnalysis', {assignment: $('#subAsgWrap').hidden ? '' : $('#subAsg').value, json: JSON.stringify(S)});
    SESSION.mine = [r, ...(SESSION.mine || [])];
    $('#submitPop').hidden = true;
    showBanner(`Submitted${r.assignment ? ' for <b>' + esc(r.assignment) + '</b>' : ''} at ${esc(whenText(r.when))}. Keep your exported file too, in case you want to keep working on it.`);
  } catch(e){ toast(serverMessage(e)); }
  finally { go.disabled = false; go.textContent = 'Submit'; }
}
function whenText(iso){
  const d = new Date(iso); if (isNaN(d)) return String(iso || '');
  return d.toLocaleString([], {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
}

/* ---------- instructors: submissions ---------- */
let SUBS = [];
async function loadSubs(){
  $('#subsList').innerHTML = '<p class="note">Loading…</p>';
  try { SUBS = await server('listSubmissions'); }
  catch(e){ $('#subsList').innerHTML = `<p class="note">${esc(serverMessage(e))}</p>`; return; }
  const f = $('#subsFilter'), cur = f.value, names = [...new Set(SUBS.map(s => s.assignment || ''))];
  f.innerHTML = `<option value="*">All (${SUBS.length})</option>` + names.map(n => `<option value="${esc(n)}">${esc(n || 'No assignment')} (${SUBS.filter(s => (s.assignment || '') === n).length})</option>`).join('');
  if ([...f.options].some(o => o.value === cur)) f.value = cur;
  renderSubs();
}
function renderSubs(){
  const f = $('#subsFilter').value, rows = SUBS.filter(s => f === '*' || !f || (s.assignment || '') === f);
  $('#subsList').innerHTML = rows.length ? `<div class="subwrap"><table class="subt"><thead><tr><th>Student</th><th>Assignment</th><th>Piece</th><th>Submitted</th><th>Blocks</th><th>Comments</th><th></th></tr></thead><tbody>${rows.map(s => `<tr>
      <td><b>${esc(s.name || s.email)}</b><div class="meta">${esc(s.email)}</div></td><td>${esc(s.assignment || '')}</td>
      <td>${esc(s.title || '')}${s.composer ? `<div class="meta">${esc(s.composer)}</div>` : ''}</td><td class="meta">${esc(whenText(s.when))}</td>
      <td class="meta">${esc(s.blocks)}</td><td class="meta">${esc(s.comments)}</td>
      <td><button class="btn sm" type="button" data-sub="${esc(s.id)}">Open</button></td></tr>`).join('')}</tbody></table></div>`
    : '<p class="note">No submissions yet. Students see a Submit button once they are signed in.</p>';
}
async function openSubmission(id, btn){
  if (btn) btn.disabled = true;
  try {
    const text = await server('getSubmission', id);
    let data; try { data = JSON.parse(text); } catch(e){ toast('That submission could not be read.'); return; }
    if (openAnalysis(data, 'the submission')){ $('#submitPop').hidden = true; window.scrollTo({top: 0}); }
  } catch(e){ toast(serverMessage(e)); }
  finally { if (btn) btn.disabled = false; }
}
