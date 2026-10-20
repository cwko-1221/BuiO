import { defaultWeekPeriod, weekEnd } from './report-period.mjs';

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
  const response = await (window.BuiReliable?.request || fetch)(`/api/homework${path}`, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({ success: false, message: t('h.badResponse') }));
  if (!response.ok || !data.success) throw Object.assign(new Error(data.message || t('h.actionFailed')), { status: response.status, data });
  return data;
};
const options = (items, selected, label = value => value, value = item => item) => items.map(item => `<option value="${escapeHtml(value(item))}" ${value(item) === selected ? 'selected' : ''}>${escapeHtml(label(item))}</option>`).join('');
const notice = () => state.readRecovery ? '<div data-homework-read-status></div>' : state.message ? `<div class="notice ${state.messageType}">${escapeHtml(state.message)}</div>` : '';
function setMessage(message, type = 'success') { if (type === 'error' && window.BuiLoading?.notify(message)) return; state.message = message; state.messageType = type; render(); }

const recordResource = scope => '/api/homework/records:' + [scope.academicYear, scope.className, scope.subject, scope.date].join(':');
const editorScope = () => state.meta?.role === 'teacher' ? { ...filterState.records } : { ...state.studentAssignment, date: state.studentDate };
async function restoreDraft(scope, revision) {
  state.localDraft = null;
  const drafts = await window.BuiReliable?.homeworkDrafts().catch(() => []);
  if (revision !== state.recordRequest) return;
  const draft = drafts?.find(row => row.resource === recordResource(scope));
  if (!draft) return;
  const body = JSON.parse(draft.body.value);
  if (!Array.isArray(body.homeworks)) return;
  state.homeworks = body.homeworks.map(homework => ({ ...homework, statuses: state.roster.map(student => ({
    ...(homework.statuses || []).find(row => row.studentId === student.id), studentId: student.id,
  })) }));
  state.localDraft = { errorMessage: draft.errorMessage, conflict: Boolean(state.record) };
}
function draftNotice() {
  if (!state.localDraft) return '';
  const past = state.meta.role !== 'teacher' && state.studentDate !== today;
  const message = past ? t('h.draftPastDate') : t(state.record ? 'h.draftWithSavedRecord' : 'h.draftRestored');
  const comparison = state.record ? `<details class="draft-comparison"><summary>${escapeHtml(t('h.viewSavedRecord'))}</summary>${state.record.homeworks.map(homework => `<h3>${escapeHtml(homework.title)}</h3><div class="table-wrap"><table><thead><tr><th>${escapeHtml(t('h.student'))}</th><th>${escapeHtml(t('h.status'))}</th></tr></thead><tbody>${homework.statuses.map(row => `<tr><td>${escapeHtml(state.roster.find(student => student.id === row.studentId)?.name || row.studentId)}</td><td>${escapeHtml(statusLabels[row.status] || '—')}${row.madeUp ? ` · ${escapeHtml(t('h.madeUp'))}` : ''}</td></tr>`).join('')}</tbody></table></div>`).join('')}</details>` : '';
  return `<div class="notice draft-recovery" role="status">${escapeHtml(message)}${state.localDraft.errorMessage ? `<p>${escapeHtml(state.localDraft.errorMessage)}</p>` : ''}${comparison}</div>`;
}
async function saveEditor() {
  if (state.saving) return;
  syncEditor();
  const blank = state.homeworks.findIndex(homework => !String(homework.title || '').trim());
  if (blank >= 0) return setMessage(t('h.homeworkNameRequired', { n: blank + 1 }), 'error');
  if (state.meta.role !== 'teacher' && studentStatusesIncomplete()) return setMessage(t('h.allStudentsNeedStatus'), 'error');
  const scope = editorScope(), resource = recordResource(scope), revision = state.recordRequest;
  const homeworks = structuredClone(state.homeworks), method = state.record ? 'PUT' : 'POST';
  const body = { ...scope, homeworks, ...(state.record?.version ? { baseVersion: state.record.version } : {}) };
  state.saving = true;
  for (const button of document.querySelectorAll('#submitRecord, #saveRecord')) { button.disabled = true; button.textContent = t('h.saving'); }
  try {
    const result = await api('/records', { method, body: JSON.stringify(body) });
    if (revision !== state.recordRequest || resource !== recordResource(editorScope())) return;
    syncEditor();
    const unchanged = JSON.stringify(state.homeworks) === JSON.stringify(homeworks);
    state.record = result.record;
    state.localDraft = null;
    if (unchanged) state.homeworks = structuredClone(result.record.homeworks);
    state.message = unchanged ? result.message : t('h.savedWithNewEdits'); state.messageType = 'success';
  } catch (error) {
    if (revision !== state.recordRequest || resource !== recordResource(editorScope())) return;
    syncEditor();
    if (error.status === 409) {
      const result = error.data?.record ? error.data : await api('/records?' + new URLSearchParams(scope)).catch(() => null);
      if (revision !== state.recordRequest || resource !== recordResource(editorScope())) return;
      if (result?.record) state.record = result.record;
      state.localDraft = { conflict: true };
      state.message = t('h.recordConflict');
    } else state.message = error.status ? error.message : t('h.saveUnconfirmed');
    state.messageType = 'error';
  } finally { state.saving = false; render(); }
}

