'use strict';

// 唔好望落嚟 — student game client.
// Physics runs locally (client-authoritative positions, server-authoritative
// questions/energy grants); positions stream to the server which fans them
// out to the host board and other players as ghosts.

(function () {
  const $ = id => document.getElementById(id);

  // ---------------- tuning ----------------
  const GRAVITY = 2300;          // u/s^2
  const MOVE_SPEED = 265;        // u/s
  const JUMP_VEL = 860;          // u/s  (max jump height ≈ 160 > max layer gap)
  const PLAYER_W = 30, PLAYER_H = 40;
  const ENERGY_MAX = 100;
  const MOVE_COST = 5;           // energy per second while moving
  const JUMP_COST = 8;           // energy per jump
  const COYOTE = 0.09, JUMP_BUFFER = 0.12;
  const VIEW_H = 780;            // world units visible vertically
  const NET_SEND_MS = 120;

  const AVATARS = ['🐸','🐧','🦊','🐼','🐯','🐨','🐰','🦁','🐷','🐻','🐹','🦄'];

  // ---------------- state ----------------
  const socket = io('/game');
  let me = { name: '', studentId: null };
  let map = null;
  let game = null;               // live game state
  let ghosts = new Map();        // key -> {x,y,tx,ty,name,avatar}
  let myAvatar = '🐸';

  // ---------------- screens ----------------
  function show(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(screenId).classList.add('active');
  }

  // Prefill name from the session (students arrive logged in from the portal).
  fetch('/api/auth/me', { credentials: 'include' })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const u = data?.student;
      if (u?.name) { $('nameInput').value = u.name; me.studentId = u.id || null; }
      // Join code passed in the URL (e.g. QR / portal link)
      const code = new URLSearchParams(location.search).get('code');
      if (code) $('codeInput').value = code.replace(/\D/g, '').slice(0, 6);
    })
    .catch(() => {});

  // ---------------- join flow ----------------
  $('joinBtn').addEventListener('click', join);
  $('codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
  $('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });

  function join() {
    const code = $('codeInput').value.trim();
    const name = $('nameInput').value.trim();
    if (code.length !== 6) return $('joinError').textContent = '請輸入 6 位數房間代碼';
    if (!name) return $('joinError').textContent = '請輸入名字';
    $('joinError').textContent = '';
    $('joinBtn').disabled = true;
    me.name = name;

    socket.emit('player:join', { code, name, studentId: me.studentId }, (res) => {
      $('joinBtn').disabled = false;
      if (!res?.ok) return $('joinError').textContent = res?.message || '加入失敗';
      myAvatar = AVATARS[Math.abs(hashCode(name)) % AVATARS.length];
      $('lobbySetTitle').textContent = res.setTitle || '準備中';
      $('lobbyHostName').textContent = `${res.hostName} 的遊戲房間 · ${code}`;
      if (res.phase === 'playing') {
        startGame(res.seed, res.durationSec, res.startedAt, res.resume);
      } else {
        show('lobbyScreen');
      }
    });
  }

  function hashCode(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return h;
  }

  // ---------------- socket events ----------------
  socket.on('game:start', ({ seed, durationSec, startedAt }) => {
    startGame(seed, durationSec, startedAt, null);
  });

  socket.on('game:positions', (list) => {
    if (!game) return;
    const myKey = me.studentId ? `s:${me.studentId}` : null;
    for (const p of list) {
      if (myKey ? p.id === myKey : p.name === me.name) continue;   // skip own echo
      let g = ghosts.get(p.id);
      if (!g) {
        g = { x: p.x, y: p.y, tx: p.x, ty: p.y, name: p.name, avatar: AVATARS[Math.abs(hashCode(p.name)) % AVATARS.length] };
        ghosts.set(p.id, g);
      }
      g.tx = p.x; g.ty = p.y; g.finished = p.f;
    }
  });

  socket.on('game:summit', ({ name, place }) => {
    const medals = ['🥇', '🥈', '🥉'];
    toast(`${medals[place - 1] || '🏔️'} ${name} 到達山頂！`, true);
  });

  socket.on('game:over', ({ leaderboard }) => showResults(leaderboard));

  socket.on('room:closed', ({ message }) => {
    if (game) { game.running = false; }
    alert(message || '房間已關閉');
    location.href = '/';
  });

  // ---------------- game engine ----------------
  const canvas = $('gameCanvas');
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
  }
  window.addEventListener('resize', resize);

  const input = { left: false, right: false, jumpHeld: false, jumpBuffer: 0 };

  function startGame(seed, durationSec, startedAt, resume) {
    map = GameMap.generateMap(seed);
    ghosts = new Map();
    game = {
      running: true,
      startedAt: startedAt || Date.now(),
      durationSec,
      x: map.worldW / 2 - PLAYER_W / 2,
      y: 40,                       // standing on ground platform (h=40)
      vx: 0, vy: 0,
      onGround: true,
      coyote: 0,
      energy: 40,
      bestHeight: 0,
      streak: 0,
      finished: false,
      lastNetSend: 0,
      facing: 1,
      frozen: false,               // while question modal open
    };
    if (resume) {
      game.x = resume.x || game.x;
      game.y = resume.y || game.y;
      game.energy = resume.energy ?? game.energy;
      game.bestHeight = resume.bestHeight || 0;
      game.finished = !!resume.finished;
    }
    resize();
    show('gameScreen');
    toast('🏁 開始爬山！答題儲能量！', true);
    requestAnimationFrame(loop);
  }

  let lastT = 0;
  function loop(t) {
    if (!game || !game.running) return;
    const dt = Math.min((t - lastT) / 1000, 0.033);
    lastT = t;
    if (dt > 0) update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    const g = game;

    // timer
    const left = Math.max(0, g.durationSec - (Date.now() - g.startedAt) / 1000);
    $('timerPill').textContent = `⏱ ${String(Math.floor(left / 60)).padStart(1, '0')}:${String(Math.floor(left % 60)).padStart(2, '0')}`;

    if (!g.frozen && !g.finished) {
      // horizontal
      const canMove = g.energy > 0;
      let dir = 0;
      if (input.left) dir -= 1;
      if (input.right) dir += 1;
      if (dir !== 0 && canMove) {
        g.vx = dir * MOVE_SPEED;
        g.facing = dir;
        g.energy = Math.max(0, g.energy - MOVE_COST * dt);
      } else {
        g.vx = 0;
      }

      // jump
      if (input.jumpBuffer > 0 && (g.onGround || g.coyote > 0) && g.energy >= JUMP_COST) {
        g.vy = JUMP_VEL;
        g.onGround = false;
        g.coyote = 0;
        g.energy = Math.max(0, g.energy - JUMP_COST);
        input.jumpBuffer = 0;
      }
      input.jumpBuffer = Math.max(0, input.jumpBuffer - dt);
    } else {
      g.vx = 0;
    }

    // physics (y up)
    g.vy -= GRAVITY * dt;
    const prevY = g.y;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.x = Math.min(Math.max(g.x, 0), map.worldW - PLAYER_W);

    // one-way platform collision (only when falling)
    g.onGround = false;
    if (g.vy <= 0) {
      for (const p of map.platforms) {
        const top = p.y + p.h;
        if (prevY >= top - 1 && g.y < top &&
            g.x + PLAYER_W > p.x && g.x < p.x + p.w) {
          g.y = top;
          g.vy = 0;
          g.onGround = true;
          g.coyote = COYOTE;
          if (p.summit && !g.finished) {
            g.finished = true;
            socket.emit('player:summit');
            toast('🎉 你到達山頂啦！', true);
          }
          break;
        }
      }
    }
    if (!g.onGround) g.coyote = Math.max(0, g.coyote - dt);
    if (g.y < 40 && g.vy < 0) { g.y = 40; g.vy = 0; g.onGround = true; } // ground safety net

    // height tracking
    const frac = Math.min(Math.max((g.y - 40) / (map.summitY - 40), 0), 1);
    if (frac > g.bestHeight) g.bestHeight = frac;
    $('heightPill').textContent = `🏔️ ${Math.round(frac * 100)}%`;

    // energy HUD
    const fill = $('energyFill');
    fill.style.width = `${g.energy}%`;
    fill.classList.toggle('low', g.energy < 20);
    if (g.energy <= 0 && !g.frozen) pulseAnswerBtn();

    // ghost interpolation
    for (const gh of ghosts.values()) {
      gh.x += (gh.tx - gh.x) * Math.min(1, dt * 10);
      gh.y += (gh.ty - gh.y) * Math.min(1, dt * 10);
    }

    // network
    const now = performance.now();
    if (now - g.lastNetSend > NET_SEND_MS) {
      g.lastNetSend = now;
      socket.emit('player:state', { x: g.x, y: g.y, energy: g.energy, height: g.bestHeight });
    }
  }

  // ---------------- render ----------------
  function render() {
    const g = game;
    const scale = (canvas.height / VIEW_H);
    const viewW = canvas.width / scale;

    // camera: player ~42% up from bottom; clamp x
    let camY = g.y - VIEW_H * 0.42;
    camY = Math.max(camY, -60);
    let camX = g.x + PLAYER_W / 2 - viewW / 2;
    camX = Math.min(Math.max(camX, -40), map.worldW + 40 - viewW);
    if (viewW >= map.worldW + 80) camX = (map.worldW - viewW) / 2;

    const frac = Math.min(Math.max((g.y - 40) / (map.summitY - 40), 0), 1);
    const zone = GameMap.zoneAt(frac);

    // sky
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, zone.sky1);
    grad.addColorStop(1, zone.sky0);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(scale, scale);

    const toSX = wx => wx - camX;
    const toSY = wy => VIEW_H - (wy - camY);

    // decorative clouds (parallax, deterministic from map seed)
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 10; i++) {
      const cy = ((i * 617 + map.seed % 97) % map.summitY);
      const cx = ((i * 263) % map.worldW);
      const sy = toSY(cy + camY * 0.25);
      if (sy > -60 && sy < VIEW_H + 60) {
        ctx.beginPath();
        ctx.ellipse(toSX(cx), sy, 55, 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // platforms
    for (const p of map.platforms) {
      const sy = toSY(p.y + p.h);
      if (sy > VIEW_H + 60 || sy < -60) continue;
      const z = GameMap.zoneAt(p.y / map.summitY);
      const sx = toSX(p.x);
      if (p.summit) {
        ctx.fillStyle = '#ffd24d';
        rr(sx, sy, p.w, p.h, 8);
        // flag
        ctx.fillStyle = '#e85555';
        ctx.fillRect(sx + p.w / 2, sy - 54, 4, 54);
        ctx.beginPath();
        ctx.moveTo(sx + p.w / 2 + 4, sy - 54);
        ctx.lineTo(sx + p.w / 2 + 40, sy - 44);
        ctx.lineTo(sx + p.w / 2 + 4, sy - 34);
        ctx.fill();
      } else if (p.ground) {
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(sx, sy, p.w, p.h + 200);
        ctx.fillStyle = '#7ec850';
        ctx.fillRect(sx, sy, p.w, 10);
      } else {
        ctx.fillStyle = z.body;
        rr(sx, sy, p.w, p.h, 6);
        ctx.fillStyle = z.top;
        rr(sx, sy, p.w, 6, 6);
      }
    }

    // ghosts
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    for (const gh of ghosts.values()) {
      const sx = toSX(gh.x + PLAYER_W / 2), sy = toSY(gh.y);
      if (sy < -40 || sy > VIEW_H + 40) continue;
      ctx.globalAlpha = 0.55;
      ctx.fillText(gh.avatar, sx, sy - 6);
      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillText(gh.name, sx, sy - 42);
      ctx.font = '28px sans-serif';
      ctx.globalAlpha = 1;
    }

    // me
    const psx = toSX(g.x + PLAYER_W / 2), psy = toSY(g.y);
    ctx.font = '34px sans-serif';
    ctx.fillText(myAvatar, psx, psy - 4);
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 4;
    ctx.fillText(me.name, psx, psy - 48);
    ctx.shadowBlur = 0;

    ctx.restore();

    function rr(x, y, w, h, r) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
    }
  }

  // ---------------- input ----------------
  window.addEventListener('keydown', e => {
    if (!game || game.frozen) {
      if (e.key === 'Escape') closeQuestion();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = true;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = true;
    else if (e.key === 'ArrowUp' || e.key === ' ' || e.key === 'w' || e.key === 'W') { input.jumpBuffer = JUMP_BUFFER; e.preventDefault(); }
    else if (e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E') openQuestion();
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = false;
  });

  function bindHold(id, on, off) {
    const el = $(id);
    const start = e => { e.preventDefault(); on(); };
    const end = e => { e.preventDefault(); off(); };
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    el.addEventListener('mousedown', start);
    el.addEventListener('mouseup', end);
    el.addEventListener('mouseleave', off);
  }
  bindHold('btnLeft', () => input.left = true, () => input.left = false);
  bindHold('btnRight', () => input.right = true, () => input.right = false);
  bindHold('btnJump', () => input.jumpBuffer = JUMP_BUFFER, () => {});

  // ---------------- questions ----------------
  $('answerBtn').addEventListener('click', openQuestion);
  $('qClose').addEventListener('click', closeQuestion);

  function openQuestion() {
    if (!game || game.frozen || game.finished) return;
    game.frozen = true;
    input.left = input.right = false;
    $('qFeedback').textContent = '';
    $('qFeedback').className = 'q-feedback';
    $('qClose').style.display = 'none';
    $('qChoices').innerHTML = '<div class="muted" style="grid-column:1/-1;text-align:center">載入中…</div>';
    $('qText').textContent = '';
    $('qOverlay').classList.add('open');

    socket.emit('player:question', (res) => {
      if (!res?.ok) { closeQuestion(); return; }
      $('qText').textContent = res.question;
      $('qChoices').innerHTML = '';
      res.choices.forEach((c, i) => {
        const btn = document.createElement('button');
        btn.className = 'q-choice';
        btn.textContent = c;
        btn.addEventListener('click', () => answer(i));
        $('qChoices').appendChild(btn);
      });
    });
  }

  function answer(choice) {
    const btns = [...$('qChoices').children];
    btns.forEach(b => b.disabled = true);

    socket.emit('player:answer', { choice }, (res) => {
      if (!res?.ok) { closeQuestion(); return; }
      game.energy = res.energy;
      game.streak = res.streak;
      const fb = $('qFeedback');
      if (res.correct) {
        btns[choice].classList.add('correct');
        fb.textContent = `✅ 答啱喇！ +${res.gain}⚡${res.streak > 1 ? `（連答 ${res.streak} 題 🔥）` : ''}`;
        fb.classList.add('good');
        $('streakPill').style.display = res.streak > 1 ? '' : 'none';
        $('streakPill').textContent = `🔥 ${res.streak}`;
        // auto-continue quickly on correct
        setTimeout(closeQuestion, 700);
      } else {
        btns[choice].classList.add('wrong');
        if (res.correctChoice >= 0 && btns[res.correctChoice]) btns[res.correctChoice].classList.add('correct');
        fb.textContent = '❌ 唔啱，睇下正確答案';
        fb.classList.add('bad');
        $('streakPill').style.display = 'none';
        $('qClose').style.display = '';
      }
    });
  }

  function closeQuestion() {
    $('qOverlay').classList.remove('open');
    if (game) game.frozen = false;
  }

  // ---------------- toasts / results ----------------
  let answerPulseAt = 0;
  function pulseAnswerBtn() {
    const now = Date.now();
    if (now - answerPulseAt < 4000) return;
    answerPulseAt = now;
    toast('⚡ 能量用完喇！快啲答題補充！');
  }

  function toast(msg, gold) {
    const el = document.createElement('div');
    el.className = 'toast' + (gold ? ' gold' : '');
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function showResults(leaderboard) {
    if (game) game.running = false;
    const list = $('resultsList');
    list.innerHTML = '';
    let myRank = null;
    leaderboard.forEach(row => {
      if (row.name === me.name) myRank = row.rank;
      const div = document.createElement('div');
      div.className = 'result-row' + (row.rank <= 3 ? ` top${row.rank}` : '');
      const medal = ['🥇', '🥈', '🥉'][row.rank - 1] || row.rank;
      div.innerHTML = `
        <div class="rank">${medal}</div>
        <div class="name">${escapeHtml(row.name)}${row.finished ? ' 🏔️' : ''}</div>
        <div class="stat">✅${row.correct} ❌${row.wrong}</div>
        <div class="height">${Math.round(row.bestHeight * 100)}%</div>`;
      list.appendChild(div);
    });
    $('resultEmoji').textContent = myRank === 1 ? '🏆' : (myRank <= 3 ? '🎉' : '🏁');
    $('resultSub').textContent = myRank ? `你嘅名次：第 ${myRank} 名` : '';
    show('resultScreen');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
