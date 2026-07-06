'use strict';

// 唔好望落嚟 — teacher host console.
// Setup (pick set, duration) -> lobby (join code + roster) -> live board
// (mountain + ranked progress) -> results. Also a minimal question-set editor.

(function () {
  const $ = id => document.getElementById(id);
  const socket = io('/game');

  let teacherName = '老師';
  let selectedSetId = null;
  let editingSetId = null;      // null = creating new
  let roomCode = null;
  let liveTimerHandle = null;
  let gameEndsAt = null;
  let latestPositions = [];

  function show(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(screenId).classList.add('active');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------------- session ----------------
  fetch('/api/auth/me', { credentials: 'include' })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const u = data?.student;
      if (u?.name) teacherName = u.name;
    })
    .catch(() => {});

  // ---------------- question sets ----------------
  async function loadSets() {
    const el = $('setList');
    el.innerHTML = '<p class="muted">載入中…</p>';
    try {
      const res = await fetch('/api/game/teacher/sets', { credentials: 'include' });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      el.innerHTML = '';
      data.sets.forEach(set => {
        const row = document.createElement('div');
        row.className = 'set-row' + (set.id === selectedSetId ? ' selected' : '');
        row.innerHTML = `
          ${set.builtin ? '<span class="tag">內置</span>' : ''}
          <span class="title">${escapeHtml(set.title)}</span>
          <span class="count">${set.questionCount} 題</span>
          ${set.builtin ? '' : `<button class="btn secondary small" data-edit="${set.id}">✏️</button>
          <button class="btn secondary small" data-del="${set.id}" style="color:var(--coral)">🗑</button>`}
        `;
        row.addEventListener('click', (e) => {
          if (e.target.closest('[data-edit],[data-del]')) return;
          selectedSetId = set.id;
          document.querySelectorAll('.set-row').forEach(r => r.classList.remove('selected'));
          row.classList.add('selected');
          $('createRoomBtn').disabled = false;
        });
        row.querySelector('[data-edit]')?.addEventListener('click', () => openEditor(set.id));
        row.querySelector('[data-del]')?.addEventListener('click', async () => {
          if (!confirm(`確定刪除「${set.title}」？`)) return;
          await fetch(`/api/game/teacher/sets/${set.id}`, { method: 'DELETE', credentials: 'include' });
          if (selectedSetId === set.id) { selectedSetId = null; $('createRoomBtn').disabled = true; }
          loadSets();
        });
        el.appendChild(row);
      });
      if (!data.dbAvailable) {
        const note = document.createElement('p');
        note.className = 'muted';
        note.style.marginTop = '8px';
        note.textContent = '⚠️ 資料庫未連接，暫時只可使用內置示範題庫。';
        el.appendChild(note);
      }
    } catch (e) {
      el.innerHTML = `<p class="error-msg">${escapeHtml(e.message || '載入失敗')}</p>`;
    }
  }
  loadSets();

  // ---------------- set editor ----------------
  function questionBlock(q = {}) {
    const div = document.createElement('div');
    div.className = 'editor-q';
    const choices = q.choices || ['', '', '', ''];
    div.innerHTML = `
      <div class="q-num"></div>
      <button class="del-q" title="刪除題目">✕</button>
      <input type="text" class="q-question" maxlength="200" placeholder="題目，例如：7 × 8 = ?" value="${escapeHtml(q.question || '')}">
      ${[0, 1, 2, 3].map(i => `
        <div class="choice-line">
          <input type="radio" name="" value="${i}" ${q.correctIndex === i ? 'checked' : ''} title="正確答案">
          <input type="text" class="q-choice-input" maxlength="80" placeholder="選項 ${['A', 'B', 'C', 'D'][i]}${i >= 2 ? '（可留空）' : ''}" value="${escapeHtml(choices[i] || '')}">
        </div>`).join('')}
    `;
    div.querySelector('.del-q').addEventListener('click', () => { div.remove(); renumber(); });
    return div;
  }

  function renumber() {
    [...$('editorQuestions').children].forEach((div, i) => {
      div.querySelector('.q-num').textContent = `第 ${i + 1} 題`;
      div.querySelectorAll('input[type="radio"]').forEach(r => r.name = `correct-${i}`);
    });
  }

  function addQuestion(q) {
    $('editorQuestions').appendChild(questionBlock(q));
    renumber();
  }

  async function openEditor(setId) {
    editingSetId = setId || null;
    $('editorError').textContent = '';
    $('editorQuestions').innerHTML = '';
    if (setId) {
      $('editorTitle').textContent = '✏️ 編輯題庫';
      const res = await fetch(`/api/game/teacher/sets/${setId}`, { credentials: 'include' });
      const data = await res.json();
      if (!data.success) { alert(data.message || '載入失敗'); return; }
      $('editorSetTitle').value = data.set.title;
      data.set.questions.forEach(addQuestion);
    } else {
      $('editorTitle').textContent = '✏️ 新增題庫';
      $('editorSetTitle').value = '';
      for (let i = 0; i < 3; i++) addQuestion();
    }
    show('editorScreen');
  }

  $('newSetBtn').addEventListener('click', () => openEditor(null));
  $('addQuestionBtn').addEventListener('click', () => addQuestion());
  $('editorBackBtn').addEventListener('click', () => { loadSets(); show('setupScreen'); });

  $('saveSetBtn').addEventListener('click', async () => {
    const title = $('editorSetTitle').value.trim();
    const questions = [];
    for (const div of $('editorQuestions').children) {
      const question = div.querySelector('.q-question').value.trim();
      if (!question) continue;
      const inputs = [...div.querySelectorAll('.q-choice-input')];
      const radios = [...div.querySelectorAll('input[type="radio"]')];
      const filled = [];
      const idxMap = [];
      inputs.forEach((inp, i) => {
        const v = inp.value.trim();
        if (v) { idxMap[i] = filled.length; filled.push(v); }
      });
      const checkedIdx = radios.findIndex(r => r.checked);
      const correctIndex = checkedIdx >= 0 && idxMap[checkedIdx] !== undefined ? idxMap[checkedIdx] : -1;
      questions.push({ question, choices: filled, correctIndex });
    }
    $('editorError').textContent = '';
    try {
      const url = editingSetId ? `/api/game/teacher/sets/${editingSetId}` : '/api/game/teacher/sets';
      const res = await fetch(url, {
        method: editingSetId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title, questions }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      loadSets();
      show('setupScreen');
    } catch (e) {
      $('editorError').textContent = e.message || '儲存失敗';
    }
  });

  // ---------------- create room / lobby ----------------
  $('createRoomBtn').addEventListener('click', () => {
    $('setupError').textContent = '';
    $('createRoomBtn').disabled = true;
    socket.emit('host:create', {
      setId: selectedSetId,
      durationSec: Number($('durationSelect').value),
      hostName: teacherName,
    }, (res) => {
      $('createRoomBtn').disabled = false;
      if (!res?.ok) { $('setupError').textContent = res?.message || '建立失敗'; return; }
      roomCode = res.code;
      $('lobbyInfo').textContent = `題庫：${res.setTitle} · ${res.questionCount} 題 · ${Math.round(res.durationSec / 60)} 分鐘`;
      $('lobbyRoster').innerHTML = '<span class="muted">等待學生加入…</span>';
      $('startGameBtn').disabled = true;
      show('lobbyScreen');
    });
  });

  socket.on('lobby:roster', (players) => {
    const el = $('lobbyRoster');
    if (!players.length) {
      el.innerHTML = '<span class="muted">等待學生加入…</span>';
      $('startGameBtn').disabled = true;
      return;
    }
    el.innerHTML = players.map(p => `<span class="chip">${escapeHtml(p.name)}</span>`).join('');
    $('startGameBtn').disabled = false;
    // keep the live list in sync with joins during the game too
    renderLiveList();
  });

  $('cancelRoomBtn').addEventListener('click', () => {
    socket.emit('host:close');
    roomCode = null;
    show('setupScreen');
  });

  $('startGameBtn').addEventListener('click', () => {
    socket.emit('host:start', (res) => {
      if (!res?.ok) { $('lobbyError').textContent = res?.message || '無法開始'; return; }
      show('liveScreen');
    });
  });

  // ---------------- live board ----------------
  socket.on('game:start', ({ durationSec, startedAt }) => {
    gameEndsAt = startedAt + durationSec * 1000;
    clearInterval(liveTimerHandle);
    liveTimerHandle = setInterval(() => {
      const left = Math.max(0, (gameEndsAt - Date.now()) / 1000);
      $('liveTimer').textContent = `⏱ ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    }, 500);
  });

  socket.on('game:positions', (list) => {
    latestPositions = list;
    renderLiveList();
    renderMountain();
  });

  socket.on('game:summit', ({ name, place }) => {
    // flash could be added; the list already shows 🏔️ via f flag
  });

  function renderLiveList() {
    const el = $('liveList');
    if (!latestPositions.length) { el.innerHTML = '<p class="muted">等待玩家數據…</p>'; return; }
    const sorted = [...latestPositions].sort((a, b) => (b.f - a.f) || (b.h - a.h));
    el.innerHTML = sorted.map((p, i) => `
      <div class="live-row${p.f ? ' finished' : ''}">
        <div class="rank">${['🥇', '🥈', '🥉'][i] || (i + 1)}</div>
        <div class="name">${escapeHtml(p.name)}${p.f ? ' 🏔️' : ''}</div>
        <div class="bar"><div style="width:${Math.round(p.h * 100)}%"></div></div>
        <div class="pct">${Math.round(p.h * 100)}%</div>
      </div>`).join('');
  }

  function renderMountain() {
    const canvas = $('mountainCanvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    // sky
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#131c33');
    grad.addColorStop(0.4, '#3d6a9e');
    grad.addColorStop(1, '#aee3ff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // mountain silhouette
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(W * 0.5, 26);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    // summit flag
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🚩', W / 2, 22);
    // player dots
    for (const p of latestPositions) {
      const y = H - 14 - p.h * (H - 44);
      const x = W / 2 + ((hash(p.name) % 60) - 30);
      ctx.font = '15px sans-serif';
      ctx.fillText(p.f ? '🏆' : '🔵', x, y);
    }
  }

  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  // ---------------- game over ----------------
  socket.on('game:over', ({ reason, leaderboard }) => {
    clearInterval(liveTimerHandle);
    const reasons = { time: '時間到！', host: '老師結束咗遊戲', 'all-finished': '全部玩家都到達山頂！' };
    $('resultReason').textContent = reasons[reason] || '';
    const list = $('resultsList');
    list.innerHTML = leaderboard.map(row => `
      <div class="result-row${row.rank <= 3 ? ` top${row.rank}` : ''}">
        <div class="rank">${['🥇', '🥈', '🥉'][row.rank - 1] || row.rank}</div>
        <div class="name">${escapeHtml(row.name)}${row.finished ? ' 🏔️' : ''}</div>
        <div class="stat">✅${row.correct} ❌${row.wrong}</div>
        <div class="height">${Math.round(row.bestHeight * 100)}%</div>
      </div>`).join('');
    show('resultScreen');
  });

  $('endGameBtn').addEventListener('click', () => {
    if (confirm('確定結束遊戲？')) socket.emit('host:end');
  });

  $('playAgainBtn').addEventListener('click', () => {
    socket.emit('host:close');
    roomCode = null;
    latestPositions = [];
    loadSets();
    show('setupScreen');
  });

  socket.on('room:closed', () => { /* host initiated; nothing to do */ });
})();