function shell(content, { messagePosition = 'top' } = {}) {
  const teacher = state.meta.role === 'teacher';
  const topNotice = messagePosition === 'top' ? notice() : '';
  const bottomNotice = messagePosition === 'bottom' && state.message ? `<div class="student-message-bottom">${notice()}</div>` : '';
  return `<div class="shell ${teacher ? '' : 'student-shell'}">
    <aside class="side">
      <div class="brand"><img src="/math-app/images/logo.png" alt="${escapeHtml(t('h.logoAlt'))}"><div><strong>${escapeHtml(t('h.school'))}</strong><span>LEARNING HUB</span></div></div>
      ${teacher ? `<nav class="nav" aria-label="${escapeHtml(t('h.navAria'))}">
        <button data-view="classes" class="${state.view === 'classes' ? 'active' : ''}">${escapeHtml(t('h.navClasses'))}</button>
        <button data-view="monitors" class="${state.view === 'monitors' ? 'active' : ''}">${escapeHtml(t('h.navMonitors'))}</button>
        <button data-view="records" class="${state.view === 'records' ? 'active' : ''}">${escapeHtml(t('h.navRecords'))}</button>
        <button data-view="analysis" class="${state.view === 'analysis' ? 'active' : ''}">${escapeHtml(t('h.navAnalysis'))}</button>
        <button data-view="class-analysis" class="${state.view === 'class-analysis' ? 'active' : ''}">${escapeHtml(t('h.navClassAnalysis'))}</button>
        <button data-view="summary-export" class="${state.view === 'summary-export' ? 'active' : ''}">${escapeHtml(t('h.navSummaryExport'))}</button>
      </nav>` : ''}
      <a class="back" href="/">${escapeHtml(t('h.back'))}</a>
    </aside>
    <main class="main">
      <header class="top"><div><h1>${escapeHtml(t('h.title'))}</h1><p>${escapeHtml(t(teacher ? 'h.subtitleTeacher' : 'h.subtitleMonitor'))}</p></div><span class="date-chip">${today}</span></header>
      ${topNotice}${content}${bottomNotice}
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
  summaryExport: { academicYear: '', className: 'P4', dateFrom: '', dateTo: today, mode: 'week', week: '6', exportScope: 'all' },
};

async function loadMonitorRoster() {
  const f = filterState.monitors;
  try {
    const [students, monitors] = await Promise.all([
      api(`/students?academicYear=${encodeURIComponent(f.academicYear)}&className=${encodeURIComponent(f.className)}&subject=${encodeURIComponent(f.subject)}`),
      api(`/monitors?academicYear=${encodeURIComponent(f.academicYear)}&className=${encodeURIComponent(f.className)}&subject=${encodeURIComponent(f.subject)}`),
    ]);
    state.roster = students.students.map(student => ({ ...student, selected: monitors.monitors.some(monitor => monitor.studentId === student.id) }));
    state.message = ''; state.readRecovery = null;
  } catch (error) { state.roster = []; state.message = ''; state.readRecovery = { error, retry: loadMonitorRoster }; }
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
  const revision = state.recordRequest = (state.recordRequest || 0) + 1;
  state.localDraft = null;
  state.loadingRecord = true;
  render();
  try {
    const [roster, result] = await Promise.all([
      api(`/roster?academicYear=${encodeURIComponent(f.academicYear)}&className=${f.className}&subject=${f.subject}`),
      api(`/records?academicYear=${encodeURIComponent(f.academicYear)}&className=${f.className}&subject=${f.subject}&date=${f.date}`),
    ]);
    if (revision !== state.recordRequest) return;
    state.roster = roster.students;
    state.record = result.record;
    state.homeworks = result.record?.homeworks ? structuredClone(result.record.homeworks) : [];
    await restoreDraft(f, revision);
    if (revision !== state.recordRequest) return;
    state.message = ''; state.readRecovery = null;
  } catch (error) { if (revision !== state.recordRequest) return; state.record = null; state.homeworks = []; state.message = ''; state.readRecovery = { error, retry: loadTeacherRecord }; }
  state.loadingRecord = false;
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
    state.message = ''; state.readRecovery = null;
  } catch (error) {
    state.teacherClasses = [];
    state.teacherClassesTotal = 0;
    state.teacherClassesLoaded = true;
    state.message = ''; state.readRecovery = { error, retry: loadTeacherClasses };
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
    ${statuses.map(status => `<label><input type="checkbox" name="${escapeHtml(homework.id)}-${escapeHtml(student.id)}" data-hw="${escapeHtml(homework.id)}" data-student="${escapeHtml(student.id)}" value="${status}" ${current === status ? 'checked' : ''}>${statusLabels[status]}</label>`).join('')}
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
  <section class="panel">${state.loadingRecord ? `<div class="loading-inline" role="status">${escapeHtml(t('h.booting'))}</div>` : state.record || editingNewRecord
    ? `${draftNotice()}${editingNewRecord ? `<div class="notice">${escapeHtml(t('h.newRecordNotice'))}</div>` : ''}${homeworkCards({ teacher: true })}<div class="actions" style="margin-top:20px"><button class="button secondary" id="addTeacherHomework">${escapeHtml(t('h.addHomework'))}</button><button class="button primary" id="saveRecord" ${state.saving ? 'disabled' : ''}>${escapeHtml(t(state.saving ? 'h.saving' : editingNewRecord ? 'h.saveRecord' : 'h.saveChanges'))}</button>${state.record ? `<button class="button danger" id="deleteRecord" style="margin-left:auto">${escapeHtml(t('h.deleteRecord'))}</button>` : ''}</div>`
    : `<div class="empty">${escapeHtml(t('h.noRecordForDay'))}<div class="actions empty-actions"><button class="button primary" id="createTeacherRecord">${escapeHtml(t('h.newRecord'))}</button></div></div>`}</section>`);
}

