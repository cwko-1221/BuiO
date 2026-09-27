import { createClock } from './clock.js';
const app = document.querySelector('#app');
const clock = createClock();
let user, roster, session, events, busy = false, noticeTimer;
let roundOffset = null, syncing, readyKey = '', armedKey = '', lastHeartbeat = 0;
let connected = false, stateKey = '';
let studentZoomLocked = false;
function lockStudentZoom() {
  if (studentZoomLocked) return;
  studentZoomLocked = true;
  document.documentElement.classList.add('student-zoom-locked');
  document.querySelector('meta[name="viewport"]').content = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no';
  const capture = { passive: false, capture: true };
  // WebKit can ignore viewport zoom limits; cancel its gesture events as well.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) {
    document.addEventListener(type, event => event.preventDefault(), capture);
  }
  let lastTap = null;
  for (const type of ['touchstart', 'touchmove']) {
    document.addEventListener(type, event => {
      if (event.touches.length > 1) { event.preventDefault(); lastTap = null; }
    }, capture);
  }
  document.addEventListener('touchcancel', () => { lastTap = null; }, capture);
  document.addEventListener('touchend', event => {
    if (event.touches.length) { lastTap = null; return; }
    const touch = event.changedTouches[0];
    if (!touch) return;
    const now = performance.now();
    if (lastTap && now - lastTap.time < 350 && Math.abs(touch.clientX - lastTap.x) < 40 && Math.abs(touch.clientY - lastTap.y) < 40) {
      event.preventDefault();
      lastTap = null;
    } else lastTap = { time: now, x: touch.clientX, y: touch.clientY };
  }, capture);
  window.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  }, capture);
  window.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && (['+', '=', '-', '_', '0'].includes(event.key) || ['NumpadAdd', 'NumpadSubtract', 'Numpad0'].includes(event.code))) event.preventDefault();
  }, capture);
}
const english = () => user?.language === 'en-US';
const tr = (zh, en) => english() ? en : zh;
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const api = async (path, body) => {
  const response = await fetch(`/api/buzzer${path}`, { credentials: 'include', ...(body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : {}) });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.message || tr('連線失敗，請重試。', 'Connection failed. Please try again.'));
  return data;
};
function notice(message) {
  const element = document.querySelector('#notice');
  element.textContent = message; element.hidden = false;
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { element.hidden = true; }, 4500);
}
function connection(live) {
  connected = live;
  const element = document.querySelector('#connection');
  element.textContent = live ? clock.ready ? tr('● 已同步', '● Synchronized') : tr('同步中…', 'Synchronizing…') : tr('重新連線中…', 'Reconnecting…');
  element.classList.toggle('live', live);
  if (session) renderSession();
  if (live) void prepareRound();
}
async function syncClock() {
  if (!syncing) syncing = clock.sync(async () => (await api('/time')).serverNow).finally(() => { syncing = null; });
  return syncing;
}
const serverTime = () => roundOffset === null ? clock.now() : performance.now() + roundOffset;
const synchronized = () => clock.ready || roundOffset !== null;
async function unready(id = session?.id, round = session?.round) {
  if (!session || user.role !== 'student') return;
  try { accept((await api(`/sessions/${id}/actions`, { action: 'unready', round })).session); }
  catch { /* the server also detects the disconnected event stream */ }
}
async function prepareRound() {
  if (!session || user.role !== 'student' || !connected || document.hidden) return;
  const id = session.id, round = session.round;
  if (session.phase === 'preparing' && readyKey !== `${id}:${round}`) {
    readyKey = `${id}:${round}`;
    try {
      await syncClock();
      if (session.id !== id || session.round !== round || session.phase !== 'preparing' || !connected || document.hidden) return;
      accept((await api(`/sessions/${id}/actions`, { action: 'ready', round, clockReady: clock.ready, visible: true, rtt: clock.rtt })).session);
    } catch (error) { if (session.id === id && session.round === round) { notice(error.message); void unready(id, round); } }
  } else if (session.phase === 'scheduled' && armedKey !== `${id}:${round}`) {
    armedKey = `${id}:${round}`;
    if (!clock.ready || serverTime() >= session.countdownAt) { void unready(id, round); return; }
    try {
      accept((await api(`/sessions/${id}/actions`, { action: 'armed', round })).session);
    } catch (error) { if (session.id === id && session.round === round) { notice(error.message); void unready(id, round); } }
  }
}
function accept(next) {
  if (session?.id === next.id && session.revision > next.revision) return;
  if (session?.id !== next.id || session?.round !== next.round) roundOffset = null;
  session = next;
  if (['scheduled', 'countdown', 'open'].includes(next.phase) && roundOffset === null && clock.ready) roundOffset = clock.offset;
  if (['waiting', 'judged', 'ended'].includes(next.phase)) roundOffset = null;
  if (next.phase === 'ended') events?.close();
  renderSession();
  void prepareRound();
}
async function enter(id) {
  events?.close(); stateKey = ''; connected = false; readyKey = ''; armedKey = ''; roundOffset = null;
  clock.invalidate(); await syncClock();
  if (user.role === 'student') accept((await api(`/sessions/${id}/actions`, { action: 'join' })).session);
  else accept((await api(`/sessions/${id}`)).session);
  history.replaceState(null, '', `/buzzer?session=${encodeURIComponent(id)}`);
  connection(false);
  events = new EventSource(`/api/buzzer/sessions/${id}/events`);
  events.onopen = () => { lastHeartbeat = performance.now(); connection(true); };
  events.onerror = () => { connection(false); clock.invalidate(); void unready(); };
  events.addEventListener('heartbeat', () => { lastHeartbeat = performance.now(); });
  events.onmessage = event => {
    try { accept(JSON.parse(event.data)); } catch { notice(tr('未能更新課堂。', 'Could not update the classroom.')); }
  };
}
async function act(action, extra = {}) {
  if (busy || !connected || !synchronized() || document.hidden) return;
  busy = true; stateKey = ''; renderSession();
  try { accept((await api(`/sessions/${session.id}/actions`, { action, round: session.round, ...extra })).session); }
  catch (error) {
    notice(error.message);
    try { accept((await api(`/sessions/${session.id}`)).session); } catch { /* reconnect will recover */ }
  } finally { busy = false; stateKey = ''; renderSession(); }
}
function phase() {
  if (['countdown', 'open'].includes(session.phase)) {
    if (!synchronized() || roundOffset === null || serverTime() < session.countdownAt) return 'scheduled';
    return serverTime() >= session.opensAt ? 'open' : 'countdown';
  }
  return session.phase;
}
function remaining() { return Math.min(3, Math.max(1, Math.ceil((session.opensAt - serverTime()) / 1000))); }
function renderSession() {
  if (!session) return;
  const current = phase();
  const key = `${session.id}:${session.revision}:${current}:${current === 'countdown' ? remaining() : 0}:${busy}:${connected}:${clock.ready}:${document.hidden}`;
  if (key === stateKey) return;
  stateKey = key;
  app.dataset.phase = current; app.dataset.round = session.round;
  const teacher = user.role === 'teacher';
  app.classList.toggle('student-main', !teacher);
  if (teacher) renderTeacher(current); else renderStudent(current);
  document.querySelectorAll('[data-action]').forEach(button => {
    const activate = () => {
      const action = button.dataset.action;
      void act(action === 'correct' || action === 'wrong' ? 'judge' : action,
        action === 'correct' || action === 'wrong' ? { correct: action === 'correct' } : {});
    };
    if (button.dataset.action === 'buzz') {
      button.addEventListener('pointerdown', event => { if (event.button === 0) { event.preventDefault(); activate(); } });
      button.addEventListener('click', event => { if (event.detail === 0) activate(); });
    } else button.addEventListener('click', activate);
  });
}
const button = (action, text, style = 'primary', disabled = false) => `<button type="button" class="${style}" data-action="${action}" ${disabled || busy || !connected || !synchronized() || document.hidden ? 'disabled' : ''}>${text}</button>`;
function renderTeacher(current) {
  let stage;
  if (current === 'waiting') stage = `<div class="stage-symbol">ϟ</div><h2>${tr('準備下一題', 'Ready for a question')}</h2><p>${session.syncMessage ? tr(esc(session.syncMessage), 'A student went offline or was not synchronized. Check everyone is ready, then try again.') : tr('口頭提問後按「搶答」，全班同步倒數 3 秒後便可搶答。', 'Ask your question, then press Buzz. Students can buzz after a synchronized 3-second countdown.')}</p>${button('start', tr('搶答', 'Buzz'), 'primary', !session.participantCount)}`;
  else if (current === 'preparing' || current === 'scheduled') stage = `<div class="stage-symbol">ϟ</div><h2>${tr('等待全班同步', 'Synchronizing the class')}</h2><p>${tr(`已準備 ${session.readyCount} / ${session.participantCount} 人`, `${session.readyCount} / ${session.participantCount} students ready`)}${current === 'preparing' && session.waitingFor?.length ? `<br>${tr('等待：', 'Waiting: ')}${session.waitingFor.map(esc).join('、')}` : ''}</p>${button('cancel', tr('取消本題', 'Cancel question'), 'cancel')}`;
  else if (current === 'countdown') stage = `<div class="countdown" role="timer">${remaining()}</div><p>${tr('倒數後開放搶答', 'Buzzing opens after the countdown')}</p>${button('cancel', tr('取消本題', 'Cancel question'), 'cancel')}`;
  else if (current === 'open') stage = `<div class="stage-symbol">ϟ</div><h2>${tr('等待學生搶答', 'Waiting for a buzz')}</h2><p>${tr('首位搶答的同學會即時顯示在這裡。', 'The first student to buzz will appear here.')}</p>${button('cancel', tr('取消本題', 'Cancel question'), 'cancel')}`;
  else if (current === 'claimed' || current === 'judged') stage = `<span class="eyebrow">${tr('成功搶答', 'FIRST TO BUZZ')}</span><div class="winner-name">${esc(session.winner?.name)}</div>${current === 'claimed'
    ? `<p>${tr('請判斷同學的答案', 'Judge the student’s answer')}</p><div class="judging">${button('correct', tr('✓ 正確', '✓ Correct'), 'correct')}${button('wrong', tr('✕ 錯誤', '✕ Incorrect'), 'wrong')}</div>${button('cancel', tr('取消本題', 'Cancel question'), 'cancel')}`
    : `<p>${session.verdict ? tr(`答對了！已加入 ${session.points} pet-app 金幣`, `Correct! ${session.points} pet-app coins awarded`) : tr('答案錯誤，本題不加分', 'Incorrect. No points awarded.')}</p>${button('start', tr('下一題 · 搶答', 'Next question · Buzz'))}`}`;
  else stage = `<div class="stage-symbol">✓</div><h2>${tr('課堂已結束', 'Class ended')}</h2><p>${tr('已獲得的分數已加入學生的 pet-app 金幣。', 'Earned points have been added to students’ pet-app coins.')}</p><a class="primary" href="/buzzer">${tr('開啟新課堂', 'Open a new class')}</a>`;
  app.innerHTML = `<div class="session-head"><div><h1>${tr('搶答課堂', 'Buzz classroom')}</h1><p class="muted">${esc(session.targetLabel)} · ${tr(`每題 ${session.points} 分 / 金幣`, `${session.points} points / coins per question`)}</p></div>${current !== 'ended' ? button('end', tr('結束課堂', 'End class'), 'end') : ''}</div>
    <div class="teacher-layout"><section class="panel stage" aria-live="polite"><div class="round-label">${tr(`第 ${session.round || 1} 題`, `Question ${session.round || 1}`)}</div>${stage}</section><aside class="panel roster"><h2>${tr('已加入學生', 'Joined students')} <span class="muted">${session.participantCount}</span></h2><div class="roster-list">${[...(session.participants || [])].sort((a, b) => b.score - a.score).map(row => `<div class="participant"><div>${esc(row.name)}<small>${tr(`成功搶答 ${row.successes} 次`, `${row.successes} successful buzzes`)}</small></div><b>${row.score} ${tr('分', 'pts')}</b></div>`).join('') || `<p class="roster-empty">${tr('學生可從平台「課堂」加入。', 'Students can join from Classes on the portal.')}</p>`}</div></aside></div>`;
}
function renderStudent(current) {
  lockStudentZoom();
  let content;
  if (current === 'waiting') content = `<h1>${tr('等待問題', 'Waiting for a question')}</h1>`;
  else if (current === 'preparing' || current === 'scheduled') content = `<h1>${tr('準備搶答', 'Get ready to buzz')}</h1><p>${tr('等待全班同步', 'Synchronizing the class')}</p>`;
  else if (current === 'countdown') content = `<div class="countdown" role="timer">${remaining()}</div><p>${tr('準備搶答', 'Get ready to buzz')}</p>`;
  else if (current === 'open') content = `${button('buzz', tr('搶答', 'Buzz'), 'buzz-button')}<p style="margin-top:30px">${tr('按下按鈕，爭取回答！', 'Press the button to answer!')}</p>`;
  else if (current === 'claimed') content = session.winner?.studentId === user.id
    ? `<div class="stage-symbol" style="margin:0 auto 24px">✓</div><h1>${tr('你成功搶答！', 'You buzzed first!')}</h1><p>${tr('請回答老師的問題', 'Answer your teacher’s question')}</p>`
    : `<h1>${tr('等待問題', 'Waiting for a question')}</h1><p>${tr('已有同學搶答，等待老師。', 'A classmate buzzed first. Wait for your teacher.')}</p>`;
  else if (current === 'judged') content = session.winner?.studentId === user.id
    ? `<h1>${session.verdict ? tr(`答對了！+${session.points} 金幣`, `Correct! +${session.points} coins`) : tr('本題不加分', 'No points this time')}</h1><p>${tr('等待下一題', 'Waiting for the next question')}</p>`
    : `<h1>${tr('等待問題', 'Waiting for a question')}</h1>`;
  else content = `<h1>${tr('課堂已結束', 'Class ended')}</h1><p>${tr('所得分數已加入你的 pet-app 金幣', 'Your points have been added to your pet-app coins')}</p><a class="primary" href="/">${tr('返回平台', 'Back to portal')}</a>`;
  app.innerHTML = `<section class="student-room"><div class="student-stats">${tr('成功搶答數', 'Successful buzzes')} <strong id="successes">${session.me?.successes || 0}</strong><br>${tr('得到分數', 'Points earned')} <strong id="score">${session.me?.score || 0}</strong> · ${tr('金幣', 'coins')}</div><div class="student-stage" aria-live="polite">${content}</div></section>`;
}
function renderSetup() {
  app.innerHTML = `<section class="setup"><span class="eyebrow">${tr('全班一起，準備搶答', 'READY, SET, BUZZ')}</span><h1>${tr('開啟搶答課堂', 'Open a buzz classroom')}</h1><p class="lead">${tr('選擇班級及組別，答對即可獲得 pet-app 金幣。', 'Choose a class and group. Correct answers earn pet-app coins.')}</p><form class="panel" id="setupForm"><h2>${tr('課堂設定', 'Class settings')}</h2><div class="form-grid">
    <label>${tr('班級', 'Class')}<select id="className" required>${roster.classes.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('')}</select></label>
    <label>${tr('組別', 'Group')}<select id="groupField"><option value="">${tr('全班', 'Whole class')}</option><option value="chineseGroup">${tr('中文組別', 'Chinese group')}</option><option value="englishGroup">${tr('英文組別', 'English group')}</option><option value="mathGroup">${tr('數學組別', 'Math group')}</option></select></label>
    <label id="groupLabel" hidden>${tr('選擇組別', 'Choose group')}<select id="groupName"></select></label>
    <label>${tr('每題分數', 'Points per question')}<input id="points" type="number" min="1" max="10000" step="1" value="10" required><span class="hint">${tr('1 分 = 1 pet-app 金幣', '1 point = 1 pet-app coin')}</span></label></div><div class="recipients" id="recipients"></div><button class="primary" type="submit" id="createClass">${tr('開始課堂', 'Start class')}</button></form></section>`;
  const classInput = document.querySelector('#className'), fieldInput = document.querySelector('#groupField'), groupInput = document.querySelector('#groupName');
  function selected() { return roster.students.filter(row => row.className === classInput.value && (!fieldInput.value || row[fieldInput.value] === groupInput.value)); }
  function preview() {
    const students = selected();
    document.querySelector('#recipients').textContent = tr(`共 ${students.length} 人`, `${students.length} students`) + (students.length ? ` · ${students.map(row => row.name).join('、')}` : '');
    document.querySelector('#createClass').disabled = !students.length;
  }
  function groups() {
    document.querySelector('#groupLabel').hidden = !fieldInput.value;
    const names = [...new Set(roster.students.filter(row => row.className === classInput.value).map(row => row[fieldInput.value]).filter(Boolean))].sort();
    groupInput.innerHTML = names.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
    preview();
  }
  classInput.addEventListener('change', groups); fieldInput.addEventListener('change', groups); groupInput.addEventListener('change', preview); groups();
  document.querySelector('#setupForm').addEventListener('submit', async event => {
    event.preventDefault();
    const submit = document.querySelector('#createClass'); submit.disabled = true;
    try {
      const data = await api('/sessions', { className: classInput.value, groupField: fieldInput.value,
        groupName: fieldInput.value ? groupInput.value : '', points: Number(document.querySelector('#points').value) });
      await enter(data.session.id);
    } catch (error) { notice(error.message); submit.disabled = false; }
  });
}
async function renderList() {
  const { sessions } = await api('/sessions');
  app.innerHTML = `<h1>${tr('課堂', 'Classes')}</h1><p class="lead">${tr('選擇老師的搶答課堂加入。', 'Join your teacher’s buzz classroom.')}</p><div class="student-list">${sessions.map(row => `<section class="panel class-card"><div><h2>${esc(row.teacherName)}</h2><p class="muted">${esc(row.roomCode)} · ${tr('搶答課堂', 'Buzz classroom')}</p></div><button class="primary" data-join="${row.id}">${tr('加入課堂', 'Join class')}</button></section>`).join('') || `<section class="panel"><p class="muted">${tr('等待老師開啟課堂', 'Waiting for your teacher to open a class')}</p></section>`}</div>`;
  document.querySelectorAll('[data-join]').forEach(button => button.addEventListener('click', () => enter(button.dataset.join).catch(error => notice(error.message))));
}
async function init() {
  const response = await fetch('/api/auth/me');
  const data = await response.json();
  if (!response.ok || !data.student) { location.href = '/'; return; }
  user = data.student;
  document.documentElement.lang = english() ? 'en-US' : 'zh-HK';
  document.querySelector('#back').textContent = tr('← 返回平台', '← Back to portal');
  document.querySelector('#title').textContent = tr('搶答課堂', 'Buzz classroom');
  const id = new URL(location.href).searchParams.get('session');
  if (id) await enter(id);
  else if (user.role === 'teacher') {
    const active = (await api('/sessions')).sessions[0];
    if (active) await enter(active.id);
    else { roster = await api('/roster'); await syncClock(); connection(true); renderSetup(); }
  } else { connection(true); await renderList(); }
}
function frame() {
  if (session && !document.hidden) renderSession();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(() => {
  if (!session && user?.role === 'student' && !document.hidden) void renderList().catch(() => {});
  if (session && connected && performance.now() - lastHeartbeat > 4000) {
    events?.close(); connection(false); clock.invalidate(); void unready();
    setTimeout(() => { void enter(session.id).catch(error => notice(error.message)); }, 500);
  }
  if (session && connected && ['waiting', 'judged', 'claimed', 'countdown', 'open'].includes(session.phase) && !clock.ready) {
    void syncClock().then(() => connection(true)).catch(error => notice(error.message));
  }
}, 1000);
document.addEventListener('visibilitychange', () => {
  if (!session) return;
  if (document.hidden) { events?.close(); connection(false); clock.invalidate(); void unready(); }
  else void enter(session.id).catch(error => notice(error.message));
});
window.addEventListener('pagehide', () => events?.close());
window.addEventListener('pageshow', event => { if (event.persisted && session) void enter(session.id).catch(error => notice(error.message)); });
init().catch(error => { notice(error.message); app.innerHTML = `<div class="loading">${tr('未能開啟課堂。', 'Could not open classroom.')} <a href="/buzzer">${tr('重試', 'Retry')}</a></div>`; });
