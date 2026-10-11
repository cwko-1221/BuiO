const app = document.getElementById('app');
const { t, server } = window.BuiI18n;
const TABLE_NUMBERS = [2, 3, 4, 5, 6, 7, 8, 9];
const SOUND_PREFERENCE_KEY = 'multiplication-checklist-sound';
let soundContext = null;
let labelMeasureContext = null;
let wheelDialogTrigger = null;
const state = {
  page: window.location.hash === '#records' ? 'records' : 'spin',
  group: '',
  grade: '',
  groups: [],
  grades: [],
  students: [],
  recent: [],
  tableNumbers: TABLE_NUMBERS,
  spinCount: 1,
  draws: null,
  spinning: false,
  spinPhase: 'idle',
  saving: false,
  loading: true,
  soundEnabled: readSoundPreference(),
  message: '',
  messageType: '',
};

function readSoundPreference() {
  try {
    return window.localStorage.getItem(SOUND_PREFERENCE_KEY) !== 'off';
  } catch {
    return true;
  }
}

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

function gradeName(grade) {
  return grade ? t(`x.grade${grade}`) : t('x.allGrades');
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
  // Scoring changes weights; landed wheels keep their original sectors until the next round.
  const snapshot = draw?.[type === 'student' ? 'studentSegments' : 'tableSegments'];
  if (snapshot) return snapshot;
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

function wheelColors(type) {
  return type === 'student'
    ? ['#8ad8cb', '#b6e4d3', '#f5b09f', '#f5d18a', '#a9c9ef', '#c6b7ee']
    : ['#b8a8ec', '#d0c5f4', '#f5b09f', '#f5d18a', '#8ad8cb', '#b6e4d3'];
}

function polarPoint(angle, radius) {
  const radians = (angle * Math.PI) / 180;
  return { x: 120 + radius * Math.sin(radians), y: 120 - radius * Math.cos(radians) };
}

function sectorPath(start, end, radius = 112) {
  if (end - start >= 359.999) {
    return `M 120 ${120 - radius} A ${radius} ${radius} 0 1 1 120 ${120 + radius} A ${radius} ${radius} 0 1 1 120 ${120 - radius} Z`;
  }
  const from = polarPoint(start, radius);
  const to = polarPoint(end, radius);
  const largeArc = end - start > 180 ? 1 : 0;
  return `M 120 120 L ${from.x.toFixed(2)} ${from.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${to.x.toFixed(2)} ${to.y.toFixed(2)} Z`;
}

function measureLabel(text, fontSize) {
  labelMeasureContext ||= document.createElement('canvas').getContext('2d');
  labelMeasureContext.font = `800 ${fontSize}px ${getComputedStyle(document.documentElement).fontFamily}`;
  return labelMeasureContext.measureText(text).width;
}

function shortenLabel(text, fontSize, width) {
  if (measureLabel(text, fontSize) <= width) return text;
  const characters = Array.from(text);
  while (characters.length && measureLabel(`${characters.join('')}…`, fontSize) > width) characters.pop();
  return `${characters.join('').trimEnd()}…`;
}

function wheelLabelLines(label, fontSize, width, maxLines) {
  let text = String(label).trim();
  if (maxLines === 1) {
    if (measureLabel(text, fontSize) > width) {
      const chineseName = text.match(/\p{Script=Han}+/gu)?.join('');
      if (chineseName?.length >= 2) text = chineseName;
      else {
        const words = text.split(/\s+/);
        if (words.length > 1) text = `${words[0]} ${words.slice(1).map(word => Array.from(word)[0]).join('')}.`;
      }
    }
    return [shortenLabel(text, fontSize, width)];
  }
  if (measureLabel(text, fontSize) <= width) return [text];
  const words = text.split(/\s+/);
  if (words.length > 1) {
    let first = words.shift();
    while (words.length > 1 && measureLabel(`${first} ${words[0]}`, fontSize) <= width) first += ` ${words.shift()}`;
    return [shortenLabel(first, fontSize, width), shortenLabel(words.join(' '), fontSize, width)];
  }
  const characters = Array.from(text);
  let first = '';
  while (characters.length && measureLabel(first + characters[0], fontSize) <= width) first += characters.shift();
  return [first, shortenLabel(characters.join(''), fontSize, width)];
}

function renderWheelSvg(type, segments, angle = 0, wheelId = 'wheel', selectedKey = '') {
  const colors = wheelColors(type);
  const clips = segments.map((segment, index) => `<clipPath id="${wheelId}-${index}"><path d="${sectorPath(segment.start, segment.end, 109)}"/></clipPath>`).join('');
  const sectors = segments.map((segment, index) => `<path class="roulette-sector ${segment.key === selectedKey ? 'selected-sector' : ''}" data-segment-key="${escapeHtml(segment.key)}" d="${sectorPath(segment.start, segment.end)}" fill="${colors[index % colors.length]}" stroke="#fff" stroke-width="1.2"><title>${escapeHtml(segment.label)}</title></path>`).join('');
  const labels = segments.map((segment, index) => {
    const isStudent = type === 'student';
    const arc = segment.end - segment.start;
    const dense = isStudent && segments.length > 20;
    const radius = isStudent ? dense ? 84 : 77 : 79;
    const innerRadius = isStudent ? dense ? 62 : 48 : 58;
    const space = 2 * innerRadius * Math.sin(Math.min(180, arc) * Math.PI / 360) - 3;
    const lineCount = isStudent && space >= 19 ? 2 : 1;
    const fontSize = Math.max(1.5, Math.min(isStudent ? 12 : 16, space / (lineCount * 1.15)));
    const lines = wheelLabelLines(segment.label, fontSize, isStudent ? dense ? 43 : 57 : 44, lineCount);
    const point = polarPoint(segment.mid, radius);
    const rotation = segment.mid - 90 + (normalizeDegrees(segment.mid + angle) > 180 ? 180 : 0);
    const lineHeight = fontSize * 1.15;
    return `<g class="roulette-svg-label" clip-path="url(#${wheelId}-${index})" data-full-name="${escapeHtml(segment.label)}"><g transform="translate(${point.x.toFixed(3)} ${point.y.toFixed(3)}) rotate(${rotation.toFixed(3)})"><text fill="#172b48" font-size="${fontSize.toFixed(3)}" font-weight="800" text-anchor="middle" dominant-baseline="central">${lines.map((line, lineIndex) => `<tspan x="0" y="${((lineIndex - (lines.length - 1) / 2) * lineHeight).toFixed(3)}">${escapeHtml(line)}</tspan>`).join('')}</text></g></g>`;
  }).join('');
  return `<svg class="roulette-svg" viewBox="0 0 240 240" aria-hidden="true"><defs>${clips}</defs><g class="roulette-rotor" transform="rotate(${angle} 120 120)">${sectors}${labels}<circle cx="120" cy="120" r="28" fill="#fff" stroke="#fff" stroke-width="3"/></g></svg>`;
}

function wheelTargetAngle(type, disc, target) {
  const key = type === 'student' ? String(target?.id) : String(target);
  let segments = [];
  try {
    segments = JSON.parse(disc.dataset.weightedSegments || '[]');
  } catch {
    return 0;
  }
  const segment = segments.find(item => item.key === key);
  if (!segment) return 0;
  // The SVG sectors start at 12 o'clock and advance clockwise; center this exact sector under the pointer.
  return -((Number(segment.start) + Number(segment.end)) / 2);
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
  if (type === 'error' && window.BuiLoading?.notify(message)) { state.message = ''; return; }
  state.message = message;
  state.messageType = type;
}

async function loadData({ keepDraws = false } = {}) {
  state.loading = true;
  render();
  try {
    const requestedGroup = state.group;
    const requestedGrade = state.grade;
    const data = await api(`/?group=${encodeURIComponent(requestedGroup)}&grade=${encodeURIComponent(requestedGrade)}`);
    state.groups = data.groups || [];
    state.grades = data.grades || [];
    state.students = data.students || [];
    state.recent = data.recent || [];
    state.tableNumbers = data.tableNumbers || TABLE_NUMBERS;
    if (requestedGroup && !state.groups.includes(requestedGroup)) {
      state.group = '';
      state.draws = null;
      state.spinCount = 1;
      return loadData({ keepDraws: false });
    }
    if (requestedGrade && !state.grades.includes(requestedGrade)) {
      state.grade = '';
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
    setMessage('');
    window.BuiLoading.recover(error, () => loadData({ keepDraws }));
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

function renderWheel(type, index, draw) {
  const isStudent = type === 'student';
  const segments = wheelSegments(type, draw);
  const angle = Number(isStudent ? draw?.studentAngle : draw?.tableAngle);
  const segmentData = JSON.stringify(segments.map(({ key, label, successCount, start, end }) => ({ key, label, successCount, start, end })));
  const activePhase = isStudent ? 'students' : 'tables';
  const isActive = state.spinning && state.spinPhase === activePhase;
  const selectedKey = isStudent ? String(draw?.student?.id || '') : String(draw?.tableNumber || '');
  const centerValue = isStudent && draw?.student ? t('x.drawn') : isActive ? '…' : isStudent ? t('x.waitingStudent') : rouletteValue(type, draw);
  const narrowSegments = segments.map((segment, segmentIndex) => ({ ...segment, color: wheelColors(type)[segmentIndex % wheelColors(type).length] })).filter(segment => segment.end - segment.start < 8);
  return `<div class="wheel-card ${isStudent ? 'student-wheel' : 'table-wheel'}">
    <div class="wheel-card-label">${escapeHtml(t(isStudent ? 'x.studentWheel' : 'x.tableWheel'))}</div>
    <div class="roulette-wrap ${isActive ? 'is-spinning' : ''}">
      <span class="roulette-pointer" aria-hidden="true">▼</span>
      <div class="roulette-disc" data-wheel-type="${type}" data-wheel-index="${index}" data-weighted-segments="${escapeHtml(segmentData)}" style="--spin-angle: ${Number.isFinite(angle) ? angle : 0}deg;">
        ${renderWheelSvg(type, segments, Number.isFinite(angle) ? angle : 0, `${type}-${index}`, selectedKey)}<span class="roulette-value ${selectedKey ? 'has-result' : ''}" aria-hidden="true">${escapeHtml(centerValue)}</span>
      </div>
    </div>
    <div class="wheel-outcome ${selectedKey ? 'has-result' : ''}" aria-live="${state.spinning ? 'off' : 'polite'}"><strong class="wheel-selection-value">${escapeHtml(selectedKey ? rouletteValue(type, draw) : t(isStudent ? 'x.readyForStudent' : 'x.readyForTable'))}</strong>${isStudent && draw?.student ? `<small>${escapeHtml(draw.student.className)} · ${escapeHtml(groupName(draw.student.mathGroup))}</small>` : ''}</div>
    <button type="button" class="wheel-zoom" data-inspect-wheel="${type}" data-inspect-index="${index}" ${state.spinning || !segments.length ? 'disabled' : ''}><span aria-hidden="true">⤢</span> ${escapeHtml(t('x.zoomWheel'))}</button>
    ${narrowSegments.length ? `<div class="narrow-sector-key"><small>${escapeHtml(t('x.narrowSectors'))}</small>${narrowSegments.map(segment => `<span><i style="background:${segment.color}" aria-hidden="true"></i>${escapeHtml(segment.label)}</span>`).join('')}</div>` : ''}
  </div>`;
}

function renderWheelRoster(type, segments, selectedKey = '') {
  const colors = wheelColors(type);
  return `<ol class="wheel-roster-list">${segments.map((segment, index) => {
    const percentage = (segment.end - segment.start) / 3.6;
    const probability = percentage < .1 ? '<0.1%' : `${new Intl.NumberFormat(window.BuiI18n.locale, { maximumFractionDigits: 1 }).format(percentage)}%`;
    return `<li class="${segment.key === selectedKey ? 'selected' : ''}"><span class="roster-swatch" style="background:${colors[index % colors.length]}">${index + 1}</span><div><strong>${escapeHtml(segment.label)}</strong><small>${escapeHtml(t('x.successCount', { count: segment.successCount }))}</small></div><span class="roster-chance">${escapeHtml(probability)}</span></li>`;
  }).join('')}</ol>`;
}

function openWheelDialog(type, index, trigger) {
  if (state.spinning) return;
  const dialog = document.getElementById('wheelDialog');
  const draw = state.draws?.[index];
  const segments = wheelSegments(type, draw);
  const isStudent = type === 'student';
  const selectedKey = String(isStudent ? draw?.student?.id || '' : draw?.tableNumber || '');
  const angle = Number(isStudent ? draw?.studentAngle : draw?.tableAngle) || 0;
  wheelDialogTrigger = trigger;
  dialog.innerHTML = `<div class="wheel-dialog-heading"><div><span class="eyebrow">${escapeHtml(t('x.drawNumber', { n: index + 1 }))}</span><h2 id="wheelDialogTitle">${escapeHtml(t(isStudent ? 'x.studentWheel' : 'x.tableWheel'))}</h2></div><button type="button" class="dialog-close" aria-label="${escapeHtml(t('x.close'))}">×</button></div><div class="wheel-dialog-grid"><div class="dialog-wheel"><div class="roulette-wrap"><span class="roulette-pointer" aria-hidden="true">▼</span><div class="roulette-disc">${renderWheelSvg(type, segments, angle, `inspect-${type}-${index}`, selectedKey)}<span class="roulette-value">${escapeHtml(isStudent && draw?.student ? t('x.drawn') : rouletteValue(type, draw))}</span></div></div><div class="wheel-outcome ${selectedKey ? 'has-result' : ''}"><strong>${escapeHtml(rouletteValue(type, draw))}</strong></div></div><div class="dialog-roster"><h3>${escapeHtml(t('x.fullNames'))}</h3><p>${escapeHtml(t('x.probabilityHint'))}</p>${renderWheelRoster(type, segments, selectedKey)}</div></div>`;
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.showModal();
}

function renderWheelPair(index, draw) {
  const recorded = Boolean(draw?.recorded);
  const canRecord = Boolean(draw?.student && draw?.tableNumber && !recorded && !state.spinning && !state.saving);
  const status = state.spinning
    ? t(state.spinPhase === 'students' ? 'x.studentPhase' : 'x.tablePhase')
    : recorded
      ? t(draw.result === 'success' ? 'x.recordedSuccess' : 'x.recordedFailure')
      : draw?.student && !draw?.tableNumber
        ? t('x.readyForTable')
        : draw?.tableNumber
          ? t('x.waitingResult')
          : t('x.readyForStudent');
  return `<article class="wheel-pair ${recorded ? 'recorded' : ''}">
    <div class="pair-heading"><strong><span class="pair-number">${String(index + 1).padStart(2, '0')}</span>${escapeHtml(t('x.drawNumber', { n: index + 1 }))}</strong><span>${escapeHtml(status)}</span></div>
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
  const studentsDrawn = hasDraws && state.draws.length > 0 && state.draws.every(draw => Boolean(draw.student));
  const tablesDrawn = studentsDrawn && state.draws.every(draw => Boolean(draw.tableNumber));
  const canSpinStudents = !state.loading && !state.spinning && !state.saving && state.students.length > 0 && (!hasDraws || allRecorded);
  const canSpinTables = !state.loading && !state.spinning && !state.saving && studentsDrawn && !tablesDrawn;
  const countLocked = state.loading || state.spinning || state.saving || (hasDraws && !allRecorded);
  const remaining = hasDraws ? state.draws.filter(draw => !draw.recorded).length : 0;
  const hint = state.message || (state.spinning
    ? t(state.spinPhase === 'students' ? 'x.studentSpinHint' : 'x.tableSpinHint')
    : studentsDrawn && !tablesDrawn
      ? t('x.tableReadyHint')
      : tablesDrawn && !allRecorded
        ? t('x.resultHint')
    : allRecorded
      ? t('x.allSavedHint')
      : remaining < state.spinCount && remaining > 0
        ? t('x.remainingHint', { count: remaining })
        : t('x.spinHint'));
  const pairCount = hasDraws ? state.draws.length : state.spinCount;
  const draws = hasDraws ? state.draws : Array.from({ length: pairCount }, () => null);
  return `<section class="draw-panel panel">
    <div class="panel-heading draw-heading"><div><span class="eyebrow">WHEEL SPIN</span><h2>${escapeHtml(t('x.drawTitle'))}</h2><p>${escapeHtml(t('x.drawLead'))}</p></div><button class="sound-toggle" id="soundToggle" type="button" aria-pressed="${state.soundEnabled}">${state.soundEnabled ? '🔊' : '🔇'} ${escapeHtml(t(state.soundEnabled ? 'x.soundOn' : 'x.soundOff'))}</button></div>
    <div class="spin-toolbar"><div class="field"><label for="spinCount">${escapeHtml(t('x.spinCount'))}</label><select id="spinCount" ${countLocked ? 'disabled' : ''}>${Array.from({ length: maxSpinCount() }, (_, index) => index + 1).map(number => `<option value="${number}" ${number === state.spinCount ? 'selected' : ''}>${escapeHtml(peopleLabel(number))}</option>`).join('')}</select></div>
      <div class="draw-actions"><button class="primary-button" id="spinStudentsButton" ${canSpinStudents ? '' : 'disabled'}><span class="action-step">1</span>${escapeHtml(allRecorded ? t('x.nextSpinStudents') : t('x.spinStudents'))}</button><button class="primary-button table-spin-button" id="spinTablesButton" ${canSpinTables ? '' : 'disabled'}><span class="action-step">2</span>${escapeHtml(t('x.spinTables'))}</button><button class="ghost-button" id="clearDraw" ${!hasDraws || state.spinning || state.saving ? 'disabled' : ''}>${escapeHtml(t('x.clear'))}</button></div>
      <p class="draw-hint ${state.messageType}" role="status">${escapeHtml(hint)}</p>
    </div>
    <p class="wheel-label-hint">${escapeHtml(t('x.labelHint'))}</p>
    <div class="wheel-pairs ${pairCount > 1 ? 'multiple-pairs' : ''}">${draws.map((draw, index) => renderWheelPair(index, draw)).join('')}</div>
  </section>`;
}

function renderRecordsPage() {
  return `<div class="records-page">
    <section class="records-panel panel"><div class="records-heading"><div><span class="eyebrow">SCORE TOTALS</span><h2>${escapeHtml(t('x.recordsTitle'))}</h2><p>${escapeHtml(t('x.recordsLead'))}</p></div><div class="scope-chips"><span class="group-chip">${escapeHtml(state.grade ? gradeName(state.grade) : t('x.allGrades'))}</span><span class="group-chip">${escapeHtml(state.group ? groupName(state.group) : t('x.allGroups'))}</span></div></div>${renderTable()}</section>
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
  const initialLoading = state.loading && !state.groups.length && !state.students.length;
  app.classList.toggle('loading-shell', initialLoading);
  if (initialLoading) {
    app.innerHTML = `<div class="loading-shell"><div class="loading-spinner"></div><p>${escapeHtml(t('x.loading'))}</p></div>`;
    return;
  }
  const filtersLocked = state.loading || state.spinning || state.saving;
  app.innerHTML = `<div class="app-shell">
    <header class="topbar"><div class="brand"><img class="brand-mark" src="/math-app/images/logo.png" alt="${escapeHtml(t('x.logoAlt'))}"><div><strong>${escapeHtml(t('x.school'))}</strong><span>LEARNING HUB</span></div></div><div class="top-actions"><span class="teacher-pill">${escapeHtml(t('x.teacherOnly'))}</span><a class="back-link" href="/">← ${escapeHtml(t('x.back'))}</a></div></header>
    <main class="main">
      <section class="hero"><div><span class="eyebrow">TEACHER TOOL</span><h1>${escapeHtml(t('x.title'))}</h1><p>${escapeHtml(t('x.subtitle'))}</p></div></section>
      ${state.messageType === 'error' && !state.draws ? `<div class="panel error-panel">${escapeHtml(state.message)}</div>` : ''}
      <nav class="page-tabs panel" aria-label="${escapeHtml(t('x.title'))}">
        <button class="page-tab ${state.page === 'spin' ? 'active' : ''}" data-page="spin" aria-selected="${state.page === 'spin'}" ${state.spinning || state.saving ? 'disabled' : ''}>${escapeHtml(t('x.drawTitle'))}</button>
        <button class="page-tab ${state.page === 'records' ? 'active' : ''}" data-page="records" aria-selected="${state.page === 'records'}" ${state.spinning || state.saving ? 'disabled' : ''}>${escapeHtml(t('x.recordsTitle'))}</button>
      </nav>
      <section class="controls panel filter-panel">
        <div class="filter-heading"><div><span class="eyebrow">CLASS FILTER</span><h2>${escapeHtml(t('x.filterTitle'))}</h2><p>${escapeHtml(t('x.filterLead'))}</p></div><span class="filter-count"><i aria-hidden="true"></i>${escapeHtml(t('x.studentCount', { count: state.students.length }))}</span></div>
        <div class="filter-fields">
          <div class="field filter-field"><label for="gradeSelect"><span class="filter-index">01</span>${escapeHtml(t('x.filterGrade'))}</label><select id="gradeSelect" ${filtersLocked ? 'disabled' : ''}><option value="">${escapeHtml(t('x.allGrades'))}</option>${state.grades.map(grade => `<option value="${escapeHtml(grade)}" ${grade === state.grade ? 'selected' : ''}>${escapeHtml(gradeName(grade))}</option>`).join('')}</select></div>
          <div class="field filter-field"><label for="groupSelect"><span class="filter-index">02</span>${escapeHtml(t('x.filterGroup'))}</label><select id="groupSelect" ${filtersLocked ? 'disabled' : ''}><option value="">${escapeHtml(t('x.allGroups'))}</option>${state.groups.map(group => `<option value="${escapeHtml(group)}" ${group === state.group ? 'selected' : ''}>${escapeHtml(group)}</option>`).join('')}</select></div>
        </div>
        <div class="filter-note"><span aria-hidden="true">✳</span><p class="group-note">${escapeHtml(t('x.groupNote'))}</p></div>
      </section>
      ${state.page === 'records' ? renderRecordsPage() : `<div class="workspace single-column">${renderDraw()}</div>`}
    </main>
  </div>`;
  app.insertAdjacentHTML('beforeend', '<dialog id="wheelDialog" class="wheel-dialog" aria-labelledby="wheelDialogTitle"></dialog>');
  bindEvents();
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

function normalizeDegrees(angle) {
  return ((angle % 360) + 360) % 360;
}

function getSoundContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!state.soundEnabled || !AudioContextClass) return null;
  try {
    soundContext ||= new AudioContextClass();
    if (soundContext.state === 'suspended') soundContext.resume().catch(() => {});
    return soundContext;
  } catch {
    return null;
  }
}

function playTone(frequency, { at, duration = .12, volume = .035, type = 'sine' } = {}) {
  const context = getSoundContext();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startAt = Math.max(context.currentTime, at ?? context.currentTime);
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + .008);
  gain.gain.exponentialRampToValueAtTime(.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + .015);
}

function playWheelTick(progress, wheelType) {
  const pitch = (wheelType === 'student' ? 1150 : 1450) - (progress * 420);
  playTone(pitch, { duration: .035, volume: .012, type: 'square' });
}

function playWheelLanding(wheelType) {
  const context = getSoundContext();
  if (!context) return;
  const now = context.currentTime;
  const notes = wheelType === 'student' ? [660, 880] : [784, 988, 1175];
  notes.forEach((note, index) => playTone(note, { at: now + (index * .105), duration: .22, volume: .04 }));
}

function playRecordResult(result) {
  const context = getSoundContext();
  if (!context) return;
  const now = context.currentTime;
  const notes = result === 'success' ? [659, 831, 988] : [440, 370];
  notes.forEach((note, index) => playTone(note, { at: now + (index * .11), duration: result === 'success' ? .19 : .22, volume: .035 }));
}

function immersiveProgress(progress) {
  if (progress < .18) return .06 * Math.pow(progress / .18, 2);
  if (progress < .78) return .06 + (.74 * ((progress - .18) / .6));
  const finish = (progress - .78) / .22;
  return .8 + (.2 * (1 - Math.pow(1 - finish, 1.55)));
}

function animateWheelGroup(type, targets) {
  const discs = [...document.querySelectorAll(`.roulette-disc[data-wheel-type="${type}"]`)].sort((a, b) => Number(a.dataset.wheelIndex) - Number(b.dataset.wheelIndex));
  const segmentsByDisc = discs.map(disc => JSON.parse(disc.dataset.weightedSegments));
  const starts = discs.map(disc => Number.parseFloat(disc.style.getPropertyValue('--spin-angle')) || 0);
  const ends = discs.map((disc, index) => {
    const wheelIndex = Number(disc.dataset.wheelIndex);
    const targetAngle = normalizeDegrees(wheelTargetAngle(type, disc, targets[wheelIndex]));
    const currentAngle = normalizeDegrees(starts[index]);
    const landingTurn = (targetAngle - currentAngle + 360) % 360;
    const fullTurns = 8 + Math.floor(Math.random() * 3) + (wheelIndex % 2);
    return starts[index] + (fullTurns * 360) + landingTurn;
  });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const baseDuration = reducedMotion ? 350 : type === 'student' ? 5100 : 4400;
  const durations = discs.map((_, index) => baseDuration + ((index % 3) * 140) + (Math.random() * 180));
  const overallDuration = Math.max(...durations, baseDuration);
  const started = performance.now();
  let nextTickAt = started + 95;

  return new Promise(resolve => {
    const tick = now => {
      const elapsed = now - started;
      const overallProgress = Math.min(1, elapsed / overallDuration);
      if (now >= nextTickAt) {
        playWheelTick(overallProgress, type);
        nextTickAt = now + 72 + (overallProgress ** 2.2 * 265);
      }
      discs.forEach((disc, index) => {
        const draw = state.draws?.[Number(disc.dataset.wheelIndex)];
        const progress = Math.min(1, elapsed / durations[index]);
        const eased = immersiveProgress(progress);
        const angle = starts[index] + ((ends[index] - starts[index]) * eased);
        const pointerAngle = normalizeDegrees(-angle);
        const pointedSegment = segmentsByDisc[index].find(segment => pointerAngle >= segment.start && pointerAngle < segment.end);
        const preview = disc.closest('.wheel-card')?.querySelector('.wheel-selection-value');
        if (preview && pointedSegment) preview.textContent = pointedSegment.label;
        const value = disc.querySelector('.roulette-value');
        if (value && type === 'table' && pointedSegment) value.textContent = pointedSegment.label;
        disc.style.setProperty('--spin-angle', `${angle}deg`);
        disc.querySelector('.roulette-rotor')?.setAttribute('transform', `rotate(${angle} 120 120)`);
        if (draw && progress >= 1) draw[type === 'student' ? 'studentAngle' : 'tableAngle'] = ends[index];
      });
      if (elapsed < overallDuration) {
        requestAnimationFrame(tick);
        return;
      }
      playWheelLanding(type);
      resolve();
    };
    requestAnimationFrame(tick);
  });
}

async function spinStudents() {
  if (state.loading || state.spinning || state.saving || !state.students.length) return;
  if (state.draws?.some(draw => !draw.recorded)) return;
  if (state.soundEnabled) getSoundContext();
  const count = Math.min(state.spinCount, state.students.length);
  state.spinning = true;
  state.spinPhase = 'students';
  const studentSegments = wheelSegments('student', null);
  state.draws = Array.from({ length: count }, () => ({ student: null, tableNumber: null, recorded: false, result: null, studentSegments }));
  setMessage('');
  render();

  const students = sampleStudents(count);
  await animateWheelGroup('student', students);
  state.draws = state.draws.map((draw, index) => ({ ...draw, student: students[index] }));
  state.spinning = false;
  state.spinPhase = 'students-ready';
  render();
}

async function spinTables() {
  if (state.loading || state.spinning || state.saving) return;
  const draws = state.draws;
  if (!draws?.length || draws.some(draw => !draw.student || draw.tableNumber)) return;
  if (state.soundEnabled) getSoundContext();
  state.spinning = true;
  state.spinPhase = 'tables';
  draws.forEach(draw => { draw.tableSegments = wheelSegments('table', draw); });
  setMessage('');
  render();

  const tables = draws.map(draw => sampleTable(draw.student));
  await animateWheelGroup('table', tables);
  state.draws = state.draws.map((draw, index) => ({ ...draw, tableNumber: tables[index] }));
  state.spinning = false;
  state.spinPhase = 'idle';
  render();
}

async function record(index, result) {
  if (state.spinning || state.saving) return;
  const draw = state.draws?.[index];
  if (!draw?.student || !draw.tableNumber || draw.recorded) return;
  state.saving = true;
  draw.recorded = true;
  draw.result = result;
  render();
  try {
    await api('/attempts', {
      method: 'POST',
      body: JSON.stringify({ studentId: draw.student.id, tableNumber: draw.tableNumber, result }),
    });
    playRecordResult(result);
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
  const dialog = document.getElementById('wheelDialog');
  dialog?.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog?.addEventListener('close', () => {
    if (wheelDialogTrigger?.isConnected) wheelDialogTrigger.focus();
  });
  document.querySelectorAll('[data-inspect-wheel]').forEach(button => button.addEventListener('click', () => {
    openWheelDialog(button.dataset.inspectWheel, Number(button.dataset.inspectIndex), button);
  }));
  document.getElementById('soundToggle')?.addEventListener('click', event => {
    state.soundEnabled = !state.soundEnabled;
    try {
      window.localStorage.setItem(SOUND_PREFERENCE_KEY, state.soundEnabled ? 'on' : 'off');
    } catch {
      // Audio remains usable for this page even if the browser blocks local storage.
    }
    if (state.soundEnabled) getSoundContext();
    event.currentTarget.setAttribute('aria-pressed', String(state.soundEnabled));
    event.currentTarget.textContent = `${state.soundEnabled ? '🔊' : '🔇'} ${t(state.soundEnabled ? 'x.soundOn' : 'x.soundOff')}`;
  });
  document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => {
    setPage(button.dataset.page);
  }));
  document.getElementById('groupSelect')?.addEventListener('change', event => {
    state.group = event.target.value;
    state.draws = null;
    state.spinCount = 1;
    state.spinPhase = 'idle';
    loadData();
  });
  document.getElementById('gradeSelect')?.addEventListener('change', event => {
    state.grade = event.target.value;
    state.draws = null;
    state.spinCount = 1;
    state.spinPhase = 'idle';
    loadData();
  });
  document.getElementById('spinCount')?.addEventListener('change', event => {
    state.spinCount = Number(event.target.value) || 1;
    normalizeSpinCount();
    state.draws = null;
    state.spinPhase = 'idle';
    setMessage('');
    render();
  });
  document.getElementById('spinStudentsButton')?.addEventListener('click', spinStudents);
  document.getElementById('spinTablesButton')?.addEventListener('click', spinTables);
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
