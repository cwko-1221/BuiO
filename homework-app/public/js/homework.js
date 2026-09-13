const app = document.getElementById('app');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const { t } = window.BuiI18n;
const statusLabels = { complete: t('h.statusComplete'), missing: t('h.statusMissing'), absent: t('h.statusAbsent') };
const grades = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
const state = { meta: null, view: 'monitors', roster: [], record: null, homeworks: [], teacherClasses: [], teacherClassYear: '', teacherClassesLoaded: false, teacherClassesTotal: 0, message: '', messageType: '' };

const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const subjectName = id => state.meta?.subjects.find(subject => subject.id === id)?.name || id;
const subjectsFor = grade => state.meta.subjects.filter(subject => !subject.grades || subject.grades.includes(grade));
const api = async (path, options = {}) => {
  const response = await fetch(`/api/homework${path}`, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({ success: false, message: t('h.badResponse') }));
  if (!response.ok || !data.success) throw Object.assign(new Error(data.message || t('h.actionFailed')), { status: response.status });
  return data;
};
const options = (items, selected, label = value => value, value = item => item) => items.map(item => `<option value="${escapeHtml(value(item))}" ${value(item) === selected ? 'selected' : ''}>${escapeHtml(label(item))}</option>`).join('');
const notice = () => state.message ? `<div class="notice ${state.messageType}">${escapeHtml(state.message)}</div>` : '';
function setMessage(message, type = 'success') { state.message = message; state.messageType = type; render(); }

function shell(content) {
  const teacher = state.meta.role === 'teacher';
  return `<div class="shell ${teacher ? '' : 'student-shell'}">
    <aside class="side">
      <div class="brand"><img src="/math-app/images/logo.png" alt="${escapeHtml(t('h.logoAlt'))}"><div><strong>${escapeHtml(t('h.school'))}</strong><span>LEARNING HUB</span></div></div>
      ${teacher ? `<nav class="nav" aria-label="${escapeHtml(t('h.navAria'))}">
        <button data-view="classes" class="${state.view === 'classes' ? 'active' : ''}">${escapeHtml(t('h.navClasses'))}</button>
        <button data-view="monitors" class="${state.view === 'monitors' ? 'active' : ''}">${escapeHtml(t('h.navMonitors'))}</button>
        <button data-view="records" class="${state.view === 'records' ? 'active' : ''}">${escapeHtml(t('h.navRecords'))}</button>
        <button data-view="analysis" class="${state.view === 'analysis' ? 'active' : ''}">${escapeHtml(t('h.navAnalysis'))}</button>
        <button data-view="class-analysis" class="${state.view === 'class-analysis' ? 'active' : ''}">${escapeHtml(t('h.navClassAnalysis'))}</button>
      </nav>` : ''}
      <a class="back" href="/">${escapeHtml(t('h.back'))}</a>
    </aside>
    <main class="main">
      <header class="top"><div><h1>${escapeHtml(t('h.title'))}</h1><p>${escapeHtml(t(teacher ? 'h.subtitleTeacher' : 'h.subtitleMonitor'))}</p></div><span class="date-chip">${today}</span></header>
      ${notice()}${content}
    </main>
  </div>`;
}

function filterHtml(prefix, values, includeDate = false) {
  const subjects = subjectsFor(values.className);
  if (!subjects.some(item => item.id === values.subject)) values.subject = subjects[0]?.id || '';
  return `<div class="filters">
    <div class="field"><label for="${prefix}Year">${escapeHtml(t('h.year'))}</label><select id="${prefix}Year">${options(state.meta.academicYears, values.academicYear)}</select></div>
    <div class="field"><label for="${prefix}Class">${escapeHtml(t('h.class'))}</label><select id="${prefix}Class">${options(grades, values.className)}</select></div>
    <div class="field"><label for="${prefix}Subject">${escapeHtml(t('h.subject'))}</label><select id="${prefix}Subject">${options(subjects, values.subject, item => item.name, item => item.id)}</select></div>
    ${includeDate ? `<div class="field"><label for="${prefix}Date">${escapeHtml(t('h.date'))}</label><input id="${prefix}Date" type="date" value="${values.date}" max="${today}"></div>` : '<div></div>'}
  </div>`;
}

