const app = document.getElementById('app');
const { t, server } = window.BuiI18n;
const TABLE_NUMBERS = [2, 3, 4, 5, 6, 7, 8, 9];
const state = {
  page: window.location.hash === '#records' ? 'records' : 'spin',
  group: '',
  groups: [],
  students: [],
  recent: [],
  tableNumbers: TABLE_NUMBERS,
  spinCount: 1,
  draws: null,
  spinning: false,
  spinPhase: 'idle',
  saving: false,
  loading: true,
  message: '',
  messageType: '',
};

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const api = async (path, options = {}) => {
  const response = await fetch(`/api/multiplication-checklist${path}`, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({ success: false, message: t('x.badResponse') }));
  if (!response.ok || !data.success) {
    const message = server(data.message || t('x.actionFailed'));
    throw Object.assign(new Error(message), { status: response.status });
  }
  return data;
};

function groupName(group) {
  return group || t('x.unassigned');
}

function peopleLabel(count) {
  return t(count === 1 ? 'x.person' : 'x.people', { count });
}

function tableName(tableNumber) {
  return tableNumber ? `${tableNumber}${t('x.timesSuffix')}` : '—';
}

function inverseWeight(successCount) {
  return 1 / (1 + Math.max(0, Number(successCount) || 0));
}

