/* Stand-in for the course server in dist/<course>/preview.html. Nothing leaves the page and nothing is kept after a
   reload. Add ?as=student to the preview's address to see the student view (Submit, without Submissions). */
const MOCK_SERVER = (() => {
  const asStudent = /[?&]as=student\b/.test(location.search);
  const subs = [];
  const count = d => ({blocks: (d.tiers || []).reduce((n, t) => n + t.length, 0),
    comments: (d.tiers || []).flat().concat(d.markers || []).filter(x => x.comment).length});
  return {
    getSession(){
      return {course: CONFIG.COURSE + ' (preview)', email: asStudent ? 'student@example.edu' : 'instructor@example.edu', name: '',
        teacher: !asStudent, canSubmit: CONFIG.SUBMIT !== false, assignments: ['Listening map 1', 'Listening map 2'],
        mine: subs.filter(s => s.email === 'student@example.edu')};
    },
    submitAnalysis(p){
      const d = JSON.parse(p.json), id = 'mock' + (subs.length + 1);
      const row = {id, when: new Date().toISOString(), email: asStudent ? 'student@example.edu' : 'instructor@example.edu', name: d.meta.student,
        assignment: p.assignment, title: d.meta.title, composer: d.meta.composer, json: p.json, ...count(d)};
      subs.unshift(row);
      return {id, when: row.when, assignment: row.assignment, title: row.title};
    },
    listSubmissions(){ if (asStudent) throw new Error('TEACHER: Only instructors can see submissions.'); return subs.map(({json, ...s}) => s); },
    sendFeedback(p){ if (!String(p.text || '').trim()) throw new Error('EMPTY: Write a message first.'); console.log('Feedback (preview, not sent):', p); return {ok: true}; },
    getSubmission(id){ const s = subs.find(s => s.id === id); if (!s) throw new Error('NOTFOUND: That submission is gone.'); return s.json; }
  };
})();