async function loadAnalysisStudents() {
  try {
    const year = encodeURIComponent(filterState.analysis.academicYear);
    const result = await fetch(`/api/stats/teacher/all-users?academicYear=${year}`, { credentials: 'include' }).then(response => response.json());
    state.analysisStudents = (result.students || []).filter(student => student.className === filterState.analysis.className);
    if (!state.analysisStudents.some(student => student.id === filterState.analysis.studentId)) filterState.analysis.studentId = state.analysisStudents[0]?.id || '';
    state.analysisRows = [];
    state.message = ''; state.readRecovery = null;
  } catch (error) { state.analysisStudents = []; state.message = ''; state.readRecovery = { error, retry: loadAnalysisStudents }; }
  render();
}

async function loadAnalysis() {
  const f = filterState.analysis;
  if (!f.studentId) return;
  try {
    const result = await api(`/analysis?academicYear=${encodeURIComponent(f.academicYear)}&className=${f.className}&studentId=${encodeURIComponent(f.studentId)}`);
    state.analysisRows = result.rows;
    state.message = ''; state.readRecovery = null;
  } catch (error) { state.analysisRows = []; state.message = ''; state.readRecovery = { error, retry: loadAnalysis }; }
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
  const f = { ...filterState.classAnalysis };
  const request = state.classAnalysisRequest = (state.classAnalysisRequest || 0) + 1;
  if (!validPeriod(f)) return setMessage(t('h.badPeriod'), 'error');
  try {
    const result = await api(`/class-analysis?academicYear=${encodeURIComponent(f.academicYear)}&className=${f.className}&dateFrom=${f.dateFrom}&dateTo=${f.dateTo}`);
    if (request !== state.classAnalysisRequest || state.view !== 'class-analysis') return;
    state.classAnalysisRows = result.rows;
    state.classAnalysisTotal = result.totalMissing;
    state.message = ''; state.readRecovery = null;
  } catch (error) {
    if (request !== state.classAnalysisRequest || state.view !== 'class-analysis') return;
    state.classAnalysisRows = [];
    state.classAnalysisTotal = 0;
    state.message = ''; state.readRecovery = { error, retry: loadClassAnalysis };
  }
  render();
}

function validPeriod(f) {
  return Boolean(f.dateFrom && f.dateTo && f.dateFrom <= f.dateTo);
}

function resetClassAnalysis() {
  state.classAnalysisRequest = (state.classAnalysisRequest || 0) + 1;
  state.classAnalysisRows = [];
  state.classAnalysisTotal = 0;
  state.message = '';
  state.readRecovery = null;
  render();
}