const filterState = {
  monitors: { academicYear: '', className: 'P4', subject: 'chinese-a' },
  records: { academicYear: '', className: 'P4', subject: 'chinese-a', date: today },
  analysis: { academicYear: '', className: 'P4', studentId: '' },
  classAnalysis: { academicYear: '', className: 'P4', dateFrom: '', dateTo: today },
};

async function loadMonitorRoster() {
  const f = filterState.monitors;
  try {
    const [students, monitors] = await Promise.all([
      api(`/students?academicYear=${encodeURIComponent(f.academicYear)}&className=${encodeURIComponent(f.className)}&subject=${encodeURIComponent(f.subject)}`),
      api(`/monitors?academicYear=${encodeURIComponent(f.academicYear)}&className=${encodeURIComponent(f.className)}&subject=${encodeURIComponent(f.subject)}`),
    ]);
    state.roster = students.students.map(student => ({ ...student, selected: monitors.monitors.some(monitor => monitor.studentId === student.id) }));
    state.message = '';
  } catch (error) { state.roster = []; state.message = error.message; state.messageType = 'error'; }
  render();
}

function renderMonitors() {
  const f = filterState.monitors;
  return shell(`<section class="panel">
    <div class="panel-head"><div><h2>${escapeHtml(t('h.monitorsTitle'))}</h2><p class="hint">${escapeHtml(t('h.monitorsHint'))}</p></div></div>
    ${filterHtml('monitor', f)}
    <div class="student-list">${state.roster.length ? state.roster.map(student => `<label class="student-check">
      <input type="checkbox" class="monitor-check" value="${escapeHtml(student.id)}" ${student.selected ? 'checked' : ''}>
      <span><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.id)} · ${escapeHtml(student.classNo ? t('h.classNoSuffix', { no: student.classNo }) : t('h.noClassNo'))}</small></span>
    </label>`).join('') : `<div class="empty">${escapeHtml(t('h.noStudentsHere'))}</div>`}</div>
    <div class="actions" style="margin-top:20px"><button class="button primary" id="saveMonitors">${escapeHtml(t('h.saveMonitors'))}</button></div>
  </section>`);
}

async function loadTeacherRecord() {
  const f = filterState.records;
  try {
    const [roster, result] = await Promise.all([
      api(`/roster?academicYear=${encodeURIComponent(f.academicYear)}&className=${f.className}&subject=${f.subject}`),
      api(`/records?academicYear=${encodeURIComponent(f.academicYear)}&className=${f.className}&subject=${f.subject}&date=${f.date}`),
    ]);
    state.roster = roster.students;
    state.record = result.record;
    state.homeworks = result.record?.homeworks ? structuredClone(result.record.homeworks) : [];
    state.message = '';
  } catch (error) { state.record = null; state.homeworks = []; state.message = error.message; state.messageType = 'error'; }
  render();
}

async function loadTeacherClasses() {
  const academicYear = state.teacherClassYear || state.meta.currentAcademicYear;
  state.teacherClassYear = academicYear;
  try {
    const result = await api(`/teacher-classes?academicYear=${encodeURIComponent(academicYear)}`);
    state.teacherClasses = result.assignments || [];
    state.teacherClassesTotal = result.totalMissing || 0;
    state.teacherClassesLoaded = true;
    state.message = '';
  } catch (error) {
    state.teacherClasses = [];
    state.teacherClassesTotal = 0;
    state.teacherClassesLoaded = true;
    state.message = error.message;
    state.messageType = 'error';
  }
  render();
}