function wheelSegments(type, draw) {
  const items = type === 'student'
    ? state.students.map(student => ({
      key: String(student.id),
      label: student.name,
      successCount: student.totalSuccesses,
    }))
    : state.tableNumbers.map(number => ({
      key: String(number),
      label: tableName(number),
      successCount: draw?.student?.successCounts?.[String(number)] || 0,
    }));
  const weighted = items.map(item => ({ ...item, weight: inverseWeight(item.successCount) }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return [];
  let cursor = 0;
  return weighted.map(item => {
    const start = cursor;
    cursor += (item.weight / totalWeight) * 360;
    return { ...item, start, end: cursor, mid: (start + cursor) / 2 };
  });
}

function wheelGradient(type, segments) {
  if (!segments.length) return 'conic-gradient(#dce6e8 0deg 360deg)';
  const studentColors = ['#25a79c', '#74d1bd', '#ef977f', '#f6c978', '#73a7d8', '#a99eeb'];
  const tableColors = ['#786cd4', '#a99eeb', '#ef977f', '#f6c978', '#25a79c', '#74d1bd'];
  const colors = type === 'student' ? studentColors : tableColors;
  return `conic-gradient(from -90deg, ${segments.map((segment, index) => `${colors[index % colors.length]} ${segment.start.toFixed(2)}deg ${segment.end.toFixed(2)}deg`).join(', ')})`;
}

function wheelTargetAngle(type, draw, target) {
  const key = type === 'student' ? String(target?.id) : String(target);
  const segment = wheelSegments(type, draw).find(item => item.key === key);
  return segment ? -segment.mid : 0;
}

function maxSpinCount() {
  return Math.max(1, state.students.length);
}

function normalizeSpinCount() {
  state.spinCount = Math.min(
    Math.max(1, Number(state.spinCount) || 1),
    maxSpinCount(),
  );
}

function setMessage(message, type = '') {
  state.message = message;
  state.messageType = type;
}

async function loadData({ keepDraws = false } = {}) {
  state.loading = true;
  render();
  try {
    const requestedGroup = state.group;
    const data = await api(`/?group=${encodeURIComponent(requestedGroup)}`);
    state.groups = data.groups || [];
    state.students = data.students || [];
    state.recent = data.recent || [];
    state.tableNumbers = data.tableNumbers || TABLE_NUMBERS;
    if (requestedGroup && !state.groups.includes(requestedGroup)) {
      state.group = '';
      state.draws = null;
      state.spinCount = 1;
      return loadData({ keepDraws: false });
    }
    normalizeSpinCount();
    if (!keepDraws) state.draws = null;
    setMessage('');
  } catch (error) {
    state.students = [];
    state.recent = [];
    setMessage(error.message || t('x.actionFailed'), 'error');
  } finally {
    state.loading = false;
    render();
  }
}

function renderTable() {
  const headers = state.tableNumbers.map(number => `<th>${number}${escapeHtml(t('x.timesSuffix'))}</th>`).join('');
  const rows = state.students.map(student => `
    <tr>
      <td><div class="student-cell"><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.id)}${student.className ? ` · ${escapeHtml(student.className)}` : ''}</small></div></td>
      <td><span class="group-chip">${escapeHtml(groupName(student.mathGroup))}</span></td>
      ${state.tableNumbers.map(number => {
        const value = Number(student.counts?.[String(number)] || 0);
        const tone = value < 0 ? 'negative' : value === 0 ? 'zero' : '';
        return `<td class="count-cell ${tone}">${value}</td>`;
      }).join('')}
      <td class="total-cell">${Number(student.totalScore || 0)}</td>
    </tr>`).join('');
  return `<div class="table-scroll"><table>
    <thead><tr><th>${escapeHtml(t('x.student'))}</th><th>${escapeHtml(t('x.group'))}</th>${headers}<th>${escapeHtml(t('x.total'))}</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="${state.tableNumbers.length + 3}" class="empty-row">${escapeHtml(t('x.noStudents'))}</td></tr>`}</tbody>
  </table></div>`;
}

function formatTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(window.BuiI18n.locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function renderRecent() {
  if (!state.recent.length) return `<p class="group-note">${escapeHtml(t('x.noRecent'))}</p>`;
  return `<div class="recent-list">${state.recent.map(item => `
    <div class="recent-item">
      <div><strong>${escapeHtml(item.studentName)}</strong><small>${escapeHtml(tableName(item.tableNumber))} · ${escapeHtml(formatTime(item.createdAt))}</small></div>
      <span class="status ${item.isSuccess ? 'success' : 'failure'}">${escapeHtml(t(item.isSuccess ? 'x.success' : 'x.failureMark'))}</span>
    </div>`).join('')}</div>`;
}

function rouletteValue(type, draw) {
  if (type === 'student') {
    return draw?.student?.name || (state.spinning && state.spinPhase === 'students' ? t('x.spinning') : t('x.waitingStudent'));
  }
  return draw?.tableNumber
    ? tableName(draw.tableNumber)
    : (state.spinning && state.spinPhase === 'tables' ? t('x.spinning') : t('x.waitingTable'));
}

function renderWheelLabels(segments) {
  return segments.map(segment => {
    const label = escapeHtml(segment.label);
    return '<span class="roulette-label" style="--segment-mid:' + segment.mid + 'deg;" title="' + label + '">' + label + '</span>';
  }).join('');
}

function renderWheel(type, index, draw) {
  const isStudent = type === 'student';
  const segments = wheelSegments(type, draw);
  const angle = Number(isStudent ? draw?.studentAngle : draw?.tableAngle);
  const segmentData = JSON.stringify(segments.map(({ key, label, successCount, start, end }) => ({ key, label, successCount, start, end })));
  const labels = renderWheelLabels(segments);
  return `<div class="wheel-card ${isStudent ? 'student-wheel' : 'table-wheel'}">
    <div class="wheel-card-label">${escapeHtml(t(isStudent ? 'x.studentWheel' : 'x.tableWheel'))}</div>
    <div class="roulette-wrap">
      <span class="roulette-pointer" aria-hidden="true">▼</span>
      <div class="roulette-disc" data-wheel-type="${type}" data-wheel-index="${index}" data-weighted-segments="${escapeHtml(segmentData)}" style="--spin-angle: ${Number.isFinite(angle) ? angle : 0}deg; background: ${escapeHtml(wheelGradient(type, segments))};">
        ${labels}<span class="roulette-value">${escapeHtml(rouletteValue(type, draw))}</span>
      </div>
    </div>
  </div>`;
}

function renderWheelPair(index, draw) {
  const recorded = Boolean(draw?.recorded);
  const canRecord = Boolean(draw?.student && !recorded && !state.spinning && !state.saving);
  const status = state.spinning
    ? t(state.spinPhase === 'students' ? 'x.studentPhase' : 'x.tablePhase')
    : recorded
      ? t(draw.result === 'success' ? 'x.recordedSuccess' : 'x.recordedFailure')
      : t('x.waitingResult');
  return `<article class="wheel-pair ${recorded ? 'recorded' : ''}">
    <div class="pair-heading"><strong>${escapeHtml(t('x.drawNumber', { n: index + 1 }))}</strong><span>${escapeHtml(status)}</span></div>
    <div class="wheel-pair-grid">${renderWheel('student', index, draw)}${renderWheel('table', index, draw)}</div>
    <div class="pair-result-actions">
      ${recorded
        ? `<span class="recorded-badge ${draw.result === 'success' ? 'success' : 'failure'}">${escapeHtml(status)}</span>`
        : `<button class="result-button success" data-index="${index}" data-result="success" ${canRecord ? '' : 'disabled'}>${escapeHtml(t('x.success'))}<small>${escapeHtml(t('x.successHint'))}</small></button>
           <button class="result-button failure" data-index="${index}" data-result="failure" ${canRecord ? '' : 'disabled'}>${escapeHtml(t('x.failure'))}<small>${escapeHtml(t('x.failureHint'))}</small></button>`}
    </div>
  </article>`;
}

function renderDraw() {
  const hasDraws = Array.isArray(state.draws);
  const allRecorded = hasDraws && state.draws.length > 0 && state.draws.every(draw => draw.recorded);
  const canStart = !state.spinning && !state.saving && state.students.length > 0 && (!hasDraws || allRecorded);
  const countLocked = state.spinning || state.saving || (hasDraws && !allRecorded);
  const remaining = hasDraws ? state.draws.filter(draw => !draw.recorded).length : 0;
  const hint = state.message || (state.spinning
    ? t(state.spinPhase === 'students' ? 'x.studentSpinHint' : 'x.tableSpinHint')
    : allRecorded
      ? t('x.allSavedHint')
      : remaining < state.spinCount && remaining > 0
        ? t('x.remainingHint', { count: remaining })
        : t('x.spinHint'));
  const pairCount = hasDraws ? state.draws.length : state.spinCount;
  const draws = hasDraws ? state.draws : Array.from({ length: pairCount }, () => null);
  return `<section class="draw-panel panel">
    <div class="panel-heading"><span class="eyebrow">WHEEL SPIN</span><h2>${escapeHtml(t('x.drawTitle'))}</h2><p>${escapeHtml(t('x.drawLead'))}</p></div>
    <div class="spin-settings"><div class="field"><label for="spinCount">${escapeHtml(t('x.spinCount'))}</label><select id="spinCount" ${countLocked ? 'disabled' : ''}>${Array.from({ length: maxSpinCount() }, (_, index) => index + 1).map(number => `<option value="${number}" ${number === state.spinCount ? 'selected' : ''}>${escapeHtml(peopleLabel(number))}</option>`).join('')}</select></div><p>${escapeHtml(t('x.spinCountHint'))}</p></div>
    <div class="wheel-pairs">${draws.map((draw, index) => renderWheelPair(index, draw)).join('')}</div>
    <div class="draw-actions"><button class="primary-button" id="spinButton" ${canStart ? '' : 'disabled'}>${escapeHtml(allRecorded ? t('x.nextSpin') : t('x.spin'))}</button><button class="ghost-button" id="clearDraw" ${!hasDraws || state.spinning || state.saving ? 'disabled' : ''}>${escapeHtml(t('x.clear'))}</button></div>
    <p class="draw-hint ${state.messageType}">${escapeHtml(hint)}</p>
  </section>`;
}

function renderRecordsPage() {
  return `<div class="records-page">
    <section class="records-panel panel"><div class="records-heading"><div><span class="eyebrow">SCORE TOTALS</span><h2>${escapeHtml(t('x.recordsTitle'))}</h2><p>${escapeHtml(t('x.recordsLead'))}</p></div><span class="group-chip">${escapeHtml(state.group ? groupName(state.group) : t('x.allGroups'))}</span></div>${renderTable()}</section>
    <section class="recent-panel panel"><span class="eyebrow">RECENT CHECKS</span><h2>${escapeHtml(t('x.recentTitle'))}</h2>${renderRecent()}</section>
  </div>`;
}

function setPage(page) {
  if (!['spin', 'records'].includes(page) || state.page === page) return;
  state.page = page;
  window.history.replaceState(null, '', page === 'records' ? '#records' : '#spin');
  render();
}

function render() {
  if (state.loading && !state.groups.length && !state.students.length) {
    app.innerHTML = `<div class="loading-shell"><div class="loading-spinner"></div><p>${escapeHtml(t('x.loading'))}</p></div>`;
    return;
  }
  app.innerHTML = `<div class="app-shell">
    <header class="topbar"><div class="brand"><img class="brand-mark" src="/math-app/images/logo.png" alt="${escapeHtml(t('x.logoAlt'))}"><div><strong>${escapeHtml(t('x.school'))}</strong><span>LEARNING HUB</span></div></div><div class="top-actions"><span class="teacher-pill">${escapeHtml(t('x.teacherOnly'))}</span><a class="back-link" href="/">← ${escapeHtml(t('x.back'))}</a></div></header>
    <main class="main">
      <section class="hero"><div><span class="eyebrow">TEACHER TOOL</span><h1>${escapeHtml(t('x.title'))}</h1><p>${escapeHtml(t('x.subtitle'))}</p></div></section>
      ${state.messageType === 'error' && !state.draws ? `<div class="panel error-panel">${escapeHtml(state.message)}</div>` : ''}
      <nav class="page-tabs panel" aria-label="${escapeHtml(t('x.title'))}">
        <button class="page-tab ${state.page === 'spin' ? 'active' : ''}" data-page="spin" aria-selected="${state.page === 'spin'}">${escapeHtml(t('x.drawTitle'))}</button>
        <button class="page-tab ${state.page === 'records' ? 'active' : ''}" data-page="records" aria-selected="${state.page === 'records'}">${escapeHtml(t('x.recordsTitle'))}</button>
      </nav>
      <section class="controls panel"><div class="field"><label for="groupSelect">${escapeHtml(t('x.filterGroup'))}</label><select id="groupSelect"><option value="">${escapeHtml(t('x.allGroups'))}</option>${state.groups.map(group => `<option value="${escapeHtml(group)}" ${group === state.group ? 'selected' : ''}>${escapeHtml(group)}</option>`).join('')}</select></div><p class="group-note">${escapeHtml(t('x.groupNote'))}</p></section>
      ${state.page === 'records' ? renderRecordsPage() : `<div class="workspace single-column">${renderDraw()}</div>`}
    </main>
  </div>`;
  bindEvents();
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function weightedPick(items, getSuccessCount) {
  if (!items.length) return null;
  const weighted = items.map(item => ({ item, weight: inverseWeight(getSuccessCount(item)) }));
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = Math.random() * totalWeight;
  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.item;
  }
  return weighted[weighted.length - 1].item;
}

function sampleStudents(count) {
  const pool = [...state.students];
  const picked = [];
  while (picked.length < count && pool.length) {
    const student = weightedPick(pool, item => item.totalSuccesses);
    if (!student) break;
    picked.push(student);
    pool.splice(pool.indexOf(student), 1);
  }
  return picked;
}

function sampleTable(student) {
  return weightedPick(state.tableNumbers, number => student?.successCounts?.[String(number)] || 0);
}

function pause(duration) {
  return new Promise(resolve => window.setTimeout(resolve, duration));
}

function normalizeDegrees(angle) {
  return ((angle % 360) + 360) % 360;
}

function animateWheelGroup(type, targets) {
  const discs = [...document.querySelectorAll(`.roulette-disc[data-wheel-type="${type}"]`)].sort((a, b) => Number(a.dataset.wheelIndex) - Number(b.dataset.wheelIndex));
  const starts = discs.map(() => Math.random() * 360);
  const ends = discs.map((disc, index) => {
    const draw = state.draws?.[Number(disc.dataset.wheelIndex)];
    const targetAngle = normalizeDegrees(wheelTargetAngle(type, draw, targets[index]));
    const currentAngle = normalizeDegrees(starts[index]);
    const landingTurn = (targetAngle - currentAngle + 360) % 360;
    return starts[index] + (5.5 + Math.random() * 1.5) * 360 + landingTurn;
  });
  const duration = 1850;
  const started = performance.now();

  return new Promise(resolve => {
    const tick = now => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      discs.forEach((disc, index) => {
        const draw = state.draws?.[Number(disc.dataset.wheelIndex)];
        const preview = type === 'student'
          ? randomItem(state.students)?.name || t('x.spinning')
          : tableName(randomItem(state.tableNumbers));
        const value = disc.querySelector('.roulette-value');
        if (value) value.textContent = preview;
        disc.style.setProperty('--spin-angle', `${starts[index] + ((ends[index] - starts[index]) * eased)}deg`);
        if (draw && progress === 1) draw[type === 'student' ? 'studentAngle' : 'tableAngle'] = ends[index];
      });
      if (progress < 1) {
        requestAnimationFrame(tick);
        return;
      }
      resolve();
    };
    requestAnimationFrame(tick);
  });
}

async function spin() {
  if (state.spinning || state.saving || !state.students.length) return;
  const count = Math.min(state.spinCount, state.students.length);
  state.spinning = true;
  state.spinPhase = 'students';
  state.draws = Array.from({ length: count }, () => ({ student: null, tableNumber: null, recorded: false, result: null }));
  setMessage('');
  render();

  const students = sampleStudents(count);
  await animateWheelGroup('student', students);
  state.draws = state.draws.map((draw, index) => ({ ...draw, student: students[index] }));
  state.spinPhase = 'tables';
  render();
  await pause(220);

  const tables = state.draws.map(draw => sampleTable(draw.student));
  await animateWheelGroup('table', tables);
  state.draws = state.draws.map((draw, index) => ({ ...draw, tableNumber: tables[index] }));
  state.spinning = false;
  state.spinPhase = 'idle';
  render();
}

async function record(index, result) {
  if (state.spinning || state.saving) return;
  const draw = state.draws?.[index];
  if (!draw?.student || draw.recorded) return;
  state.saving = true;
  draw.recorded = true;
  draw.result = result;
  render();
  try {
    await api('/attempts', {
      method: 'POST',
      body: JSON.stringify({ studentId: draw.student.id, tableNumber: draw.tableNumber, result }),
    });
    await loadData({ keepDraws: true });
    state.saving = false;
    setMessage(t(result === 'success' ? 'x.savedSuccess' : 'x.savedFailure'));
    render();
  } catch (error) {
    draw.recorded = false;
    draw.result = null;
    state.saving = false;
    setMessage(error.message || t('x.actionFailed'), 'error');
    render();
  }
}

function bindEvents() {
  document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => {
    setPage(button.dataset.page);
  }));
  document.getElementById('groupSelect')?.addEventListener('change', event => {
    state.group = event.target.value;
    state.draws = null;
    state.spinCount = 1;
    loadData();
  });
  document.getElementById('spinCount')?.addEventListener('change', event => {
    state.spinCount = Number(event.target.value) || 1;
    normalizeSpinCount();
    state.draws = null;
    setMessage('');
    render();
  });
  document.getElementById('spinButton')?.addEventListener('click', spin);
  document.getElementById('clearDraw')?.addEventListener('click', () => {
    state.draws = null;
    state.spinPhase = 'idle';
    setMessage('');
    render();
  });
  document.querySelectorAll('[data-result]').forEach(button => button.addEventListener('click', () => {
    record(Number(button.dataset.index), button.dataset.result);
  }));
}

loadData();