async function loadSummaryExport() {
  const f = { ...filterState.summaryExport };
  const request = state.summaryExportRequest = (state.summaryExportRequest || 0) + 1;
  if (f.mode !== 'week' || !validPeriod(f)) return;
  try {
    const result = await api(`/class-analysis?academicYear=${encodeURIComponent(f.academicYear)}&className=${f.className}&dateFrom=${f.dateFrom}&dateTo=${f.dateTo}&mode=week&week=${f.week}`);
    if (request !== state.summaryExportRequest || state.view !== 'summary-export') return;
    state.weeklyReport = result;
    state.message = ''; state.readRecovery = null;
  } catch (error) {
    if (request !== state.summaryExportRequest || state.view !== 'summary-export') return;
    state.weeklyReport = null;
    state.message = ''; state.readRecovery = { error, retry: loadSummaryExport };
  }
  render();
}

function resetSummaryExport() {
  state.summaryExportRequest = (state.summaryExportRequest || 0) + 1;
  state.weeklyReport = null;
  state.reportFile = null;
  state.message = '';
  state.readRecovery = null;
  render();
  if (filterState.summaryExport.mode === 'week' && validPeriod(filterState.summaryExport)) loadSummaryExport();
}

async function exportSummary() {
  if (state.exporting || state.uploading) return;
  const f = { ...filterState.summaryExport };
  if (!validPeriod(f)) return setMessage(t('h.badPeriod'), 'error');
  const body = { academicYear: f.academicYear, dateFrom: f.dateFrom, dateTo: f.dateTo, mode: f.mode, week: f.week,
    scope: f.mode === 'week' || f.exportScope === 'all' ? 'all' : f.className };
  state.exporting = true;
  state.message = '';
  render();
  try {
    const response = await fetch('/api/homework/class-analysis/export', { method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || t('h.exportFailed'));
    const url = URL.createObjectURL(await response.blob());
    const encodedName = response.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const link = document.createElement('a');
    link.href = url;
    link.download = encodedName ? decodeURIComponent(encodedName) : 'homework.xlsx';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    if (f.mode === 'week') await loadSummaryExport();
    state.message = t('h.exportSuccess');
    state.messageType = 'success';
  } catch (error) {
    state.message = error.message;
    state.messageType = 'error';
  } finally {
    state.exporting = false;
    render();
  }
}

async function uploadWeeklyReport() {
  if (state.uploading || state.exporting || !state.reportFile || !state.weeklyReport) return;
  const f = { ...filterState.summaryExport };
  const body = new FormData();
  for (const key of ['academicYear', 'week', 'dateFrom', 'dateTo']) body.append(key, f[key]);
  body.append('revision', state.weeklyReport.revision);
  body.append('workbook', state.reportFile);
  state.uploading = true;
  render();
  try {
    const response = await fetch('/api/homework/class-analysis/report-upload', { method: 'POST', credentials: 'include', body });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || t('h.actionFailed'));
    state.reportFile = null;
    await loadSummaryExport();
    state.message = t('h.reportUploadSuccess');
    state.messageType = 'success';
  } catch (error) { state.message = error.message; state.messageType = 'error'; }
  finally { state.uploading = false; render(); }
}

function renderClassAnalysis() {
  const f = filterState.classAnalysis;
  const rows = state.classAnalysisRows || [];
  const studentCards = rows.map(row => {
    const records = row.missingRecords || [];
    const details = records.length ? `<div class="class-analysis-record-list">
      <div class="class-analysis-record-row class-analysis-record-heading"><span>${escapeHtml(t('h.date'))}</span><span>${escapeHtml(t('h.subject'))}</span><span>${escapeHtml(t('h.colHomework'))}</span><span>${escapeHtml(t('h.status'))}</span></div>
      ${records.map(record => `<div class="class-analysis-record-row">
        <span>${escapeHtml(record.date)}</span>
        <span>${escapeHtml(record.subjectName || subjectName(record.subject))}</span>
        <span>${escapeHtml(record.homework)}</span>
        <span class="class-analysis-record-status"><span class="status-tag missing">${escapeHtml(t('h.statusMissing'))}</span>${record.madeUp ? `<span class="status-tag made-up">${escapeHtml(t('h.madeUp'))}</span>` : ''}</span>
      </div>`).join('')}
    </div>` : `<div class="class-analysis-empty">${escapeHtml(t('h.classAnalysisNoMissing'))}</div>`;
    return `<details class="class-analysis-student">
      <summary><span class="class-analysis-student-name"><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.id)}</small></span><span class="class-analysis-student-count">${escapeHtml(t('h.missingCount'))}：<strong>${row.missingCount}</strong></span></summary>
      ${details}
    </details>`;
  }).join('');
  return shell(`<section class="panel">
    <div class="panel-head"><div><h2>${escapeHtml(t('h.classAnalysisTitle'))}</h2><p class="hint">${escapeHtml(t('h.classAnalysisHint'))}</p></div></div>
    <div class="filters">
      <div class="field"><label for="classAnalysisYear">${escapeHtml(t('h.year'))}</label><select id="classAnalysisYear">${options(state.meta.academicYears, f.academicYear)}</select></div>
      <div class="field"><label for="classAnalysisClass">${escapeHtml(t('h.class'))}</label><select id="classAnalysisClass">${options(grades, f.className)}</select></div>
      <div class="field"><label for="classAnalysisFrom">${escapeHtml(t('h.from'))}</label><input id="classAnalysisFrom" type="date" value="${f.dateFrom}"></div>
      <div class="field"><label for="classAnalysisTo">${escapeHtml(t('h.to'))}</label><input id="classAnalysisTo" type="date" value="${f.dateTo}"></div>
    </div>
    <div class="actions" style="margin-top:16px"><button class="button primary" id="runClassAnalysis" ${!validPeriod(f) ? 'disabled' : ''}>${escapeHtml(t('h.showClassStats'))}</button></div>
  </section>
  <section class="panel">${rows.length ? `<div class="analysis-total">${t('h.classTotal', { count: state.classAnalysisTotal || 0 })}</div><div class="class-analysis-students">${studentCards}</div>` : `<div class="empty" style="margin-top:20px">${escapeHtml(t('h.pickPeriod'))}</div>`}</section>`);
}