function renderTeacherClasses() {
  const groups = state.teacherClasses || [];
  const academicYear = state.teacherClassYear || state.meta.currentAcademicYear;
  const total = groups.reduce((count, group) => count + (group.missingCount || 0), 0);
  const cards = groups.map(group => `<article class="teacher-class-card">
    <div class="teacher-class-card-head">
      <div><span class="class-badge">${escapeHtml(group.className)}</span><h3>${escapeHtml(group.subjectName || subjectName(group.subject))}</h3></div>
      <strong>${escapeHtml(t('h.teacherClassesTotal', { count: group.missingCount || 0 }))}</strong>
    </div>
    ${group.rows?.length ? `<div class="missing-record-list">
      <div class="missing-record-row missing-record-heading"><span>${escapeHtml(t('h.date'))}</span><span>${escapeHtml(t('h.teacherClassesStudent'))}</span><span>${escapeHtml(t('h.teacherClassesHomework'))}</span><span>${escapeHtml(t('h.status'))}</span></div>
      ${group.rows.map(row => `<div class="missing-record-row">
        <span>${escapeHtml(row.date)}</span>
        <span><strong>${escapeHtml(row.studentName)}</strong><small>${escapeHtml(row.classNo ? t('h.classNoSuffix', { no: row.classNo }) : row.studentId)}</small></span>
        <span>${escapeHtml(row.homework)}</span>
        <span class="missing-record-status"><span class="status-tag missing">${escapeHtml(t('h.statusMissing'))}</span><label class="caught-up-check"><input type="checkbox" class="teacher-class-made-up" data-class="${escapeHtml(row.className)}" data-subject="${escapeHtml(row.subject)}" data-date="${escapeHtml(row.date)}" data-student="${escapeHtml(row.studentId)}" data-hw-id="${escapeHtml(row.homeworkId)}" ${row.madeUp ? 'checked' : ''}>${escapeHtml(t('h.madeUp'))}</label></span>
      </div>`).join('')}
    </div><div class="teacher-class-card-actions"><button type="button" class="button secondary teacher-class-save" data-group="${escapeHtml(group.className)}|${escapeHtml(group.subject)}">${escapeHtml(t('h.teacherClassesSave'))}</button></div>` : `<div class="empty">${escapeHtml(t('h.teacherClassesNoMissing'))}</div>`}
  </article>`).join('');

  return shell(`<section class="panel">
    <div class="panel-head"><div><h2>${escapeHtml(t('h.teacherClassesTitle'))}</h2><p class="hint">${escapeHtml(t('h.teacherClassesHint'))}</p></div><span class="assignment">${escapeHtml(academicYear)}</span></div>
    <div class="filters teacher-class-filter"><div class="field"><label for="teacherClassYear">${escapeHtml(t('h.year'))}</label><select id="teacherClassYear">${options(state.meta.academicYears, academicYear)}</select></div><div class="teacher-class-total">${escapeHtml(t('h.teacherClassesTotal', { count: total }))}</div></div>
  </section>
  <section class="panel teacher-classes-panel">${!state.teacherClassesLoaded ? `<div class="loading-inline">${escapeHtml(t('h.booting'))}</div>` : cards || `<div class="empty">${escapeHtml(t('h.teacherClassesNoAssignments'))}</div>`}</section>`);
}

function statusControls(homework, student, teacher = false, locked = false) {
  const row = homework.statuses.find(item => item.studentId === student.id);
  const current = row?.status || '';
  const statuses = ['complete', 'missing', 'absent'];
  if (locked) return `<div class="status-summary"><span class="status-tag ${current}">${statusLabels[current] || '—'}</span>${row?.madeUp ? `<span class="status-tag made-up">${escapeHtml(t('h.madeUp'))}</span>` : ''}</div>`;
  return `<div class="status-options">
    ${statuses.map(status => `<label><input type="radio" name="${escapeHtml(homework.id)}-${escapeHtml(student.id)}" data-hw="${escapeHtml(homework.id)}" data-student="${escapeHtml(student.id)}" value="${status}" ${current === status ? 'checked' : ''}>${statusLabels[status]}</label>`).join('')}
    ${teacher ? `<label class="made-up-option"><input type="checkbox" data-made-up data-hw="${escapeHtml(homework.id)}" data-student="${escapeHtml(student.id)}" ${row?.madeUp ? 'checked' : ''}>${escapeHtml(t('h.madeUp'))}</label>` : ''}
  </div>`;
}

