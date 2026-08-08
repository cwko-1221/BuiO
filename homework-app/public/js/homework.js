const app = document.getElementById('app');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const statusLabels = { complete: '完成', missing: '欠交', absent: 'Absent', made_up: '已補做' };
const grades = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
const state = { meta: null, view: 'monitors', roster: [], record: null, homeworks: [], message: '', messageType: '' };

const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const subjectName = id => state.meta?.subjects.find(subject => subject.id === id)?.name || id;
const subjectsFor = grade => state.meta.subjects.filter(subject => !subject.grades || subject.grades.includes(grade));
const api = async (path, options = {}) => {
  const response = await fetch(`/api/homework${path}`, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({ success: false, message: '伺服器回應不正確' }));
  if (!response.ok || !data.success) throw Object.assign(new Error(data.message || '操作失敗'), { status: response.status });
  return data;
};
const options = (items, selected, label = value => value, value = item => item) => items.map(item => `<option value="${escapeHtml(value(item))}" ${value(item) === selected ? 'selected' : ''}>${escapeHtml(label(item))}</option>`).join('');
const notice = () => state.message ? `<div class="notice ${state.messageType}">${escapeHtml(state.message)}</div>` : '';
function setMessage(message, type = 'success') { state.message = message; state.messageType = type; render(); }

function shell(content) {
  const teacher = state.meta.role === 'teacher';
  return `<div class="shell ${teacher ? '' : 'student-shell'}">
    <aside class="side">
      <div class="brand"><img src="/math-app/images/logo.png" alt="校徽"><div><strong>杯澳公立學校</strong><span>LEARNING HUB</span></div></div>
      ${teacher ? `<nav class="nav" aria-label="欠交功課功能">
        <button data-view="monitors" class="${state.view === 'monitors' ? 'active' : ''}">設定科長</button>
        <button data-view="records" class="${state.view === 'records' ? 'active' : ''}">欠交功課記錄</button>
        <button data-view="analysis" class="${state.view === 'analysis' ? 'active' : ''}">學生分析</button>
      </nav>` : ''}
      <a class="back" href="/">← 返回平台主頁</a>
    </aside>
    <main class="main">
      <header class="top"><div><h1>欠交功課</h1><p>${teacher ? '教師管理與學生跟進' : '科長填報'}</p></div><span class="date-chip">${today}</span></header>
      ${notice()}${content}
    </main>
  </div>`;
}

function filterHtml(prefix, values, includeDate = false) {
  const subjects = subjectsFor(values.className);
  if (!subjects.some(item => item.id === values.subject)) values.subject = subjects[0]?.id || '';
  return `<div class="filters">
    <div class="field"><label for="${prefix}Year">學年</label><select id="${prefix}Year">${options(state.meta.academicYears, values.academicYear)}</select></div>
    <div class="field"><label for="${prefix}Class">班別</label><select id="${prefix}Class">${options(grades, values.className)}</select></div>
    <div class="field"><label for="${prefix}Subject">科目</label><select id="${prefix}Subject">${options(subjects, values.subject, item => item.name, item => item.id)}</select></div>
    ${includeDate ? `<div class="field"><label for="${prefix}Date">日期</label><input id="${prefix}Date" type="date" value="${values.date}" max="${today}"></div>` : '<div></div>'}
  </div>`;
}

const filterState = {
  monitors: { academicYear: '', className: 'P4', subject: 'chinese-a' },
  records: { academicYear: '', className: 'P4', subject: 'chinese-a', date: today },
  analysis: { academicYear: '', className: 'P4', studentId: '' },
};

