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
  initFeedback();
  if (!IN_COURSE_FRAME && typeof MOCK_SERVER === 'undefined') return;
  try { SESSION = await server('getSession'); }
  catch(e){ showBanner('Course features are unavailable: ' + esc(serverMessage(e))); return; }
  showFeedback(true);
  if (SESSION.course) $('#courseName').textContent = SESSION.course;
  // Submit and Student submissions sit at the top of the Settings menu, only for those who can use them.
  $('#bSubmit').hidden = !SESSION.canSubmit;
  $('#bSubs').hidden = !SESSION.teacher;
  $('#courseItems').hidden = !SESSION.canSubmit && !SESSION.teacher;
  $('#courseLabel').textContent = SESSION.course || 'Course';
  $('#bSubmit').onclick = openSubmit;
  $('#subCancel').onclick = () => { $('#submitPop').hidden = true; };
  $('#submitPop').onsubmit = e => { e.preventDefault(); doSubmit(); };
  $('#bSubs').onclick = () => showSubs(true);
  $('#subsClose').onclick = () => showSubs(false);
  $('#subsRefresh').onclick = loadSubs;
  $('#subsFilter').onchange = renderSubs;
  $('#subsList').addEventListener('click', e => { const b = e.target.closest('[data-sub]'); if (b) openSubmission(b.dataset.sub, b); });
  $('#submitPop').addEventListener('click', e => { const b = e.target.closest('[data-sub]'); if (b) openSubmission(b.dataset.sub, b); });
}

/* ---------- feedback: question, problem, suggestion ----------
   With a course connection the message goes to the Feedback tab of the course's Sheet. Without one, a course's
   FEEDBACK_URL (a form or a mailto: link) opens instead; with neither, the link stays hidden. */
function showFeedback(on){ $('#fbItems').hidden = !on; $('#fbFoot').hidden = !on; }
function initFeedback(){
  const url = typeof CFG.FEEDBACK_URL === 'string' && /^(https:|mailto:)/i.test(CFG.FEEDBACK_URL) ? CFG.FEEDBACK_URL : '';
  const open = () => {
    showMenu(false);
    if (!SESSION){ if (url) window.open(url, '_blank', 'noopener'); return; }
    $('#fbForm').hidden = false; $('#fbDone').hidden = true; $('#fbCancel').textContent = 'Cancel';
    $('#fbNote').textContent = (SESSION.email ? 'Sent to your instructor with your email (' + SESSION.email + ')' : 'Sent to your instructor') + ' and the name of the piece on screen.';
    $('#fbPop').hidden = false; $('#fbPop').scrollIntoView({block: 'nearest'}); $('#fbText').focus();
  };
  $('#bFeedback').onclick = open; $('#bFeedback2').onclick = open;
  $('#fbCancel').onclick = () => { $('#fbPop').hidden = true; };
  $('#fbPop').onsubmit = e => { e.preventDefault(); sendFeedback(); };
  if (url) showFeedback(true);
}
async function sendFeedback(){
  const text = $('#fbText').value.trim();
  if (!text){ toast('Write a message first.'); $('#fbText').focus(); return; }
  const go = $('#fbGo'); go.disabled = true; go.textContent = 'Sending…';
  try {
    await server('sendFeedback', {kind: $('#fbKind').value, text, piece: S && S.meta ? [S.meta.title, S.meta.composer].filter(Boolean).join(', ') : '', browser: navigator.userAgent});
    $('#fbText').value = '';
    $('#fbForm').hidden = true; $('#fbCancel').textContent = 'Done';
    $('#fbDone').hidden = false; $('#fbDone').innerHTML = '<p><b>Thanks. Your instructor has it.</b></p>';
  } catch(e){ $('#fbNote').innerHTML = '<b>Not sent.</b> ' + esc(serverMessage(e)); }
  finally { go.disabled = false; go.textContent = 'Send'; }
}