function homeworkCards({ teacher = false, locked = false } = {}) {
  return state.homeworks.map((homework, index) => `<article class="homework-card">
    <div class="homework-title"><div><strong>${escapeHtml(t('h.homeworkNo', { n: index + 1 }))}</strong><input class="title-input homework-name" data-hw="${escapeHtml(homework.id)}" value="${escapeHtml(homework.title)}" ${locked ? 'disabled' : ''} aria-label="${escapeHtml(t('h.homeworkName'))}"></div>${!locked && state.homeworks.length > 1 ? `<button class="button danger remove-homework" data-hw="${escapeHtml(homework.id)}">${escapeHtml(t('h.removeHomework'))}</button>` : ''}</div>
    <table class="status-table"><thead><tr><th>${escapeHtml(t('h.student'))}</th><th>${escapeHtml(t('h.classNo'))}</th><th>${escapeHtml(t('h.status'))}</th></tr></thead><tbody>${state.roster.map(student => `<tr><td>${escapeHtml(student.name)} <small>${escapeHtml(student.id)}</small></td><td>${student.classNo || '—'}</td><td>${statusControls(homework, student, teacher, locked)}</td></tr>`).join('')}</tbody></table>
  </article>`).join('');
}

function renderRecords() {
  const f = filterState.records;
  const editingNewRecord = !state.record && state.homeworks.length > 0;
  return shell(`<section class="panel">
    <div class="panel-head"><div><h2>${escapeHtml(t('h.recordsTitle'))}</h2><p class="hint">${escapeHtml(t('h.recordsHint'))}</p></div><div class="actions"><button class="button secondary" id="printRecord" ${!state.record ? 'disabled' : ''}>${escapeHtml(t('h.downloadPdf'))}</button></div></div>
    ${filterHtml('record', f, true)}
  </section>
  <section class="panel">${state.record || editingNewRecord
    ? `${editingNewRecord ? `<div class="notice">${escapeHtml(t('h.newRecordNotice'))}</div>` : ''}${homeworkCards({ teacher: true })}<div class="actions" style="margin-top:20px"><button class="button secondary" id="addTeacherHomework">${escapeHtml(t('h.addHomework'))}</button><button class="button primary" id="saveRecord">${escapeHtml(t(editingNewRecord ? 'h.saveRecord' : 'h.saveChanges'))}</button>${state.record ? `<button class="button danger" id="deleteRecord" style="margin-left:auto">${escapeHtml(t('h.deleteRecord'))}</button>` : ''}</div>`
    : `<div class="empty">${escapeHtml(t('h.noRecordForDay'))}<div class="actions empty-actions"><button class="button primary" id="createTeacherRecord">${escapeHtml(t('h.newRecord'))}</button></div></div>`}</section>`);
}

async function loadAnalysisStudents() {
  try {
    const year = encodeURIComponent(filterState.analysis.academicYear);
    const result = await fetch(`/api/stats/teacher/all-users?academicYear=${year}`, { credentials: 'include' }).then(response => response.json());
    state.analysisStudents = (result.students || []).filter(student => student.className === filterState.analysis.className);
    if (!state.analysisStudents.some(student => student.id === filterState.analysis.studentId)) filterState.analysis.studentId = state.analysisStudents[0]?.id || '';
    state.analysisRows = [];
    state.message = '';
  } catch (error) { state.analysisStudents = []; state.message = t('h.rosterFailed'); state.messageType = 'error'; }
  render();
}

async function loadAnalysis() {
  const f = filterState.analysis;
  if (!f.studentId) return;
  try {
    const result = await api(`/analysis?academicYear=${encodeURIComponent(f.academicYear)}&className=${f.className}&studentId=${encodeURIComponent(f.studentId)}`);
    state.analysisRows = result.rows;
    state.message = '';
  } catch (error) { state.analysisRows = []; state.message = error.message; state.messageType = 'error'; }
  render();
}