function renderSummaryExport() {
  const f = filterState.summaryExport;
  const weekly = f.mode === 'week';
  const report = state.weeklyReport;
  const latest = report?.versions?.[0];
  const busy = state.exporting || state.uploading;
  return shell(`<section class="panel">
    <div class="panel-head"><div><h2>${escapeHtml(t('h.navSummaryExport'))}</h2><p class="hint">${escapeHtml(t('h.summaryExportHint'))}</p></div></div>
    <div class="filters three">
      <div class="field"><label for="summaryExportYear">${escapeHtml(t('h.year'))}</label><select id="summaryExportYear" ${busy ? 'disabled' : ''}>${options(state.meta.academicYears, f.academicYear)}</select></div>
      <div class="field"><label for="summaryExportMode">${escapeHtml(t('h.periodMode'))}</label><select id="summaryExportMode" ${busy ? 'disabled' : ''}>${options(['week', 'custom'], f.mode, mode => t(mode === 'week' ? 'h.byWeek' : 'h.customPeriod'))}</select></div>
      ${weekly ? `<div class="field"><label for="summaryExportWeek">${escapeHtml(t('h.week'))}</label><select id="summaryExportWeek" ${busy ? 'disabled' : ''}>${options(Array.from({ length: 48 }, (_, index) => String(index + 6)), f.week, week => `Week ${week}`)}</select></div>` : '<div></div>'}
      <div class="field"><label for="summaryExportFrom">${escapeHtml(t(weekly ? 'h.cumulativeFrom' : 'h.from'))}</label><input id="summaryExportFrom" type="date" value="${f.dateFrom}" ${weekly ? 'readonly' : ''} ${busy ? 'disabled' : ''}></div>
      <div class="field"><label for="summaryExportTo">${escapeHtml(t('h.to'))}</label><input id="summaryExportTo" type="date" value="${f.dateTo}" ${weekly ? 'readonly' : ''} ${busy ? 'disabled' : ''}></div>
    </div>
    ${weekly ? `<p class="hint">${escapeHtml(t('h.weekHint'))}</p>` : `<div class="homework-export-settings">
      <div class="field"><label for="summaryExportScope">${escapeHtml(t('h.exportScope'))}</label><select id="summaryExportScope" ${busy ? 'disabled' : ''}>${options(['all', 'class'], f.exportScope, scope => t(scope === 'all' ? 'h.exportAllClasses' : 'h.exportSingleClass'))}</select></div>
      ${f.exportScope === 'class' ? `<div class="field"><label for="summaryExportClass">${escapeHtml(t('h.class'))}</label><select id="summaryExportClass" ${busy ? 'disabled' : ''}>${options(grades, f.className)}</select></div>` : ''}
    </div>`}
    <p class="hint">${escapeHtml(t(weekly ? 'h.weeklyExportHint' : 'h.exportHint'))}</p>
    ${weekly && report ? `<p class="report-version">${escapeHtml(t('h.reportBaseVersion', { week: report.baselineWeek }))}${latest ? ` · ${escapeHtml(t('h.reportLatestVersion', { week: latest.week, kind: t(latest.kind === 'uploaded' ? 'h.reportUploaded' : 'h.reportGenerated') }))}` : ''}</p>` : ''}
    <div class="actions" style="margin-top:16px"><button class="button primary" id="exportSummary" ${busy || !validPeriod(f) ? 'disabled' : ''}>${escapeHtml(t(state.exporting ? 'h.exporting' : weekly ? Number(f.week) === 6 ? 'h.downloadBaseline' : 'h.generateWeekly' : 'h.exportExcel'))}</button></div>
  </section>
  ${weekly && Number(f.week) >= 7 ? `<section class="panel"><div class="panel-head"><h2>${escapeHtml(t('h.reportUploadLabel', { week: f.week }))}</h2></div><div class="report-upload"><div class="field"><label for="weeklyReportFile">${escapeHtml(t('h.reportFile'))}</label><input id="weeklyReportFile" type="file" accept=".xlsx" ${busy ? 'disabled' : ''}>${state.reportFile ? `<small>${escapeHtml(state.reportFile.name)}</small>` : ''}</div><button class="button secondary" id="uploadWeeklyReport" ${!state.reportFile || !report || busy ? 'disabled' : ''}>${escapeHtml(t(state.uploading ? 'h.reportUploading' : 'h.reportUpload'))}</button><p class="hint">${escapeHtml(t('h.reportUploadHint'))}</p></div></section>` : ''}`);
}

