const { t } = window.BuiI18n;
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const host = location.pathname.includes('/host');
const preview = location.pathname.endsWith('/preview');
const storageKey = host ? 'buio:quiz:host' : 'buio:quiz:player';
const letters = ['A', 'B', 'C', 'D'];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const text = (key, values) => escapeHtml(t(key, values));
let state = null, identity = null, busy = false, connected = false, pending = false, selectedBar = null, renderKey = '';
let clockOffset = 0, errorTimer = null;
let saved;
try { saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { saved = null; }
const playerToken = saved?.playerToken || crypto.randomUUID();
const socket = window.io('/quiz', { autoConnect: false, auth: { preview } });

function save(value) {
  saved = value;
  try { if (value) sessionStorage.setItem(storageKey, JSON.stringify(value)); else sessionStorage.removeItem(storageKey); } catch {}
}

function error(message) {
  clearTimeout(errorTimer);
  $('error').textContent = message;
  $('error').hidden = false;
  errorTimer = setTimeout(() => { $('error').hidden = true; }, 7000);
}

function emit(event, data = {}) {
  return new Promise((resolve, reject) => socket.timeout(8000).emit(event, data, (failure, response) => {
    if (failure) return reject(new Error(t('qm.failed')));
    if (!response?.ok) return reject(new Error(response?.message || t('qm.failed')));
    resolve(response);
  }));
}

function button(id, key, className = 'primary', disabled = false) {
  return `<button id="${id}" class="${className}" type="button" ${disabled ? 'disabled' : ''}>${text(key)}</button>`;
}

function controls(html = '') {
  $('controls').innerHTML = html;
  $('controls').hidden = !html;
  $('endBtn')?.addEventListener('click', () => { if (confirm(t('qm.confirmEnd'))) action('host:end'); });
  $('closeBtn')?.addEventListener('click', () => { if (confirm(t('qm.confirmClose'))) action('host:close'); });
  $('nextBtn')?.addEventListener('click', () => action('host:next'));
  $('revealBtn')?.addEventListener('click', () => action('host:reveal'));
  $('scoresBtn')?.addEventListener('click', () => action('host:leaderboard'));
  $('finishBtn')?.addEventListener('click', () => action('host:end'));
}

async function action(event) {
  if (busy || !connected) return;
  busy = true;
  $('controls').querySelectorAll('button').forEach(b => { b.disabled = true; });
  try { await emit(event); } catch (e) { error(e.message); }
  finally { busy = false; if (state) render(); }
}

function applyState(next) {
  if (state?.roundId !== next.roundId) { selectedBar = null; pending = false; }
  const previous = renderKey;
  state = next;
  clockOffset = state.serverNow - Date.now();
  renderKey = `${state.phase}:${state.roundId}:${state.hostConnected}:${state.me?.choice}`;
  $('roomPin').hidden = false;
  $('pinValue').textContent = state.code;
  $('identity').textContent = host ? state.hostName : state.me.name;
  if (host && state.phase === 'question' && previous === renderKey) updateClock(); else render();
  updateConnection();
}

function updateConnection() {
  const message = !connected ? t('qm.disconnected') : state && !state.hostConnected ? t('qm.hostOffline') : '';
  $('connectionStatus').hidden = !message;
  $('connectionStatus').textContent = message;
  updateClock();
}

function roundMeta() {
  return `<div class="round-meta"><span>${text('qm.question', { n: state.questionIndex + 1, total: state.questionCount })}</span><strong id="questionClock" class="clock" role="timer"></strong><span id="answerCount"></span></div><div class="time-track" aria-hidden="true"><div id="timeFill" class="time-fill"></div></div>`;
}

function updateClock() {
  if (!state) return;
  const now = Date.now() + clockOffset;
  const preparing = state.phase === 'question' && now < state.opensAt;
  const remaining = Math.max(0, Math.ceil((state.closesAt - now) / 1000));
  const clock = $('questionClock');
  if (clock) {
    const value = preparing ? t('qm.prepare', { n: Math.ceil((state.opensAt - now) / 1000) }) : `${remaining}s`;
    if (clock.textContent !== value) clock.textContent = value;
    clock.classList.toggle('urgent', !preparing && remaining <= 5);
  }
  if ($('answerCount')) $('answerCount').textContent = t('qm.answered', { n: state.answered, total: state.total });
  if ($('timeFill')) $('timeFill').style.transform = `scaleX(${Math.max(0, Math.min(1, (state.closesAt - now) / (state.closesAt - state.opensAt)))})`;
  if (!host && state.phase === 'question') {
    const canAnswer = connected && state.hostConnected && !preparing && now < state.closesAt && state.me.choice == null && !pending;
    document.querySelectorAll('[data-answer]').forEach(b => { b.disabled = !canAnswer; });
    const status = !state.hostConnected ? t('qm.hostOffline') : pending ? t('qm.submitting') : state.me.choice != null
      ? t('qm.submitWait', { letter: letters[state.me.choice] }) : preparing ? t('qm.prepare', { n: Math.ceil((state.opensAt - now) / 1000) })
        : remaining ? t('qm.answerNow') : t('qm.timeUp');
    if ($('playerStatus') && $('playerStatus').textContent !== status) $('playerStatus').textContent = status;
  }
  if (host && !connected) $('controls').querySelectorAll('button').forEach(b => { b.disabled = true; });
}

function scoreTable(rows) {
  return `<div class="table-wrap"><table id="scoreTable"><thead><tr><th>${text('qm.rank')}</th><th>${text('qm.student')}</th><th>${text('qm.score')}</th><th>${text('qm.correctCount')}</th><th>${text('qm.gained')}</th></tr></thead><tbody>${rows.map(row => `<tr class="${row.key === state.me?.key ? 'my-row' : row.rank <= 3 ? 'top-rank' : ''}" data-rank="${row.rank}"><td>${row.rank}</td><td>${escapeHtml(row.name)}${row.connected ? '' : `<small> · ${text('qm.offline')}</small>`}</td><td class="score-value">${row.score.toLocaleString()}</td><td>${row.correct}</td><td class="gain">+${row.gained}</td></tr>`).join('')}</tbody></table></div>`;
}

function podium() {
  const rows = state.leaderboard || [];
  return `<div class="podium">${[rows[1], rows[0], rows[2]].filter(Boolean).map(row => `<div class="podium-place ${row.rank === 1 ? 'first' : row.rank === 3 ? 'third' : ''}"><span class="podium-name">${escapeHtml(row.name)}</span><div class="podium-step"><strong>${row.rank}</strong><span>${text('qm.points', { n: row.score.toLocaleString() })}</span></div></div>`).join('')}</div>`;
}

function renderHost() {
  if (state.phase === 'lobby') {
    const connectedCount = state.roster.filter(p => p.connected).length;
    $('main').innerHTML = `<section class="lobby"><div class="lobby-heading"><h1>${escapeHtml(state.setTitle)}</h1><strong>${text('qm.players', { n: connectedCount })}</strong></div><div class="lobby-meta"><span>${text('qm.questionCount', { n: state.questionCount })}</span><span>${text('qm.waiting')}</span></div>${state.roster.length ? `<ul id="roster" class="roster">${state.roster.map(p => `<li class="${p.connected ? '' : 'offline'}"><i class="presence" aria-hidden="true"></i>${escapeHtml(p.name)}</li>`).join('')}</ul>` : `<div class="waiting-state">${text('qm.empty')}</div>`}</section>`;
    controls(`${button('closeBtn', 'qm.close', 'secondary danger')}${button('nextBtn', 'qm.start', 'primary', !connectedCount)}`);
  } else if (state.phase === 'question') {
    const q = state.question;
    $('main').innerHTML = `<section class="question-stage">${roundMeta()}<div class="question-content"><div><h1 id="questionText">${escapeHtml(q.question)}</h1>${q.image ? `<figure class="question-media"><img id="questionImage" src="${escapeHtml(q.image)}" alt="${text('qm.image')}"></figure>` : ''}</div></div><div class="answer-grid host-choices">${q.choices.map((choice, index) => `<div class="choice choice-${letters[index].toLowerCase()}"><span class="choice-letter">${letters[index]}</span><span class="choice-text">${escapeHtml(choice)}</span></div>`).join('')}</div></section>`;
    $('questionImage')?.addEventListener('error', event => {
      const p = document.createElement('p'); p.className = 'image-error'; p.textContent = t('qm.imageFailed'); event.target.replaceWith(p);
    });
    controls(`${button('endBtn', 'qm.end', 'secondary danger')}${button('revealBtn', 'qm.reveal', 'secondary')}`);
  } else if (state.phase === 'results') {
    const max = Math.max(1, ...state.distribution.map(d => d.voters.length));
    $('main').innerHTML = `<section><div class="result-heading"><div><span class="question-count">${text('qm.question', { n: state.questionIndex + 1, total: state.questionCount })}</span><h1 class="section-title">${text('qm.results')}</h1></div><span class="correct-label">${text('qm.correct', { letter: letters[state.correctIndex] })}</span></div><p class="section-subtitle">${escapeHtml(state.question.question)}</p><div id="distributionChart" class="chart" role="group" aria-label="${text('qm.results')}">${state.distribution.map((d, index) => `<button class="bar-button choice-${letters[index].toLowerCase()}" data-bar="${index}" type="button" aria-pressed="${selectedBar === index}" aria-label="${text('qm.barLabel', { letter: letters[index], n: d.voters.length })}"><span class="bar-count">${d.voters.length}</span><span class="bar-fill" style="--bar-height:${Math.max(4, d.voters.length / max * 72)}%"></span><span class="bar-caption">${letters[index]}${index === state.correctIndex ? ' ✓' : ''}</span></button>`).join('')}</div><div class="distribution-choices">${state.question.choices.map(c => `<span>${escapeHtml(c)}</span>`).join('')}</div><button id="unansweredBtn" class="unanswered-button" type="button">${text('qm.unanswered', { n: state.unanswered.length })}</button><div id="voterDetails" class="voters" aria-live="polite" hidden></div></section>`;
    document.querySelectorAll('[data-bar]').forEach(b => b.addEventListener('click', () => { selectedBar = Number(b.dataset.bar); renderVoters(); }));
    $('unansweredBtn').onclick = () => { selectedBar = 'unanswered'; renderVoters(); };
    if (selectedBar != null) renderVoters();
    controls(`${button('endBtn', 'qm.end', 'secondary danger')}${button('scoresBtn', 'qm.scores')}`);
  } else {
    const ended = state.phase === 'ended';
    $('main').innerHTML = `<section><div class="score-heading"><h1 class="section-title">${text(ended ? 'qm.final' : 'qm.currentScores')}</h1>${button('exportBtn', 'qm.export', 'secondary')}</div>${ended ? podium() : `<p class="section-subtitle">${text('qm.question', { n: state.questionIndex + 1, total: state.questionCount })}</p>`}${scoreTable(state.leaderboard || [])}</section>`;
    $('exportBtn').onclick = exportScores;
    controls(ended ? button('closeBtn', 'qm.close', 'secondary') : `${button('endBtn', 'qm.end', 'secondary danger')}${state.questionIndex + 1 < state.questionCount ? button('nextBtn', 'qm.next') : button('finishBtn', 'qm.finish')}`);
  }
}

function renderVoters() {
  const unanswered = selectedBar === 'unanswered';
  const voters = unanswered ? state.unanswered : state.distribution[selectedBar].voters;
  $('voterDetails').hidden = false;
  $('voterDetails').innerHTML = `<h2>${text(unanswered ? 'qm.unanswered' : 'qm.voters', { letter: letters[selectedBar], n: voters.length })}</h2>${voters.length ? `<ul class="voter-list">${voters.map(v => `<li>${escapeHtml(v.name)}${unanswered ? '' : `<span>${text('qm.points', { n: v.points })} · ${(v.responseMs / 1000).toFixed(1)}s</span>`}</li>`).join('')}</ul>` : `<p>${text('qm.none')}</p>`}`;
  document.querySelectorAll('[data-bar]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.bar) === selectedBar)));
}

function renderStudent() {
  controls();
  if (state.phase === 'lobby') {
    $('main').innerHTML = `<section class="waiting-state"><h1>${text('qm.waiting')}</h1><p>${escapeHtml(state.setTitle)}</p><strong>${escapeHtml(state.me.name)}</strong></section>`;
  } else if (state.phase === 'question' || state.phase === 'results') {
    const result = state.me.result;
    const revealed = state.phase === 'results';
    const message = revealed ? t(result?.correct ? 'qm.right' : result?.choice == null ? 'qm.noAnswer' : 'qm.wrong') : '';
    $('main').innerHTML = `<section><div class="player-top"><span>${text('qm.question', { n: state.questionIndex + 1, total: state.questionCount })}</span><strong class="personal-score">${text('qm.points', { n: state.me.score.toLocaleString() })}</strong>${revealed ? '' : '<strong id="questionClock" class="clock" role="timer"></strong>'}</div><div id="playerStatus" class="player-status" role="status">${escapeHtml(message)}</div>${revealed ? `<div class="personal-result"><strong>+${result?.points || 0}</strong><span>${text('qm.personalRank', { n: state.me.rank })}</span></div>` : ''}<div id="answerPad" class="answer-grid answer-pad">${letters.map((letter, index) => `<button type="button" class="choice choice-${letter.toLowerCase()} ${state.me.choice === index ? 'is-selected' : ''} ${revealed && state.correctIndex === index ? 'is-correct' : ''}" data-answer="${index}" aria-label="${letter}" aria-pressed="${state.me.choice === index}" disabled><span class="choice-letter">${letter}</span></button>`).join('')}</div></section>`;
    document.querySelectorAll('[data-answer]').forEach(b => b.addEventListener('click', () => answer(Number(b.dataset.answer))));
  } else {
    const ended = state.phase === 'ended';
    $('main').innerHTML = `<section><h1 class="section-title">${text(ended ? 'qm.final' : 'qm.currentScores')}</h1><div class="personal-result"><strong>${text('qm.points', { n: state.me.score.toLocaleString() })}</strong><span>${text('qm.personalRank', { n: state.me.rank })}</span></div>${ended ? podium() : ''}${scoreTable(state.leaderboard || [])}</section>`;
  }
}

function render() {
  if (!state) return;
  $('main').classList.toggle('player-main', !host);
  if (host) renderHost(); else renderStudent();
  updateClock();
}

async function answer(choice) {
  if (pending || !connected || !state?.hostConnected || state.phase !== 'question' || state.me.choice != null) return;
  pending = true; updateClock();
  const roundId = state.roundId;
  try { await emit('player:answer', { roundId, choice }); }
  catch (e) { error(e.message); }
  finally { pending = false; updateClock(); }
}

function exportScores() {
  const cell = value => `"${String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""')}"`;
  const rows = [[t('qm.rank'), t('qm.student'), t('qm.score'), t('qm.correctCount'), t('qm.gained')],
    ...(state.leaderboard || []).map(p => [p.rank, p.name, p.score, p.correct, p.gained])];
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `BuiO-quiz-${state.code}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function setupHost() {
  controls();
  const response = await fetch('/api/games/sets', { credentials: 'include', headers: preview ? { 'x-buio-preview': '1' } : {} });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.message || t('qm.failed'));
  const sets = data.sets.filter(set => set.games.includes('quiz'));
  $('main').innerHTML = `<section class="setup"><h1>${text('qm.title')}</h1><form id="setupForm"><label class="field">${text('qm.bank')}<select id="bankSelect">${sets.map(set => `<option value="${escapeHtml(set.id)}">${escapeHtml(set.title)} (${set.questionCount})</option>`).join('')}</select></label><div class="setup-row"><label class="field">${text('qm.seconds')}<select id="secondsSelect">${[5, 10, 15, 20, 30, 45, 60, 90, 120].map(n => `<option value="${n}" ${n === 20 ? 'selected' : ''}>${text('qm.secondsValue', { n })}</option>`).join('')}</select></label><label class="field">${text('qm.limit')}<select id="limitSelect"><option value="0">${text('qm.all')}</option>${[5, 10, 20].map(n => `<option value="${n}">${text('qm.questionCount', { n })}</option>`).join('')}</select></label></div><button id="createBtn" class="primary" type="submit">${text('qm.create')}</button></form></section>`;
  $('setupForm').onsubmit = async event => {
    event.preventDefault(); $('createBtn').disabled = true;
    try { await create({ setId: $('bankSelect').value, seconds: $('secondsSelect').value, limit: $('limitSelect').value }); }
    catch (e) { error(e.message); if ($('createBtn')) $('createBtn').disabled = false; }
  };
}

async function create(settings) {
  const result = await emit('host:create', { ...settings, hostName: identity?.name || t('qm.teacher') });
  save({ code: result.code, hostToken: result.hostToken });
  applyState(result.state);
}

function setupStudent() {
  controls();
  $('main').innerHTML = `<section class="setup"><h1>${text('qm.join')}</h1><form id="joinForm"><label class="field">${text('qm.code')}<input id="codeInput" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" value="${escapeHtml(params.get('room') || saved?.code || '')}" required></label><label class="field">${text('qm.name')}<input id="nameInput" maxlength="30" autocomplete="name" value="${escapeHtml(saved?.name || identity?.name || (preview ? params.get('name') : '') || t('qm.previewStudent', { n: Math.floor(1000 + Math.random() * 9000) }))}" required></label><button id="joinBtn" class="primary" type="submit">${text('qm.join')}</button></form></section>`;
  $('joinForm').onsubmit = async event => {
    event.preventDefault(); $('joinBtn').disabled = true;
    try { await join($('codeInput').value, $('nameInput').value); }
    catch (e) { error(e.message); if ($('joinBtn')) $('joinBtn').disabled = false; }
  };
  if (params.get('room') && params.get('autojoin') === '1') $('joinForm').requestSubmit();
}

async function join(code, name) {
  const result = await emit('player:join', { code: code.trim(), name: name.trim(), playerToken });
  save({ code: code.trim(), name: name.trim(), playerToken });
  applyState(result.state);
}

socket.on('quiz:state', applyState);
socket.on('quiz:progress', update => {
  if (state?.phase === 'question' && update.roundId === state.roundId) { Object.assign(state, update); updateClock(); }
});
socket.on('disconnect', () => { connected = false; updateConnection(); });
socket.on('connect_error', e => {
  connected = false; updateConnection(); error(e.message || t('qm.failed'));
  if (!state) {
    $('main').innerHTML = `<div class="waiting-state"><h1>${text('qm.failed')}</h1>${button('retryBtn', 'qm.retry', 'secondary')}</div>`;
    $('retryBtn').onclick = () => socket.connect();
  }
});
socket.on('quiz:replaced', () => {
  save(null); state = null; socket.disconnect();
  $('roomPin').hidden = true; controls();
  $('main').innerHTML = `<div class="waiting-state"><h1>${text('qm.replaced')}</h1><a href="${preview ? '/games/preview?role=student' : '/games'}">${text('qm.back')}</a></div>`;
});
socket.on('quiz:closed', () => {
  save(null); state = null; renderKey = ''; $('roomPin').hidden = true; controls();
  $('main').innerHTML = `<div class="waiting-state"><h1>${text('qm.closed')}</h1><a href="${preview ? `/games/preview?role=${host ? 'teacher' : 'student'}` : '/games'}">${text('qm.back')}</a></div>`;
});
socket.on('connect', async () => {
  connected = true; updateConnection();
  try {
    if (saved?.code && (host || !params.get('room') || params.get('room') === saved.code)) {
      try {
        if (host) { const result = await emit('host:resume', saved); applyState(result.state); }
        else await join(saved.code, saved.name);
        return;
      } catch { save(null); state = null; renderKey = ''; }
    }
    if (host) {
      if (params.get('autocreate') === '1') await create({ setId: params.get('setId') || 'demo', seconds: params.get('seconds'), limit: params.get('limit') });
      else await setupHost();
    } else setupStudent();
  } catch (e) { error(e.message); if (host) await setupHost().catch(failure => error(failure.message)); }
});

$('backLink').href = preview ? `/games/preview?role=${host ? 'teacher' : 'student'}` : '/games';
$('fullscreenBtn').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch (e) { error(e.message); }
};
document.addEventListener('fullscreenchange', () => { $('fullscreenBtn').textContent = t(document.fullscreenElement ? 'qm.exitFullscreen' : 'qm.fullscreen'); });
if (!document.documentElement.requestFullscreen) $('fullscreenBtn').hidden = true;
setInterval(updateClock, 100);
try {
  const response = await fetch('/api/auth/me', { credentials: 'include' });
  if (response.ok) identity = (await response.json()).student;
} catch {}
socket.connect();