function renderAnalysis() {
  const f = filterState.analysis;
  const students = state.analysisStudents || [];
  const rows = state.analysisRows || [];
  return shell(`<section class="panel"><div class="panel-head"><div><h2>${escapeHtml(t('h.analysisTitle'))}</h2><p class="hint">${escapeHtml(t('h.analysisHint'))}</p></div></div>
    <div class="filters three">
      <div class="field"><label for="analysisYear">${escapeHtml(t('h.year'))}</label><select id="analysisYear">${options(state.meta.academicYears, f.academicYear)}</select></div>
      <div class="field"><label for="analysisClass">${escapeHtml(t('h.grade'))}</label><select id="analysisClass">${options(grades, f.className)}</select></div>
      <div class="field"><label for="analysisStudent">${escapeHtml(t('h.student'))}</label><select id="analysisStudent">${options(students, f.studentId, item => `${item.name} (${item.id})`, item => item.id)}</select></div>
    </div>
    <div class="actions" style="margin-top:16px"><button class="button primary" id="runAnalysis" ${!f.studentId ? 'disabled' : ''}>${escapeHtml(t('h.showTotals'))}</button></div>
    ${rows.length ? `<table class="analysis-table"><thead><tr><th>${escapeHtml(t('h.date'))}</th><th>${escapeHtml(t('h.subject'))}</th><th>${escapeHtml(t('h.colHomework'))}</th><th>${escapeHtml(t('h.status'))}</th><th>${escapeHtml(t('h.colUpdateStatus'))}</th></tr></thead><tbody>${rows.map((row, index) => `<tr><td>${row.date}</td><td>${escapeHtml(subjectName(row.subject))}</td><td>${escapeHtml(row.homework)}</td><td><div class="status-summary"><span class="status-tag missing">${escapeHtml(t('h.statusMissing'))}</span>${row.madeUp ? `<span class="status-tag made-up">${escapeHtml(t('h.madeUp'))}</span>` : ''}</div></td><td><label class="analysis-made-up-label"><input type="checkbox" class="analysis-made-up" data-index="${index}" data-date="${escapeHtml(row.date)}" data-subject="${escapeHtml(row.subject)}" data-hw-id="${escapeHtml(row.homeworkId)}" ${row.madeUp ? 'checked' : ''}> ${escapeHtml(t('h.madeUp'))}</label></td></tr>`).join('')}</tbody></table><div class="actions" style="margin-top:20px"><button class="button primary" id="saveAnalysisMadeUp">${escapeHtml(t('h.save'))}</button></div>` : `<div class="empty" style="margin-top:20px">${escapeHtml(t('h.noMissing'))}</div>`}
  </section>`);
}

async function loadClassAnalysis() {
  const f = filterState.classAnalysis;
  try {
    const result = await api(`/class-analysis?academicYear=${encodeURIComponent(f.academicYear)}&className=${f.className}&dateFrom=${f.dateFrom}&dateTo=${f.dateTo}`);
    state.classAnalysisRows = result.rows;
    state.classAnalysisTotal = result.totalMissing;
    state.message = '';
  } catch (error) {
    state.classAnalysisRows = [];
    state.classAnalysisTotal = 0;
    state.message = error.message;
    state.messageType = 'error';
  }
  render();
}

