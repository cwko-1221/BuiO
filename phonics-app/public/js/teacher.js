const $ = selector => document.querySelector(selector);

const state = { classAccents: {}, defaultAccent: 'en-gb' };

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message || '載入失敗'), { status: response.status });
  return data;
}

let toastTimer;
function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 2200);
}

function updateAccentControls() {
  const className = $('#className').value;
  const disabled = !className;
  $('#classAccent').disabled = disabled;
  $('#saveAccent').disabled = disabled;
  if (disabled) {
    $('#classAccent').value = state.defaultAccent;
    $('#accentHelp').textContent = '請先在上方選擇一個班級。';
    return;
  }
  const accent = state.classAccents[className] || state.defaultAccent;
  $('#classAccent').value = accent;
  $('#accentHelp').textContent = `${className} 學生登入後會自動使用${accent === 'en-us' ? '美式' : '英式'}英語發音。`;
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function formatDate(value) {
  if (!value) return '尚未開始';
  return new Intl.DateTimeFormat('zh-HK', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function renderTotals(students) {
  const active = students.filter(item => item.attempts > 0).length;
  const mastered = students.reduce((sum, item) => sum + item.masteredWords, 0);
  const stars = students.reduce((sum, item) => sum + item.totalStars, 0);
  $('#teacherTotals').innerHTML = [
    ['👥', students.length, '學生人數'], ['🚂', active, '已開始學生'], ['⭐', stars, '全班累積星星'],
  ].map(([icon, value, label]) => `<div class="summary-card"><span class="summary-icon">${icon}</span><div><strong>${value}</strong><span>${label}${label.includes('星') ? ` · 掌握 ${mastered} 字` : ''}</span></div></div>`).join('');
}

function renderRows(students) {
  $('#studentRows').innerHTML = students.length ? students.map(student => `<tr>
    <td>${escapeHtml(student.name)} <small>${escapeHtml(student.id)}</small></td>
    <td>${escapeHtml(student.className || '—')} (${student.classNo ?? '—'})</td>
    <td>${student.attempts}</td>
    <td>${student.masteredWords}/${student.totalWords}</td>
    <td>⭐ ${student.totalStars}</td>
    <td>${escapeHtml(formatDate(student.lastAttemptAt))}</td>
  </tr>`).join('') : '<tr><td class="empty-row" colspan="6">這個班級沒有學生。</td></tr>';
}

async function loadSummary({ preserveClass = true } = {}) {
  const year = $('#academicYear').value;
  const selectedClass = preserveClass ? $('#className').value : '';
  const query = new URLSearchParams();
  if (year) query.set('academicYear', year);
  if (selectedClass) query.set('className', selectedClass);
  $('#studentRows').innerHTML = '<tr><td colspan="6">載入中…</td></tr>';
  try {
    const data = await api(`/api/phonics/teacher/summary?${query}`);
    state.classAccents = data.classAccents || {};
    state.defaultAccent = data.defaultAccent || 'en-gb';
    if (!$('#academicYear').options.length) {
      $('#academicYear').innerHTML = data.academicYears.map(item => `<option value="${escapeHtml(item)}" ${item === data.academicYear ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('');
    }
    const classSelect = $('#className');
    const keep = selectedClass && data.classes.includes(selectedClass) ? selectedClass : '';
    classSelect.innerHTML = `<option value="">所有班級</option>${data.classes.map(item => `<option value="${escapeHtml(item)}" ${item === keep ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}`;
    renderTotals(data.students);
    renderRows(data.students);
    updateAccentControls();
  } catch (error) {
    if (error.status === 401 || error.status === 403) return location.replace('/');
    $('#studentRows').innerHTML = `<tr><td class="empty-row" colspan="6">${escapeHtml(error.message)}</td></tr>`;
  }
}

$('#academicYear').addEventListener('change', () => loadSummary({ preserveClass: false }));
$('#className').addEventListener('change', () => loadSummary());
$('#refreshSummary').addEventListener('click', () => loadSummary());
$('#saveAccent').addEventListener('click', async () => {
  const academicYear = $('#academicYear').value;
  const className = $('#className').value;
  const accent = $('#classAccent').value;
  if (!className) return;
  $('#saveAccent').disabled = true;
  try {
    const data = await api('/api/phonics/teacher/accent', {
      method: 'PUT', body: JSON.stringify({ academicYear, className, accent }),
    });
    state.classAccents[className] = data.setting.accent;
    updateAccentControls();
    toast(`${className} 已設定為${data.accentLabel}`);
  } catch (error) {
    toast(error.message);
    $('#saveAccent').disabled = false;
  }
});
loadSummary({ preserveClass: false });