function emptyHomework(roster, defaultStatus = '') {
  return { id: crypto.randomUUID(), title: '', statuses: roster.map(student => ({ studentId: student.id, status: defaultStatus, madeUp: false })) };
}

async function loadStudentRecord() {
  const assignment = state.studentAssignment;
  if (!assignment) return;
  const scope = { ...assignment, date: state.studentDate };
  const revision = state.recordRequest = (state.recordRequest || 0) + 1;
  state.localDraft = null;
  state.loadingRecord = true;
  render();
  try {
    const query = `academicYear=${encodeURIComponent(assignment.academicYear)}&className=${assignment.className}&subject=${assignment.subject}`;
    const [roster, result] = await Promise.all([api(`/roster?${query}`), api(`/records?${query}&date=${state.studentDate}`)]);
    if (revision !== state.recordRequest) return;
    state.roster = roster.students;
    state.record = result.record;
    state.homeworks = result.record?.homeworks ? structuredClone(result.record.homeworks) : (state.studentDate === today ? [emptyHomework(roster.students)] : []);
    await restoreDraft(scope, revision);
    if (revision !== state.recordRequest) return;
    state.message = ''; state.readRecovery = null;
  } catch (error) { if (revision !== state.recordRequest) return; state.record = null; state.homeworks = []; state.message = ''; state.readRecovery = { error, retry: loadStudentRecord }; }
  state.loadingRecord = false;
  render();
}

function renderStudent() {
  const assignment = state.studentAssignment;
  const locked = state.studentDate !== today;
  return shell(`<section class="panel">
    <div class="panel-head"><div><h2>${escapeHtml(t('h.monitorTitle'))}</h2><p class="hint">${escapeHtml(t('h.monitorHint'))}</p></div>${assignment ? `<span class="assignment">${assignment.className} · ${escapeHtml(subjectName(assignment.subject))}</span>` : ''}</div>
    <div class="filters three">
      <div class="field"><label for="studentAssignment">${escapeHtml(t('h.mySubject'))}</label><select id="studentAssignment">${options(state.meta.assignments, String(assignment?.id ?? ''), item => `${item.className} · ${subjectName(item.subject)}`, item => String(item.id))}</select></div>
      <div class="field"><label for="studentDate">${escapeHtml(t('h.date'))}</label><input id="studentDate" type="date" value="${state.studentDate}" max="${today}"></div><div></div>
    </div>
    ${locked ? `<div class="notice" style="margin-top:18px">${escapeHtml(t('h.lockedNotice'))}</div>` : state.record && !state.localDraft && !state.loadingRecord ? `<div class="notice" style="margin-top:18px">${escapeHtml(t('h.savedNotice'))}</div>` : ''}
  </section>
  <section class="panel">${state.loadingRecord ? `<div class="loading-inline" role="status">${escapeHtml(t('h.booting'))}</div>` : `${draftNotice()}${state.homeworks.length ? `${homeworkCards({ locked })}<div class="actions" style="margin-top:20px">${!locked ? `<button class="button secondary" id="addHomework">${escapeHtml(t('h.addHomework'))}</button><button class="button primary" id="submitRecord" ${state.saving ? 'disabled' : ''}>${escapeHtml(t(state.saving ? 'h.saving' : state.record ? 'h.saveChanges' : 'h.saveShort'))}</button>` : ''}</div>` : `<div class="empty">${escapeHtml(t('h.noRecordDate'))}</div>`}`}</section>`, { messagePosition: 'bottom' });
}