/* ---------- students: submit ---------- */
// What the instructor will receive, so the student can check it before sending.
function submitSummary(){
  const blocks = S.tiers.reduce((n, t) => n + t.length, 0), labeled = S.tiers.reduce((n, t) => n + t.filter(s => s.label).length, 0);
  const comments = S.tiers.flat().concat(S.markers).filter(x => x.comment).length + S.instruments.reduce((n, i) => n + i.spans.filter(s => s.comment).length, 0);
  const src = S.source.type === 'youtube' ? 'YouTube video' : S.source.type === 'demo' ? 'the example track' : (S.source.name || 'audio file') + ' (the file itself is not sent)';
  const row = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
  return row('Piece', esc(S.meta.title || 'Untitled') + (S.meta.composer ? ', ' + esc(S.meta.composer) : ''))
    + row('Recording', esc(src))
    + row('Analysis', `${blocks} blocks (${labeled} labeled) on ${S.tiers.length} ${S.tiers.length === 1 ? 'section lane' : 'section lanes'}, ${S.markers.length} markers, ${S.instruments.length} tracks, ${comments} comments`);
}
function mineList(){
  const mine = SESSION.mine || [];
  return mine.length ? `Your earlier submissions: ${mine.slice(0, 5).map(m => `${esc(m.assignment || m.title || 'Analysis')} (${esc(whenText(m.when))}) <button class="btn sm" type="button" data-sub="${esc(m.id)}">Open</button>`).join(' · ')}` : '';
}
function openSubmit(){
  if (!SESSION) return;
  const asg = SESSION.assignments || [], demo = isExample();
  $('#subCourse').textContent = SESSION.course || 'your course';
  $('#subHead').textContent = 'Hand in this analysis';
  $('#subForm').hidden = false; $('#subDone').hidden = true; $('#subCancel').textContent = 'Cancel';
  $('#subAsgWrap').hidden = !asg.length;
  $('#subAsg').innerHTML = asg.map(a => `<option>${esc(a)}</option>`).join('');
  $('#subName').value = S.meta.student || SESSION.name || '';
  $('#subWhat').innerHTML = submitSummary();
  $('#subGo').disabled = demo;
  $('#subNote').innerHTML = demo
    ? '<b>This is the example analysis, so it can’t be submitted.</b> Load your own recording with <b>Open audio</b> or <b>YouTube link</b> (under Source, beside the play controls), make your analysis, then come back here.'
    : `Signed in as ${esc(SESSION.email)}. You can submit again after more work; your instructor sees every version, newest first.`;
  $('#subMine').innerHTML = mineList();
  $('#submitPop').hidden = false;
  $('#submitPop').scrollIntoView({block: 'nearest'});
  if (!demo) $('#subName').focus();
}
async function doSubmit(){
  const name = $('#subName').value.trim();
  if (isExample()) return;
  if (!name){ toast('Add your name first.'); $('#subName').focus(); return; }
  if (name !== S.meta.student) edit(() => { S.meta.student = name; });
  renderInfo();
  const go = $('#subGo'); go.disabled = true; go.textContent = 'Submitting…';
  try {
    const r = await server('submitAnalysis', {assignment: $('#subAsgWrap').hidden ? '' : $('#subAsg').value, json: JSON.stringify(S)});
    SESSION.mine = [r, ...(SESSION.mine || [])];
    $('#subHead').textContent = 'Submitted';
    $('#subForm').hidden = true; $('#subCancel').textContent = 'Done';
    $('#subDone').hidden = false;
    $('#subDone').innerHTML = `<p><b>Your instructor has it.</b> Sent${r.assignment ? ' for <b>' + esc(r.assignment) + '</b>' : ''} at ${esc(whenText(r.when))}.</p>
      <p class="note">Keep working if you like and submit again; each version is kept. Export the analysis from Settings to keep your own copy.</p>`;
    $('#subMine').innerHTML = mineList();
  } catch(e){ $('#subNote').innerHTML = '<b>Not submitted.</b> ' + esc(serverMessage(e)); toast('Not submitted: ' + serverMessage(e)); }
  finally { go.disabled = false; go.textContent = 'Submit'; }
}
function whenText(iso){
  const d = new Date(iso); if (isNaN(d)) return String(iso || '');
  return d.toLocaleString([], {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
}

/* ---------- instructors: submissions ---------- */
let SUBS = [];
function showSubs(on){
  $('#subsPanel').hidden = !on;
  if (on){ loadSubs(); $('#subsPanel').scrollIntoView({block: 'nearest'}); }
}
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
    : '<p class="note">No submissions yet. Students find <b>Submit to your instructor</b> in the Settings menu once they are signed in.</p>';
}
async function openSubmission(id, btn){
  if (btn) btn.disabled = true;
  const info = SUBS.find(s => s.id === id) || (SESSION && SESSION.mine || []).find(s => s.id === id) || {};
  try {
    const text = await server('getSubmission', id);
    let data; try { data = JSON.parse(text); } catch(e){ toast('That submission could not be read.'); return; }
    if (!openAnalysis(data, 'the submission')) return;
    $('#submitPop').hidden = true; $('#subsPanel').hidden = true;
    // Say whose work is on screen, and keep the way back to the list.
    const who = info.name || data.meta && data.meta.student || info.email || 'A student';
    const audio = S.source.type === 'file' ? ` Load <b>${esc(S.source.name)}</b> to listen along. <label class="btn sm" for="fAudio">Choose audio file</label>` : '';
    showBanner(`Viewing <b>${esc(who)}</b>’s submission${info.assignment ? ' for <b>' + esc(info.assignment) + '</b>' : ''}${info.when ? ', sent ' + esc(whenText(info.when)) : ''}. Edits here are not sent back.${audio}`
      + (SESSION && SESSION.teacher ? ` <button class="btn sm" type="button" id="subsBack">Back to submissions</button>` : ''));
    const back = $('#subsBack'); if (back) back.onclick = () => showSubs(true);
    window.scrollTo({top: 0});
  } catch(e){ toast(serverMessage(e)); }
  finally { if (btn) btn.disabled = false; }
}