async function loadMonitorRoster() {
  const f = filterState.monitors;
  try {
    const [students, monitors] = await Promise.all([
      api(`/students?className=${encodeURIComponent(f.className)}&subject=${encodeURIComponent(f.subject)}`),
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
    <div class="panel-head"><div><h2>設定科長</h2><p class="hint">每科可選多於一位科長；名單只會顯示所選班別及 A／B 組學生。</p></div></div>
    ${filterHtml('monitor', f)}
    <div class="student-list">${state.roster.length ? state.roster.map(student => `<label class="student-check">
      <input type="checkbox" class="monitor-check" value="${escapeHtml(student.id)}" ${student.selected ? 'checked' : ''}>
      <span><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.id)} · ${student.classNo ? student.classNo + '號' : '未設班號'}</small></span>
    </label>`).join('') : '<div class="empty">這個班別／組別暫時沒有學生。</div>'}</div>
    <div class="actions" style="margin-top:20px"><button class="button primary" id="saveMonitors">儲存科長設定</button></div>
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

function statusControls(homework, student, teacher = false, locked = false) {
  const current = homework.statuses.find(item => item.studentId === student.id)?.status || '';
  const statuses = teacher ? ['complete', 'missing', 'absent', 'made_up'] : ['complete', 'missing', 'absent'];
  if (locked) return `<span class="status-tag ${current}">${statusLabels[current] || '—'}</span>`;
  return `<div class="status-options">${statuses.map(status => `<label><input type="radio" name="${escapeHtml(homework.id)}-${escapeHtml(student.id)}" data-hw="${escapeHtml(homework.id)}" data-student="${escapeHtml(student.id)}" value="${status}" ${current === status ? 'checked' : ''}>${statusLabels[status]}</label>`).join('')}</div>`;
}

function homeworkCards({ teacher = false, locked = false } = {}) {
  return state.homeworks.map((homework, index) => `<article class="homework-card">
    <div class="homework-title"><div><strong>功課 ${index + 1}</strong><input class="title-input homework-name" data-hw="${escapeHtml(homework.id)}" value="${escapeHtml(homework.title)}" ${locked ? 'disabled' : ''} aria-label="功課名稱"></div>${!locked && state.homeworks.length > 1 ? `<button class="button danger remove-homework" data-hw="${escapeHtml(homework.id)}">移除</button>` : ''}</div>
    <table class="status-table"><thead><tr><th>學生</th><th>班號</th><th>狀態</th></tr></thead><tbody>${state.roster.map(student => `<tr><td>${escapeHtml(student.name)} <small>${escapeHtml(student.id)}</small></td><td>${student.classNo || '—'}</td><td>${statusControls(homework, student, teacher, locked)}</td></tr>`).join('')}</tbody></table>
  </article>`).join('');
}

function renderRecords() {
  const f = filterState.records;
  return shell(`<section class="panel">
    <div class="panel-head"><div><h2>欠交功課記錄</h2><p class="hint">老師可檢視及修改任何已提交記錄，並把欠交更新為「已補做」。</p></div><div class="actions"><button class="button secondary" id="printRecord" ${!state.record ? 'disabled' : ''}>下載 PDF</button></div></div>
    ${filterHtml('record', f, true)}
  </section>
  <section class="panel">${state.record ? `${homeworkCards({ teacher: true })}<div class="actions" style="margin-top:20px"><button class="button primary" id="saveRecord">儲存修改</button></div>` : '<div class="empty">所選日期暫時沒有科長提交的記錄。</div>'}</section>`);
}

async function loadAnalysisStudents() {
  try {
    const result = await fetch('/api/stats/teacher/students', { credentials: 'include' }).then(response => response.json());
    state.analysisStudents = (result.students || []).filter(student => student.className === filterState.analysis.className);
    if (!state.analysisStudents.some(student => student.id === filterState.analysis.studentId)) filterState.analysis.studentId = state.analysisStudents[0]?.id || '';
    state.analysisRows = [];
    state.message = '';
  } catch (error) { state.analysisStudents = []; state.message = '未能讀取學生名單'; state.messageType = 'error'; }
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
  return shell(`<section class="panel"><div class="panel-head"><div><h2>學生分析</h2><p class="hint">按學年及年級查看學生所有曾欠交的功課；「已補做」會保留作歷史記錄。</p></div></div>
    <div class="filters three">
      <div class="field"><label for="analysisYear">學年</label><select id="analysisYear">${options(state.meta.academicYears, f.academicYear)}</select></div>
      <div class="field"><label for="analysisClass">年級</label><select id="analysisClass">${options(grades, f.className)}</select></div>
      <div class="field"><label for="analysisStudent">學生</label><select id="analysisStudent">${options(students, f.studentId, item => `${item.name} (${item.id})`, item => item.id)}</select></div>
    </div>
    <div class="actions" style="margin-top:16px"><button class="button primary" id="runAnalysis" ${!f.studentId ? 'disabled' : ''}>顯示欠交總表</button></div>
    ${rows.length ? `<table class="analysis-table"><thead><tr><th>日期</th><th>科目</th><th>功課</th><th>狀態</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row.date}</td><td>${escapeHtml(subjectName(row.subject))}</td><td>${escapeHtml(row.homework)}</td><td><span class="status-tag ${row.status}">${statusLabels[row.status]}</span></td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="margin-top:20px">沒有欠交記錄，或請按「顯示欠交總表」。</div>'}
  </section>`);
}

function emptyHomework(roster) {
  return { id: crypto.randomUUID(), title: '', statuses: roster.map(student => ({ studentId: student.id, status: '' })) };
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
  const locked = Boolean(state.record) || state.studentDate !== today;
  return shell(`<section class="panel">
    <div class="panel-head"><div><h2>科長填報</h2><p class="hint">今天可新增及儲存功課；過去日期只供查閱，儲存後亦不可再更改。</p></div>${assignment ? `<span class="assignment">${assignment.className} · ${escapeHtml(subjectName(assignment.subject))}</span>` : ''}</div>
    <div class="filters three">
      <div class="field"><label for="studentAssignment">負責科目</label><select id="studentAssignment">${options(state.meta.assignments, assignment?.id, item => `${item.className} · ${subjectName(item.subject)}`, item => String(item.id))}</select></div>
      <div class="field"><label for="studentDate">日期</label><input id="studentDate" type="date" value="${state.studentDate}" max="${today}"></div><div></div>
    </div>
    ${locked ? `<div class="notice" style="margin-top:18px">${state.record ? '這份記錄已儲存，科長只能查閱。' : '過去日期沒有記錄；科長不能補填或修改。'}</div>` : ''}
  </section>
  <section class="panel">${state.homeworks.length ? `${homeworkCards({ locked })}<div class="actions" style="margin-top:20px">${!locked ? '<button class="button secondary" id="addHomework">＋ 新增功課</button><button class="button primary" id="submitRecord">儲存</button>' : ''}</div>` : '<div class="empty">所選日期沒有欠交功課記錄。</div>'}</section>`);
}

function syncEditor() {
  document.querySelectorAll('.homework-name').forEach(input => { const hw = state.homeworks.find(item => item.id === input.dataset.hw); if (hw) hw.title = input.value; });
  document.querySelectorAll('.status-options input:checked').forEach(input => {
    const hw = state.homeworks.find(item => item.id === input.dataset.hw);
    const row = hw?.statuses.find(item => item.studentId === input.dataset.student);
    if (row) row.status = input.value;
  });
}

function bindCommon() {
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    state.view = button.dataset.view; state.message = '';
    if (state.view === 'monitors') loadMonitorRoster(); else if (state.view === 'records') loadTeacherRecord(); else loadAnalysisStudents();
  }));
  document.querySelectorAll('.remove-homework').forEach(button => button.addEventListener('click', () => { syncEditor(); state.homeworks = state.homeworks.filter(hw => hw.id !== button.dataset.hw); render(); }));
}

function bindTeacher() {
  if (state.view === 'monitors') {
    const reload = () => { filterState.monitors = { academicYear: monitorYear.value, className: monitorClass.value, subject: monitorSubject.value }; loadMonitorRoster(); };
    monitorYear.onchange = reload; monitorClass.onchange = reload; monitorSubject.onchange = reload;
    saveMonitors.onclick = async () => { try { const f = filterState.monitors; const studentIds = [...document.querySelectorAll('.monitor-check:checked')].map(input => input.value); const result = await api('/monitors', { method: 'PUT', body: JSON.stringify({ ...f, studentIds }) }); setMessage(result.message); } catch (error) { setMessage(error.message, 'error'); } };
  } else if (state.view === 'records') {
    const reload = () => { filterState.records = { academicYear: recordYear.value, className: recordClass.value, subject: recordSubject.value, date: recordDate.value }; loadTeacherRecord(); };
    recordYear.onchange = reload; recordClass.onchange = reload; recordSubject.onchange = reload; recordDate.onchange = reload;
    document.getElementById('saveRecord')?.addEventListener('click', async () => { syncEditor(); try { const result = await api('/records', { method: 'PUT', body: JSON.stringify({ ...filterState.records, homeworks: state.homeworks }) }); state.record = result.record; setMessage(result.message); } catch (error) { setMessage(error.message, 'error'); } });
    document.getElementById('printRecord')?.addEventListener('click', async () => {
      try {
        const f = filterState.records;
        const response = await fetch(`/api/homework/records-pdf?academicYear=${encodeURIComponent(f.academicYear)}&className=${f.className}&subject=${f.subject}&date=${f.date}`, { credentials: 'include' });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || '未能下載 PDF');
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = url; link.download = `欠交功課_${f.date}_${f.className}_${f.subject}.pdf`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) { setMessage(error.message, 'error'); }
    });
  } else {
    analysisYear.onchange = () => { filterState.analysis.academicYear = analysisYear.value; state.analysisRows = []; render(); };
    analysisClass.onchange = () => { filterState.analysis.className = analysisClass.value; loadAnalysisStudents(); };
    analysisStudent.onchange = () => { filterState.analysis.studentId = analysisStudent.value; state.analysisRows = []; render(); };
    runAnalysis.onclick = loadAnalysis;
  }
}

function bindStudent() {
  studentAssignment.onchange = () => { state.studentAssignment = state.meta.assignments.find(item => String(item.id) === studentAssignment.value); loadStudentRecord(); };
  studentDate.onchange = () => { state.studentDate = studentDate.value; loadStudentRecord(); };
  document.getElementById('addHomework')?.addEventListener('click', () => { syncEditor(); state.homeworks.push(emptyHomework(state.roster)); render(); });
  document.getElementById('submitRecord')?.addEventListener('click', async () => {
    syncEditor();
    try { const result = await api('/records', { method: 'POST', body: JSON.stringify({ ...state.studentAssignment, date: state.studentDate, homeworks: state.homeworks }) }); state.record = result.record; state.homeworks = structuredClone(result.record.homeworks); setMessage(result.message); }
    catch (error) { setMessage(error.message, 'error'); }
  });
}

function render() {
  if (!state.meta) return;
  app.innerHTML = state.meta.role === 'teacher' ? (state.view === 'monitors' ? renderMonitors() : state.view === 'records' ? renderRecords() : renderAnalysis()) : renderStudent();
  bindCommon();
  if (state.meta.role === 'teacher') bindTeacher(); else bindStudent();
}

async function boot() {
  try {
    state.meta = await api('/meta');
    if (!state.meta.canAccess) throw new Error('你未獲委任為科長，無權進入此模組。');
    filterState.monitors.academicYear = filterState.records.academicYear = filterState.analysis.academicYear = state.meta.currentAcademicYear;
    if (state.meta.role === 'teacher') await loadMonitorRoster();
    else {
      state.studentAssignment = state.meta.assignments[0]; state.studentDate = today; await loadStudentRecord();
    }
  } catch (error) { app.innerHTML = `<div class="loading"><div><h2>未能進入欠交功課模組</h2><p>${escapeHtml(error.message)}</p><a href="/">返回平台主頁</a></div></div>`; }
}
boot();