function syncEditor() {
  document.querySelectorAll('.homework-name').forEach(input => { const hw = state.homeworks.find(item => item.id === input.dataset.hw); if (hw) hw.title = input.value; });
  const statusInputs = [...document.querySelectorAll('.status-options input:not([data-made-up])')];
  const statusGroups = new Map();
  statusInputs.forEach(input => {
    const key = `${input.dataset.hw}:${input.dataset.student}`;
    if (!statusGroups.has(key)) statusGroups.set(key, []);
    statusGroups.get(key).push(input);
  });
  statusGroups.forEach(inputs => {
    const selected = inputs.find(input => input.checked);
    const input = inputs[0];
    const hw = state.homeworks.find(item => item.id === input.dataset.hw);
    const row = hw?.statuses.find(item => item.studentId === input.dataset.student);
    if (row) row.status = selected?.value || '';
  });
  document.querySelectorAll('[data-made-up]').forEach(input => {
    const hw = state.homeworks.find(item => item.id === input.dataset.hw);
    const row = hw?.statuses.find(item => item.studentId === input.dataset.student);
    if (row) row.madeUp = input.checked;
  });
}

function studentStatusesIncomplete() {
  return state.homeworks.some(homework => state.roster.some(student => {
    const row = homework.statuses.find(item => item.studentId === student.id);
    return !row?.status;
  }));
}

