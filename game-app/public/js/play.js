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

  // Gimkit-style blob colours; each player gets one from their name hash.
  const PALETTE = ['#2f6df6', '#e8468c', '#00b06f', '#f39c12', '#8e5cf7', '#e74c3c', '#00bcd4', '#ff7043'];

  // ---------------- state ----------------
  const socket = io('/game');
  let me = { name: '', studentId: null };
  let map = null;
  let game = null;               // live game state
  let ghosts = new Map();        // key -> {x,y,tx,ty,name,color}
  let myColor = PALETTE[0];

  // ---------------- screens ----------------
  function show(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(screenId).classList.add('active');
  }

  // The student's name comes from their login session — no manual entry.
  const meReady = fetch('/api/auth/me', { credentials: 'include' })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const u = data?.student;
      if (u?.name) { me.name = u.name; me.studentId = u.id || null; }
    })
    .catch(() => {});

  // ---------------- join flow: live room list ----------------
  let roomsTimer = null;
  let joining = false;

  function startRoomPolling() {
    loadRooms();
    clearInterval(roomsTimer);
    roomsTimer = setInterval(loadRooms, 3000);
  }

  async function loadRooms() {
    if (joining) return;
    let rooms = [];
    try {
      const res = await fetch('/api/game/sessions', { credentials: 'include' });
      rooms = (await res.json()).sessions.filter(r => r.phase !== 'ended');
    } catch { /* keep last render on transient errors */ return; }

    const el = $('roomList');
    if (!rooms.length) {
      el.innerHTML = '<p class="muted"><span class="pulse-dot"></span>而家未有老師開遊戲，等一陣先…</p>';
      return;
    }
    el.innerHTML = '';
    rooms.forEach(r => {
      const row = document.createElement('button');
      row.className = 'room-row';
      row.innerHTML = `
        <span class="room-emoji">${r.phase === 'lobby' ? '⛺' : '🏔️'}</span>
        <span class="room-info">
          <b>${escapeHtml(teacherLabel(r.hostName))}</b>
          <small>${escapeHtml(r.setTitle || '')} · ${r.players} 人</small>
        </span>
        <span class="room-phase ${r.phase === 'lobby' ? 'waiting' : 'playing'}">${r.phase === 'lobby' ? '等待開始' : '進行中'}</span>`;
      row.addEventListener('click', () => join(r.code));
      el.appendChild(row);
    });
  }
  startRoomPolling();

  async function join(code) {
    if (joining) return;
    joining = true;
    $('joinError').textContent = '';
    await meReady;
    const name = me.name || '玩家';

    socket.emit('player:join', { code, name, studentId: me.studentId }, (res) => {
      joining = false;
      if (!res?.ok) {
        $('joinError').textContent = res?.message || '加入失敗';
        loadRooms();
        return;
      }
      clearInterval(roomsTimer);
      myColor = PALETTE[Math.abs(hashCode(name)) % PALETTE.length];
      $('lobbySetTitle').textContent = res.setTitle || '準備中';
      $('lobbyHostName').textContent = `${teacherLabel(res.hostName)}嘅遊戲房間`;
      if (res.phase === 'playing') {
        startGame(res.seed, res.durationSec, res.startedAt, res.resume);
      } else {
        show('lobbyScreen');
      }
    });
  }

  function teacherLabel(name) {
    const n = String(name || '老師');
    return n.includes('老師') ? n : `${n} 老師`;
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
        g = { x: p.x, y: p.y, tx: p.x, ty: p.y, name: p.name, color: PALETTE[Math.abs(hashCode(p.name)) % PALETTE.length] };
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
    if (game) {
      game.running = false;
      alert(message || '房間已關閉');
      location.href = '/';
      return;
    }
    // Kicked out before the game started — back to the room list.
    show('joinScreen');
    startRoomPolling();
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
    // Spread spawn points across the middle of the world so players don't stack.
    const spread = (Math.abs(hashCode(me.name + (me.studentId || ''))) % 100) / 100;
    game = {
      running: true,
      startedAt: startedAt || Date.now(),
      durationSec,
      x: map.worldW * (0.3 + spread * 0.4) - PLAYER_W / 2,
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
      camX: null, camY: null,      // smoothed camera (snaps on first frame)
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

    // height tracking (HUD shows metres, Gimkit-style; server keeps the fraction)
    const frac = Math.min(Math.max((g.y - 40) / (map.summitY - 40), 0), 1);
    if (frac > g.bestHeight) g.bestHeight = frac;
    $('heightPill').textContent = `🏔️ 高度 ${Math.max(0, Math.round((g.y - 40) / 10))}m`;

    // smooth tracking camera
    const scale = canvas.height / VIEW_H;
    const viewW = canvas.width / scale;
    let tCamY = Math.max(g.y - VIEW_H * 0.42, -60);
    let tCamX = g.x + PLAYER_W / 2 - viewW / 2;
    tCamX = Math.min(Math.max(tCamX, -40), map.worldW + 40 - viewW);
    if (viewW >= map.worldW + 80) tCamX = (map.worldW - viewW) / 2;
    if (g.camX === null) { g.camX = tCamX; g.camY = tCamY; }
    const k = 1 - Math.exp(-7 * dt);
    g.camX += (tCamX - g.camX) * k;
    g.camY += (tCamY - g.camY) * k;

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

  // ---------------- render (Gimkit-style) ----------------
  const HINTS = [
    { fx: 0.50, y: 330,  rot: -0.06, text: '邊跑邊跳，飛得更遠！' },
    { fx: 0.32, y: 1050, rot: 0.05,  text: '答問題儲能量 ⚡' },
    { fx: 0.55, y: 4500, rot: -0.05, text: '就快到頂喇，唔好望落嚟！' },
  ];

  function render() {
    const g = game;
    const scale = (canvas.height / VIEW_H);
    const viewW = canvas.width / scale;
    const camX = g.camX ?? 0, camY = g.camY ?? 0;
    const t = performance.now() / 1000;

    const frac = Math.min(Math.max((g.y - 40) / (map.summitY - 40), 0), 1);
    const zone = GameMap.zoneAt(frac);

    // sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, zone.sky1);
    grad.addColorStop(1, zone.sky0);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(scale, scale);

    const toSX = wx => wx - camX;
    const toSY = wy => VIEW_H - (wy - camY);

    // subtle horizontal wave bands (Gimkit sky texture)
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    const bandH = 46, bandGap = 110;
    for (let wy = Math.floor(camY / bandGap) * bandGap; wy < camY + VIEW_H + bandGap; wy += bandGap) {
      ctx.fillRect(0, toSY(wy) - bandH, viewW, bandH);
    }

    // tiny confetti specks
    const SPECK_COLORS = ['rgba(255,255,255,.55)', 'rgba(255,224,130,.5)', 'rgba(255,170,200,.45)'];
    for (let i = 0; i < 70; i++) {
      const wx = (i * 379.7) % map.worldW;
      const wy = (i * 613.3) % map.summitY;
      const sx = toSX(wx), sy = toSY(wy);
      if (sx < -10 || sx > viewW + 10 || sy < -10 || sy > VIEW_H + 10) continue;
      ctx.fillStyle = SPECK_COLORS[i % 3];
      ctx.fillRect(sx, sy, 3, 3);
    }

    // fluffy clouds (parallax, deterministic)
    for (let i = 0; i < 14; i++) {
      const cy = ((i * 617 + map.seed % 97) % (map.summitY + 600));
      const cx = ((i * 811) % map.worldW);
      const sx = toSX(cx - camX * -0.35);       // drift slower than the world
      const sy = toSY(cy + camY * 0.3);
      if (sy < -80 || sy > VIEW_H + 80 || sx < -160 || sx > viewW + 160) continue;
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = '#ffffff';
      cloud(sx, sy, 1 + (i % 3) * 0.35);
      ctx.globalAlpha = 1;
    }

    // floating tips (bold yellow with dark outline, like Gimkit's tutorial text)
    for (const h of HINTS) {
      const sx = toSX(map.worldW * h.fx), sy = toSY(h.y);
      if (sy < -80 || sy > VIEW_H + 80) continue;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(h.rot);
      ctx.font = 'italic 900 30px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 7;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(30,35,60,.85)';
      ctx.strokeText(h.text, 0, 0);
      ctx.fillStyle = '#ffd94d';
      ctx.fillText(h.text, 0, 0);
      ctx.restore();
    }

    // platforms
    for (const p of map.platforms) {
      const sy = toSY(p.y + p.h);
      if (sy > VIEW_H + 80 || sy < -80) continue;
      const sx = toSX(p.x);
      if (sx > viewW + 60 || sx + p.w < -60) continue;
      if (p.summit) {
        drawBricks(sx, sy, p.w, p.h + 14, '#e8c04a', '#b8922e', 'rgba(255,214,90,.25)');
        // flag
        ctx.fillStyle = '#5d6678';
        ctx.fillRect(sx + p.w / 2 - 2, sy - 58, 5, 58);
        ctx.fillStyle = '#e84c4c';
        ctx.beginPath();
        ctx.moveTo(sx + p.w / 2 + 3, sy - 58);
        ctx.lineTo(sx + p.w / 2 + 46, sy - 47);
        ctx.lineTo(sx + p.w / 2 + 3, sy - 36);
        ctx.fill();
      } else if (p.ground) {
        drawBricks(sx, sy, p.w, p.h + 260, '#454c63', '#333949', null);
      } else {
        drawBricks(sx, sy, p.w, p.h, '#a8b0bf', '#8891a3', GameMap.zoneAt(p.y / map.summitY).tint);
      }
    }

    // ghosts (other players, semi-transparent)
    for (const gh of ghosts.values()) {
      const sx = toSX(gh.x + PLAYER_W / 2), sy = toSY(gh.y);
      if (sy < -60 || sy > VIEW_H + 60 || sx < -60 || sx > viewW + 60) continue;
      drawBlob(sx, sy, gh.color, gh.name, 0.6, t, Math.abs(gh.tx - gh.x) > 1, gh.finished);
    }

    // me
    drawBlob(toSX(g.x + PLAYER_W / 2), toSY(g.y), myColor, me.name, 1, t, g.vx !== 0 && g.onGround, g.finished);

    ctx.restore();

    // ---- drawing helpers (screen space, inside scale) ----
    function rrPath(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
    function rrFill(x, y, w, h, r) { rrPath(x, y, w, h, r); ctx.fill(); }

    function cloud(x, y, s) {
      ctx.beginPath();
      ctx.ellipse(x, y, 52 * s, 20 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(x - 34 * s, y + 6 * s, 30 * s, 14 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 36 * s, y + 5 * s, 32 * s, 15 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 4 * s, y - 12 * s, 34 * s, 16 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Brick slab with mortar joints, lighter top cap and dark outline.
    function drawBricks(x, y, w, h, base, joint, tint) {
      rrPath(x, y, w, h, 5);
      ctx.fillStyle = base;
      ctx.fill();
      ctx.save();
      rrPath(x, y, w, h, 5);
      ctx.clip();
      ctx.strokeStyle = joint;
      ctx.lineWidth = 2;
      const rowH = 14, brickW = 42;
      let row = 0;
      for (let yy = y; yy < y + h; yy += rowH, row++) {
        if (row > 0) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
        const off = (row % 2) * (brickW / 2);
        for (let xx = x + off; xx < x + w; xx += brickW) {
          ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, Math.min(yy + rowH, y + h)); ctx.stroke();
        }
        // a few deterministic darker bricks for texture
        for (let xx = x + off; xx < x + w; xx += brickW) {
          if (((Math.floor(xx) * 7 + Math.floor(yy) * 13) % 11) === 0) {
            ctx.fillStyle = 'rgba(0,0,0,.10)';
            ctx.fillRect(xx, yy, Math.min(brickW, x + w - xx), Math.min(rowH, y + h - yy));
          }
        }
      }
      ctx.restore();
      // top highlight cap
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      rrFill(x, y, w, 6, 4);
      if (tint) { ctx.fillStyle = tint; rrFill(x, y, w, h, 5); }
      // outline
      rrPath(x, y, w, h, 5);
      ctx.strokeStyle = 'rgba(40,48,68,.8)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Gimkit-style blob: rounded body, two oval eyes, stubby feet, name below.
    function drawBlob(cx, footY, color, name, alpha, time, moving, finished) {
      const w = 44, h = 40;
      const bounce = moving ? Math.abs(Math.sin(time * 9)) * 3.5 : 0;
      const by = footY - bounce;
      ctx.globalAlpha = alpha;

      // feet
      ctx.fillStyle = shade(color, -38);
      ctx.beginPath(); ctx.ellipse(cx - 10, by - 4, 8, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 10, by - 4, 8, 5.5, 0, 0, Math.PI * 2); ctx.fill();

      // body
      rrPath(cx - w / 2, by - h - 5, w, h, 19);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = shade(color, -45);
      ctx.lineWidth = 3;
      ctx.stroke();

      // gloss
      ctx.fillStyle = 'rgba(255,255,255,.28)';
      ctx.beginPath();
      ctx.ellipse(cx - 9, by - h + 6, 10, 5.5, -0.5, 0, Math.PI * 2);
      ctx.fill();

      // eyes
      ctx.fillStyle = '#12161c';
      const eyeY = by - h + 13;
      ctx.beginPath(); ctx.ellipse(cx - 8, eyeY, 3.6, 6.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 8, eyeY, 3.6, 6.2, 0, 0, Math.PI * 2); ctx.fill();

      if (finished) {
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('👑', cx, by - h - 12);
      }

      // name plate under the feet
      ctx.font = '800 14px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(20,26,40,.85)';
      ctx.strokeText(name, cx, footY + 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(name, cx, footY + 18);

      ctx.globalAlpha = 1;
    }

    function shade(hex, amt) {
      const n = parseInt(hex.slice(1), 16);
      const r = Math.min(255, Math.max(0, (n >> 16) + amt));
      const gg = Math.min(255, Math.max(0, ((n >> 8) & 255) + amt));
      const b = Math.min(255, Math.max(0, (n & 255) + amt));
      return `rgb(${r},${gg},${b})`;
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