function renderClassAnalysis() {
  const f = filterState.classAnalysis;
  const rows = state.classAnalysisRows || [];
  return shell(`<section class="panel">
    <div class="panel-head"><div><h2>${escapeHtml(t('h.classAnalysisTitle'))}</h2><p class="hint">${escapeHtml(t('h.classAnalysisHint'))}</p></div></div>
    <div class="filters">
      <div class="field"><label for="classAnalysisYear">${escapeHtml(t('h.year'))}</label><select id="classAnalysisYear">${options(state.meta.academicYears, f.academicYear)}</select></div>
      <div class="field"><label for="classAnalysisClass">${escapeHtml(t('h.class'))}</label><select id="classAnalysisClass">${options(grades, f.className)}</select></div>
      <div class="field"><label for="classAnalysisFrom">${escapeHtml(t('h.from'))}</label><input id="classAnalysisFrom" type="date" value="${f.dateFrom}"></div>
      <div class="field"><label for="classAnalysisTo">${escapeHtml(t('h.to'))}</label><input id="classAnalysisTo" type="date" value="${f.dateTo}" max="${today}"></div>
    </div>
    <div class="actions" style="margin-top:16px"><button class="button primary" id="runClassAnalysis">${escapeHtml(t('h.showClassStats'))}</button></div>
    ${rows.length ? `<div class="analysis-total">${t('h.classTotal', { count: state.classAnalysisTotal || 0 })}</div><table class="analysis-table"><thead><tr><th>${escapeHtml(t('h.student'))}</th><th>${escapeHtml(t('h.classNo'))}</th><th>${escapeHtml(t('h.missingCount'))}</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escapeHtml(row.name)} <small>${escapeHtml(row.id)}</small></td><td>${row.classNo || '—'}</td><td><strong>${row.missingCount}</strong></td></tr>`).join('')}</tbody></table>` : `<div class="empty" style="margin-top:20px">${escapeHtml(t('h.pickPeriod'))}</div>`}
  </section>`);
}

function emptyHomework(roster, defaultStatus = '') {
  return { id: crypto.randomUUID(), title: '', statuses: roster.map(student => ({ studentId: student.id, status: defaultStatus, madeUp: false })) };
}

async function loadStudentRecord() {
  const assignment = state.studentAssignment;
  if (!assignment) return;
  try {
    const query = `academicYear=${encodeURIComponent(assignment.academicYear)}&className=${assignment.className}&subject=${assignment.subject}`;
    const [roster, result] = await Promise.all([api(`/roster?${query}`), api(`/records?${query}&date=${state.studentDate}`)]);
    state.roster = roster.students;
    state.record = result.record;
    state.homeworks = result.record?.homeworks ? structuredClone(result.record.homeworks) : (state.studentDate === today ? [emptyHomework(roster.students)] : []);
    state.message = '';
  } catch (error) { state.record = null; state.homeworks = []; state.message = error.message; state.messageType = 'error'; }
  render();
}

function renderStudent() {
  const assignment = state.studentAssignment;
  const locked = state.studentDate !== today;
  return shell(`<section class="panel">
    <div class="panel-head"><div><h2>${escapeHtml(t('h.monitorTitle'))}</h2><p class="hint">${escapeHtml(t('h.monitorHint'))}</p></div>${assignment ? `<span class="assignment">${assignment.className} · ${escapeHtml(subjectName(assignment.subject))}</span>` : ''}</div>
    <div class="filters three">
      <div class="field"><label for="studentAssignment">${escapeHtml(t('h.mySubject'))}</label><select id="studentAssignment">${options(state.meta.assignments, assignment?.id, item => `${item.className} · ${subjectName(item.subject)}`, item => String(item.id))}</select></div>
      <div class="field"><label for="studentDate">${escapeHtml(t('h.date'))}</label><input id="studentDate" type="date" value="${state.studentDate}" max="${today}"></div><div></div>
    </div>
    ${locked ? `<div class="notice" style="margin-top:18px">${escapeHtml(t('h.lockedNotice'))}</div>` : state.record ? `<div class="notice" style="margin-top:18px">${escapeHtml(t('h.savedNotice'))}</div>` : ''}
  </section>
  <section class="panel">${state.homeworks.length ? `${homeworkCards({ locked })}<div class="actions" style="margin-top:20px">${!locked ? `<button class="button secondary" id="addHomework">${escapeHtml(t('h.addHomework'))}</button><button class="button primary" id="submitRecord">${escapeHtml(t(state.record ? 'h.saveChanges' : 'h.saveShort'))}</button>` : ''}</div>` : `<div class="empty">${escapeHtml(t('h.noRecordDate'))}</div>`}</section>`);
}

function syncEditor() {
  document.querySelectorAll('.homework-name').forEach(input => { const hw = state.homeworks.find(item => item.id === input.dataset.hw); if (hw) hw.title = input.value; });
  document.querySelectorAll('.status-options input:checked').forEach(input => {
    if (input.matches('[data-made-up]')) return;
    const hw = state.homeworks.find(item => item.id === input.dataset.hw);
    const row = hw?.statuses.find(item => item.studentId === input.dataset.student);
    if (row) row.status = input.value;
  });
  document.querySelectorAll('[data-made-up]').forEach(input => {
    const hw = state.homeworks.find(item => item.id === input.dataset.hw);
    const row = hw?.statuses.find(item => item.studentId === input.dataset.student);
    if (row) row.madeUp = input.checked;
  });
}

function bindCommon() {
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    state.view = button.dataset.view; state.message = '';
    if (state.view === 'classes') { state.teacherClassesLoaded = false; loadTeacherClasses(); }
    else if (state.view === 'monitors') loadMonitorRoster();
    else if (state.view === 'records') loadTeacherRecord();
    else if (state.view === 'analysis') loadAnalysisStudents();
    else { state.classAnalysisRows = []; state.classAnalysisTotal = 0; render(); }
  }));
  document.querySelectorAll('.remove-homework').forEach(button => button.addEventListener('click', () => { syncEditor(); state.homeworks = state.homeworks.filter(hw => hw.id !== button.dataset.hw); render(); }));
}

function bindTeacher() {
  if (state.view === 'classes') {
    document.getElementById('teacherClassYear').onchange = event => {
      state.teacherClassYear = event.target.value;
      state.teacherClassesLoaded = false;
      loadTeacherClasses();
    };
    document.querySelectorAll('.teacher-class-save').forEach(button => button.addEventListener('click', async () => {
      const card = button.closest('.teacher-class-card');
      const updates = [...card.querySelectorAll('.teacher-class-made-up')].map(input => ({
        className: input.dataset.class,
        subject: input.dataset.subject,
        date: input.dataset.date,
        studentId: input.dataset.student,
        homeworkId: input.dataset.hwId,
        madeUp: input.checked,
      }));
      if (!updates.length) return;
      button.disabled = true;
      try {
        const result = await api('/teacher-classes/made-up', {
          method: 'PUT',
          body: JSON.stringify({ academicYear: state.teacherClassYear, updates }),
        });
        await loadTeacherClasses();
        setMessage(result.message);
      } catch (error) {
        setMessage(error.message, 'error');
      }
    }));
  } else if (state.view === 'monitors') {
    const reload = () => { filterState.monitors = { academicYear: monitorYear.value, className: monitorClass.value, subject: monitorSubject.value }; loadMonitorRoster(); };
    monitorYear.onchange = reload; monitorClass.onchange = reload; monitorSubject.onchange = reload;
    saveMonitors.onclick = async () => { try { const f = filterState.monitors; const studentIds = [...document.querySelectorAll('.monitor-check:checked')].map(input => input.value); const result = await api('/monitors', { method: 'PUT', body: JSON.stringify({ ...f, studentIds }) }); state.roster = state.roster.map(student => ({ ...student, selected: studentIds.includes(student.id) })); setMessage(result.message); } catch (error) { setMessage(error.message, 'error'); } };
  } else if (state.view === 'records') {
    const reload = () => { filterState.records = { academicYear: recordYear.value, className: recordClass.value, subject: recordSubject.value, date: recordDate.value }; loadTeacherRecord(); };
    recordYear.onchange = reload; recordClass.onchange = reload; recordSubject.onchange = reload; recordDate.onchange = reload;
    document.getElementById('createTeacherRecord')?.addEventListener('click', () => {
      state.homeworks = [emptyHomework(state.roster, 'complete')];
      render();
    });
    document.getElementById('addTeacherHomework')?.addEventListener('click', () => {
      syncEditor();
      state.homeworks.push(emptyHomework(state.roster, 'complete'));
      render();
    });
    document.getElementById('saveRecord')?.addEventListener('click', async () => {
      syncEditor();
      try {
        const result = await api('/records', { method: state.record ? 'PUT' : 'POST', body: JSON.stringify({ ...filterState.records, homeworks: state.homeworks }) });
        state.record = result.record;
        state.homeworks = structuredClone(result.record.homeworks);
        setMessage(result.message);
      } catch (error) { setMessage(error.message, 'error'); }
    });
    // Deleting takes the day away from everyone who might still read it, and there is no undo, so
    // the confirmation names the record rather than asking a bare "are you sure".
    document.getElementById('deleteRecord')?.addEventListener('click', async () => {
      const f = filterState.records;
      if (!window.confirm(t('h.confirmDelete', { className: f.className, subject: subjectName(f.subject), date: f.date }))) return;
      try {
        const query = `academicYear=${encodeURIComponent(f.academicYear)}&className=${f.className}&subject=${f.subject}&date=${f.date}`;
        const result = await api(`/records?${query}`, { method: 'DELETE' });
        state.record = null;
        state.homeworks = [];
        setMessage(result.message);
      } catch (error) { setMessage(error.message, 'error'); }
    });
    document.getElementById('printRecord')?.addEventListener('click', async () => {
      try {
        const f = filterState.records;
        const response = await fetch(`/api/homework/records-pdf?academicYear=${encodeURIComponent(f.academicYear)}&className=${f.className}&subject=${f.subject}&date=${f.date}`, { credentials: 'include' });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || t('h.pdfFailed'));
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = url; link.download = t('h.pdfName', { date: f.date, className: f.className, subject: f.subject }); link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) { setMessage(error.message, 'error'); }
    });
  } else if (state.view === 'analysis') {
    analysisYear.onchange = () => { filterState.analysis.academicYear = analysisYear.value; loadAnalysisStudents(); };
    analysisClass.onchange = () => { filterState.analysis.className = analysisClass.value; loadAnalysisStudents(); };
    analysisStudent.onchange = () => { filterState.analysis.studentId = analysisStudent.value; state.analysisRows = []; render(); };
    runAnalysis.onclick = loadAnalysis;
    document.getElementById('saveAnalysisMadeUp')?.addEventListener('click', async () => {
      const f = filterState.analysis;
      const checkboxes = document.querySelectorAll('.analysis-made-up');
      const updates = [...checkboxes].map(input => ({
        date: input.dataset.date,
        subject: input.dataset.subject,
        homeworkId: input.dataset.hwId,
        madeUp: input.checked,
      }));
      try {
        const result = await api('/analysis/made-up', {
          method: 'PUT',
          body: JSON.stringify({ academicYear: f.academicYear, className: f.className, studentId: f.studentId, updates }),
        });
        setMessage(result.message);
        await loadAnalysis();
      } catch (error) { setMessage(error.message, 'error'); }
    });
  } else {
    classAnalysisYear.onchange = () => {
      filterState.classAnalysis.academicYear = classAnalysisYear.value;
      filterState.classAnalysis.dateFrom = `${classAnalysisYear.value.slice(0, 4)}-09-01`;
      state.classAnalysisRows = [];
      render();
    };
    classAnalysisClass.onchange = () => { filterState.classAnalysis.className = classAnalysisClass.value; state.classAnalysisRows = []; render(); };
    classAnalysisFrom.onchange = () => { filterState.classAnalysis.dateFrom = classAnalysisFrom.value; state.classAnalysisRows = []; render(); };
    classAnalysisTo.onchange = () => { filterState.classAnalysis.dateTo = classAnalysisTo.value; state.classAnalysisRows = []; render(); };
    runClassAnalysis.onclick = loadClassAnalysis;
  }
}

function bindStudent() {
  studentAssignment.onchange = () => { state.studentAssignment = state.meta.assignments.find(item => String(item.id) === studentAssignment.value); loadStudentRecord(); };
  studentDate.onchange = () => { state.studentDate = studentDate.value; loadStudentRecord(); };
  document.getElementById('addHomework')?.addEventListener('click', () => { syncEditor(); state.homeworks.push(emptyHomework(state.roster)); render(); });
  document.getElementById('submitRecord')?.addEventListener('click', async () => {
    syncEditor();
    try { const result = await api('/records', { method: state.record ? 'PUT' : 'POST', body: JSON.stringify({ ...state.studentAssignment, date: state.studentDate, homeworks: state.homeworks }) }); state.record = result.record; state.homeworks = structuredClone(result.record.homeworks); setMessage(result.message); }
    catch (error) { setMessage(error.message, 'error'); }
  });
}

function render() {
  if (!state.meta) return;
  app.innerHTML = state.meta.role === 'teacher'
    ? (state.view === 'classes' ? renderTeacherClasses() : state.view === 'monitors' ? renderMonitors() : state.view === 'records' ? renderRecords() : state.view === 'analysis' ? renderAnalysis() : renderClassAnalysis())
    : renderStudent();
  bindCommon();
  if (state.meta.role === 'teacher') bindTeacher(); else bindStudent();
}

async function boot() {
  try {
    state.meta = await api('/meta');
    if (!state.meta.canAccess) throw new Error(t('h.notMonitor'));
    filterState.monitors.academicYear = filterState.records.academicYear = filterState.analysis.academicYear = filterState.classAnalysis.academicYear = state.meta.currentAcademicYear;
    filterState.classAnalysis.dateFrom = `${state.meta.currentAcademicYear.slice(0, 4)}-09-01`;
    state.teacherClassYear = state.meta.currentAcademicYear;
    if (state.meta.role === 'teacher') await loadMonitorRoster();
    else {
      state.studentAssignment = state.meta.assignments[0]; state.studentDate = today; await loadStudentRecord();
    }
  } catch (error) { app.innerHTML = `<div class="loading"><div><h2>${escapeHtml(t('h.entryFailed'))}</h2><p>${escapeHtml(error.message)}</p><a href="/">${escapeHtml(t('h.backHome'))}</a></div></div>`; }
}
boot();