function bindCommon() {
  document.querySelectorAll('[data-view]').forEach(button => {
    button.disabled = Boolean(state.exporting || state.uploading);
    button.addEventListener('click', () => {
      state.classAnalysisRequest = (state.classAnalysisRequest || 0) + 1;
      state.summaryExportRequest = (state.summaryExportRequest || 0) + 1;
      state.view = button.dataset.view; state.message = ''; state.readRecovery = null;
      if (state.view === 'classes') { state.teacherClassesLoaded = false; loadTeacherClasses(); }
      else if (state.view === 'monitors') loadMonitorRoster();
      else if (state.view === 'records') loadTeacherRecord();
      else if (state.view === 'analysis') loadAnalysisStudents();
      else if (state.view === 'class-analysis') resetClassAnalysis();
      else if (state.view === 'summary-export') resetSummaryExport();
    });
  });
  document.querySelectorAll('.status-options input:not([data-made-up])').forEach(input => input.addEventListener('change', () => {
    if (input.checked) {
      document.querySelectorAll('.status-options input:not([data-made-up])').forEach(other => {
        if (other !== input && other.dataset.hw === input.dataset.hw && other.dataset.student === input.dataset.student) other.checked = false;
      });
    }
    syncEditor();
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
    document.getElementById('saveRecord')?.addEventListener('click', saveEditor);
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
  } else if (state.view === 'class-analysis') {
    classAnalysisYear.onchange = () => {
      filterState.classAnalysis.academicYear = classAnalysisYear.value;
      filterState.classAnalysis.dateFrom = `${classAnalysisYear.value.slice(0, 4)}-09-01`;
      resetClassAnalysis();
    };
    classAnalysisClass.onchange = () => { filterState.classAnalysis.className = classAnalysisClass.value; resetClassAnalysis(); };
    classAnalysisFrom.onchange = () => { filterState.classAnalysis.dateFrom = classAnalysisFrom.value; resetClassAnalysis(); };
    classAnalysisTo.onchange = () => { filterState.classAnalysis.dateTo = classAnalysisTo.value; resetClassAnalysis(); };
    runClassAnalysis.onclick = loadClassAnalysis;
  } else if (state.view === 'summary-export') {
    const f = filterState.summaryExport;
    summaryExportYear.onchange = () => {
      f.academicYear = summaryExportYear.value;
      if (f.mode === 'week') Object.assign(f, defaultWeekPeriod(f.academicYear, today));
      else f.dateFrom = `${f.academicYear.slice(0, 4)}-09-01`;
      resetSummaryExport();
    };
    summaryExportMode.onchange = () => {
      f.mode = summaryExportMode.value;
      if (f.mode === 'week') {
        f.dateFrom = defaultWeekPeriod(f.academicYear, today).dateFrom;
        f.dateTo = weekEnd(f.dateFrom, f.week);
      }
      resetSummaryExport();
    };
    document.getElementById('summaryExportWeek')?.addEventListener('change', event => {
      f.week = event.target.value;
      f.dateTo = weekEnd(f.dateFrom, f.week);
      resetSummaryExport();
    });
    summaryExportFrom.onchange = () => { f.dateFrom = summaryExportFrom.value; resetSummaryExport(); };
    summaryExportTo.onchange = () => { f.dateTo = summaryExportTo.value; resetSummaryExport(); };
    document.getElementById('summaryExportScope')?.addEventListener('change', event => {
      f.exportScope = event.target.value;
      resetSummaryExport();
    });
    document.getElementById('summaryExportClass')?.addEventListener('change', event => {
      f.className = event.target.value;
      resetSummaryExport();
    });
    document.getElementById('exportSummary').onclick = exportSummary;
    document.getElementById('weeklyReportFile')?.addEventListener('change', event => {
      const file = event.target.files[0];
      if (file && (!/\.xlsx$/i.test(file.name) || file.size > 8 * 1024 * 1024)) return setMessage(t('h.reportBadFile'), 'error');
      state.reportFile = file || null;
      render();
    });
    document.getElementById('uploadWeeklyReport')?.addEventListener('click', uploadWeeklyReport);
  }
}

function bindStudent() {
  studentAssignment.onchange = () => { state.studentAssignment = state.meta.assignments.find(item => String(item.id) === studentAssignment.value); loadStudentRecord(); };
  studentDate.onchange = () => { state.studentDate = studentDate.value; loadStudentRecord(); };
  document.getElementById('addHomework')?.addEventListener('click', () => { syncEditor(); state.homeworks.push(emptyHomework(state.roster)); render(); });
  document.getElementById('submitRecord')?.addEventListener('click', saveEditor);
}

function render() {
  if (!state.meta) return;
  app.innerHTML = state.meta.role === 'teacher'
    ? (state.view === 'classes' ? renderTeacherClasses() : state.view === 'monitors' ? renderMonitors() : state.view === 'records' ? renderRecords() : state.view === 'analysis' ? renderAnalysis() : state.view === 'summary-export' ? renderSummaryExport() : renderClassAnalysis())
    : renderStudent();
  bindCommon();
  if (state.meta.role === 'teacher') bindTeacher(); else bindStudent();
  if (state.readRecovery) window.BuiLoading.recover(state.readRecovery.error, state.readRecovery.retry, document.querySelector('[data-homework-read-status]'));
}

async function boot() {
  try {
    const [session, meta] = await Promise.all([
      fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }).then(response => response.json()), api('/meta'),
    ]);
    if (session.student?.id) window.BuiReliable?.remember(session.student.id);
    state.meta = meta;
    if (!state.meta.canAccess) throw new Error(t('h.notMonitor'));
    filterState.monitors.academicYear = filterState.records.academicYear = filterState.analysis.academicYear = filterState.classAnalysis.academicYear = state.meta.currentAcademicYear;
    filterState.classAnalysis.dateFrom = `${state.meta.currentAcademicYear.slice(0, 4)}-09-01`;
    filterState.summaryExport.academicYear = state.meta.currentAcademicYear;
    Object.assign(filterState.summaryExport, defaultWeekPeriod(state.meta.currentAcademicYear, today));
    state.teacherClassYear = state.meta.currentAcademicYear;
    const drafts = await window.BuiReliable?.homeworkDrafts().catch(() => []) || [];
    const requested = new URLSearchParams(location.search).get('draft');
    const preferred = drafts.find(draft => draft.resource === requested) || drafts.find(draft => draft.blocked) || drafts[0];
    const draftScope = preferred ? JSON.parse(preferred.body.value) : null;
    if (state.meta.role === 'teacher') {
      if (draftScope) {
        filterState.records = { academicYear: draftScope.academicYear, className: draftScope.className, subject: draftScope.subject, date: draftScope.date };
        state.view = 'records'; await loadTeacherRecord();
      } else await loadMonitorRoster();
    }
    else {
      state.studentAssignment = state.meta.assignments.find(item => draftScope && recordResource({ ...item, date: draftScope.date }) === preferred.resource) || state.meta.assignments[0];
      state.studentDate = draftScope && state.studentAssignment && recordResource({ ...state.studentAssignment, date: draftScope.date }) === preferred.resource ? draftScope.date : today;
      await loadStudentRecord();
    }
    // Recovery must not hold the whole module behind a network timeout.
    window.BuiReliable?.resume().catch(() => {});
  } catch (error) { window.BuiLoading.recover(error, undefined, app); }
}
window.addEventListener('buio:homework-synced', event => {
  if (!state.meta || state.saving || state.loadingRecord || (state.meta.role === 'teacher' && state.view !== 'records')) return;
  if (event.detail.resource !== recordResource(editorScope())) return;
  syncEditor();
  state.record = event.detail.result.record;
  if (JSON.stringify(state.homeworks) === JSON.stringify(event.detail.body.homeworks)) {
    state.localDraft = null; state.message = event.detail.result.message; state.messageType = 'success';
  }
  render();
});
boot();
