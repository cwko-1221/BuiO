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
  const SPRING_VEL = 1300;       // u/s  auto-bounce off spring pads (free)
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
  let myAcc = null;

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
      myAcc = accessoriesFor(name);
      $('lobbySetTitle').textContent = res.setTitle || '準備中';
      $('lobbyHostName').textContent = `${teacherLabel(res.hostName)}嘅遊戲房間`;
      if (res.phase === 'playing') {
        startGame(res.seed, res.durationSec, res.startedAt, res.resume);
      } else {
        show('lobbyScreen');
      }
    });
  }

  // Deterministic per-name look: every client derives the same colour,
  // hat and eyewear from the player's name, so nothing extra goes over the wire.
  function accessoriesFor(name) {
    const h = Math.abs(hashCode(name));
    return {
      hat: Math.floor(h / 7) % 6,        // 0 none · 1 cap · 2 party · 3 beanie · 4 bow · 5 grad cap
      face: Math.floor(h / 31) % 3,      // 0 none · 1 glasses · 2 sunglasses
      accent: PALETTE[Math.floor(h / 13) % PALETTE.length],
    };
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
        g = { x: p.x, y: p.y, tx: p.x, ty: p.y, name: p.name, color: PALETTE[Math.abs(hashCode(p.name)) % PALETTE.length], acc: accessoriesFor(p.name) };
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
  const skyAsset = new Image();
  skyAsset.decoding = 'async';
  skyAsset.src = '/game/images/game/sky-panorama.webp';

  function resize() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
  }
  window.addEventListener('resize', resize);

  const input = { left: false, right: false, jumpHeld: false, jumpBuffer: 0 };

  function startGame(seed, durationSec, startedAt, resume) {
    map = GameMap.generateMap(seed);
    map.movers = map.platforms.filter(p => p.type === 'move');
    ghosts = new Map();
    // Spread spawn points around the route start so players don't stack.
    const spread = (Math.abs(hashCode(me.name + (me.studentId || ''))) % 100) / 100;
    game = {
      running: true,
      startedAt: startedAt || Date.now(),
      durationSec,
      x: Math.max(40, map.startX - 280 + spread * 560) - PLAYER_W / 2,
      y: 40,                       // standing on ground platform (h=40)
      vx: 0, vy: 0,
      onGround: true,
      coyote: 0,
      energy: 40,
      bestHeight: 0,
      streak: 0,
      finished: false,
      airJump: 1,                  // one extra mid-air jump (double jump)
      stageReached: 0,
      bannerUntil: 0, bannerMain: '', bannerSub: '',
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
      game.stageReached = Math.floor((resume.bestHeight || 0) * (map.stageCount || 6));
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
      // horizontal — ice platforms have momentum instead of instant speed
      const canMove = g.energy > 0;
      let dir = 0;
      if (input.left) dir -= 1;
      if (input.right) dir += 1;
      const targetVx = (dir !== 0 && canMove) ? dir * MOVE_SPEED : 0;
      if (dir !== 0 && canMove) {
        g.facing = dir;
        g.energy = Math.max(0, g.energy - MOVE_COST * dt);
      }
      if (g.onGround && g.plat?.type === 'ice') {
        g.vx += (targetVx - g.vx) * Math.min(1, dt * 2.2);   // slippery!
      } else {
        g.vx = targetVx;
      }

      // jump (ground jump or one double jump in the air)
      const canGroundJump = g.onGround || g.coyote > 0;
      if (input.jumpBuffer > 0 && g.energy >= JUMP_COST && (canGroundJump || g.airJump > 0)) {
        if (!canGroundJump) g.airJump--;
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

    // moving platforms follow the shared game clock so every client agrees
    const gt = (Date.now() - g.startedAt) / 1000;
    for (const p of map.movers) {
      p.prevCx = p.cx ?? p.x;
      p.cx = p.x + Math.sin(gt * p.spd + p.ph) * p.amp;
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
        const px = p.cx ?? p.x;
        if (prevY >= top - 1 && g.y < top &&
            g.x + PLAYER_W > px && g.x < px + p.w) {
          g.y = top;
          if (p.type === 'spring') {
            g.vy = SPRING_VEL;           // free super-bounce
            break;
          }
          g.vy = 0;
          g.onGround = true;
          g.plat = p;
          g.coyote = COYOTE;
          g.airJump = 1;
          if (p.checkpoint && p.stage > g.stageReached) {
            g.stageReached = p.stage;
            g.energy = Math.min(ENERGY_MAX, g.energy + 15);
            g.bannerSub = `⛳ 山頂 ${p.stage} / ${map.stageCount}`;
            g.bannerMain = `下一站：${map.stages[p.stage]}`;
            g.bannerUntil = performance.now() + 2800;
            toast(`⛳ 到達第 ${p.stage} 個山頂！+15⚡`, true);
          }
          if (p.summit && !g.finished) {
            g.finished = true;
            socket.emit('player:summit');
            toast('🎉 你到達山頂啦！', true);
          }
          break;
        }
      }
    }
    // riding a moving platform carries you sideways
    if (g.onGround && g.plat?.type === 'move') {
      g.x += g.plat.cx - g.plat.prevCx;
    }
    if (!g.onGround) g.coyote = Math.max(0, g.coyote - dt);
    if (g.y < 40 && g.vy < 0) { g.y = 40; g.vy = 0; g.onGround = true; } // ground safety net

    // height tracking (HUD shows metres, Gimkit-style; server keeps the fraction)
    const frac = Math.min(Math.max((g.y - 40) / (map.summitY - 40), 0), 1);
    if (frac > g.bestHeight) g.bestHeight = frac;
    $('heightPill').textContent = `🏔️ 高度 ${Math.max(0, Math.round((g.y - 40) / 5))}m`;
    const stageIndex = Math.min(map.stageCount - 1, Math.max(0, Math.floor(frac * map.stageCount)));
    $('stagePill').textContent = `${String(stageIndex + 1).padStart(2, '0')} · ${map.stages[stageIndex]}`;

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
    $('energyText').textContent = Math.round(g.energy);
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
  function render() {
    const g = game;
    const scale = (canvas.height / VIEW_H);
    const viewW = canvas.width / scale;
    const camX = g.camX ?? 0, camY = g.camY ?? 0;
    const t = performance.now() / 1000;

    const frac = Math.min(Math.max((g.y - 40) / (map.summitY - 40), 0), 1);
    const zone = GameMap.zoneAt(frac);

    // Generated painterly panorama plus altitude tint. It gives the world one
    // coherent art direction while gameplay geometry stays crisp and code-driven.
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, zone.sky1);
    grad.addColorStop(1, zone.sky0);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (skyAsset.complete && skyAsset.naturalWidth) {
      const cover = Math.max(canvas.width / skyAsset.naturalWidth, canvas.height / skyAsset.naturalHeight);
      const dw = skyAsset.naturalWidth * cover;
      const dh = skyAsset.naturalHeight * cover;
      const pan = Math.sin((camX / map.worldW) * Math.PI * 2) * canvas.width * .025;
      const lift = (frac - .35) * canvas.height * .08;
      ctx.globalAlpha = .9 - frac * .28;
      ctx.drawImage(skyAsset, (canvas.width - dw) / 2 - pan, (canvas.height - dh) / 2 + lift, dw, dh);
      ctx.globalAlpha = 1;
      ctx.fillStyle = frac > .62 ? `rgba(19,35,75,${(frac - .62) * .58})` : 'rgba(54,188,226,.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.save();
    ctx.scale(scale, scale);

    const toSX = wx => wx - camX;
    const toSY = wy => VIEW_H - (wy - camY);

    // Subtle atmospheric bands keep fast camera movement readable.
    ctx.fillStyle = 'rgba(255,255,255,.035)';
    const bandH = 46, bandGap = 110;
    for (let wy = Math.floor(camY / bandGap) * bandGap; wy < camY + VIEW_H + bandGap; wy += bandGap) {
      ctx.fillRect(0, toSY(wy) - bandH, viewW, bandH);
    }

    // Distant mini-cloud pattern.
    ctx.fillStyle = 'rgba(255,255,255,.09)';
    const TX = 280, TY = 180;
    for (let wy = Math.floor(camY / TY) * TY - TY; wy < camY + VIEW_H + TY; wy += TY) {
      const ox = (Math.abs(Math.round(wy / TY)) % 2) * (TX / 2);
      for (let wx = Math.floor(camX / TX) * TX - TX; wx < camX + viewW + TX; wx += TX) {
        const sx = toSX(wx + ox), sy = toSY(wy);
        ctx.beginPath();
        ctx.ellipse(sx, sy, 22, 8, 0, 0, Math.PI * 2);
        ctx.ellipse(sx - 14, sy + 3, 12, 6, 0, 0, Math.PI * 2);
        ctx.ellipse(sx + 14, sy + 3, 13, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
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
    for (const h of map.hints) {
      const sx = toSX(h.x), sy = toSY(h.y);
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

    // Floating collectible-like set dressing, rendered with the same ink and
    // material language as the platforms instead of OS-dependent emoji.
    for (const a of map.air) {
      const asx = toSX(a.x), asy = toSY(a.y) + Math.sin(t * 1.6 + a.x * 0.013) * 6;
      if (asy < -50 || asy > VIEW_H + 50 || asx < -40 || asx > viewW + 40) continue;
      drawAirRelic(a.e, asx, asy, 18, t);
    }

    // platforms (support bodies first, then the prop skin on top)
    for (const p of map.platforms) {
      const sy = toSY(p.y + p.h);
      if (sy > VIEW_H + 380 || sy < -80) continue;
      const sx = toSX(p.cx ?? p.x);
      if (sx > viewW + 80 || sx + p.w < -80) continue;

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
        continue;
      }
      if (p.ground) {
        drawBricks(sx, sy, p.w, p.h + 260, '#454c63', '#333949', null);
        continue;
      }

      if (p.pillars) {
        drawPillar(sx + 8, sy + p.h - 2, 36, p.pillars);
        drawPillar(sx + p.w - 44, sy + p.h - 2, 36, p.pillars);
      }
      if (p.column) drawPillar(sx + p.w / 2 - 18, sy + p.h - 2, 36, p.column);
      if (p.posts) {
        drawPost(sx + 14, sy + p.h - 2, p.posts);
        drawPost(sx + p.w - 21, sy + p.h - 2, p.posts);
      }
      if (p.mass) drawMass(sx, sy + p.h - 3, p.w, p.mass, p.skin === 'snowmound');

      // A soft contact shadow makes every jump surface immediately legible.
      ctx.fillStyle = 'rgba(28,35,57,.18)';
      rrFill(sx + 5, sy + 7, p.w, Math.max(14, p.h), 7);

      if (p.tilt) {
        ctx.save();
        ctx.translate(sx + p.w / 2, sy + p.h / 2);
        ctx.rotate(p.tilt);
        ctx.translate(-(sx + p.w / 2), -(sy + p.h / 2));
      }
      drawSkin(p, sx, sy);
      if (p.tilt) ctx.restore();
    }

    // Decorations sitting on platform tops use original vector prop models.
    for (const d of map.deco) {
      const sx = toSX(d.x), sy = toSY(d.y);
      if (sy < -60 || sy > VIEW_H + 60 || sx < -40 || sx > viewW + 40) continue;
      drawSceneryProp(d.e, sx, sy, 32);
    }

    // ghosts (other players, semi-transparent)
    for (const gh of ghosts.values()) {
      const sx = toSX(gh.x + PLAYER_W / 2), sy = toSY(gh.y);
      if (sy < -60 || sy > VIEW_H + 60 || sx < -60 || sx > viewW + 60) continue;
      drawBlob(sx, sy, gh.color, gh.name, 0.6, t, Math.abs(gh.tx - gh.x) > 1, gh.finished, gh.acc);
    }

    // me
    drawBlob(toSX(g.x + PLAYER_W / 2), toSY(g.y), myColor, me.name, 1, t, g.vx !== 0 && g.onGround, g.finished, myAcc);

    // stage-summit celebration banner
    if (g.bannerUntil && performance.now() < g.bannerUntil) {
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.font = '800 22px "Segoe UI", sans-serif';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(30,35,60,.85)';
      ctx.strokeText(g.bannerSub, viewW / 2, VIEW_H * 0.24);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(g.bannerSub, viewW / 2, VIEW_H * 0.24);
      ctx.font = '900 44px "Segoe UI", sans-serif';
      ctx.lineWidth = 9;
      ctx.strokeText(g.bannerMain, viewW / 2, VIEW_H * 0.24 + 50);
      ctx.fillStyle = '#7ef77e';
      ctx.fillText(g.bannerMain, viewW / 2, VIEW_H * 0.24 + 50);
    }

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

    // Wooden plank slab; moving platforms get little direction arrows.
    function drawPlanks(x, y, w, h, moving) {
      rrPath(x, y, w, h, 5);
      ctx.fillStyle = '#b07a3e';
      ctx.fill();
      ctx.save();
      rrPath(x, y, w, h, 5);
      ctx.clip();
      ctx.strokeStyle = '#8a5a28';
      ctx.lineWidth = 2;
      for (let xx = x + 34; xx < x + w; xx += 34) {
        ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx, y + h); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      rrFill(x, y, w, 6, 4);
      rrPath(x, y, w, h, 5);
      ctx.strokeStyle = 'rgba(70,45,20,.85)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      if (moving) {
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath();
        ctx.moveTo(x + 6, y + h / 2); ctx.lineTo(x + 16, y + h / 2 - 6); ctx.lineTo(x + 16, y + h / 2 + 6);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + w - 6, y + h / 2); ctx.lineTo(x + w - 16, y + h / 2 - 6); ctx.lineTo(x + w - 16, y + h / 2 + 6);
        ctx.fill();
      }
    }

    // Gimkit-style blob: rounded body, two oval eyes, stubby feet, name below.
    function drawBlob(cx, footY, color, name, alpha, time, moving, finished, acc) {
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

      // eyewear
      if (acc && acc.face === 1) {           // round glasses
        ctx.strokeStyle = '#1c2230';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx - 8, eyeY, 6.5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx + 8, eyeY, 6.5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 1.5, eyeY); ctx.lineTo(cx + 1.5, eyeY); ctx.stroke();
      } else if (acc && acc.face === 2) {    // sunglasses
        ctx.fillStyle = '#1c2230';
        rrFill(cx - 15, eyeY - 5, 13, 10, 3);
        rrFill(cx + 2, eyeY - 5, 13, 10, 3);
        ctx.fillRect(cx - 3, eyeY - 3, 6, 2.5);
      }

      // hat — the summit crown always wins
      const topY = by - h - 5;
      if (finished) {
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('👑', cx, topY - 7);
      } else if (acc && acc.hat) {
        drawHat(acc, cx, topY);
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

    // Prop skin dispatcher — physics type and visual skin are separate.
    function drawSkin(p, sx, sy) {
      switch (p.skin) {
        case 'spring': {
          ctx.fillStyle = '#525c70';
          rrFill(sx + 6, sy + 10, p.w - 12, p.h - 10, 4);
          ctx.fillStyle = '#e84c4c';
          rrFill(sx, sy, p.w, 14, 7);
          rrPath(sx, sy, p.w, 14, 7);
          ctx.strokeStyle = 'rgba(40,48,68,.8)';
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.8)';
          for (let dx = 12; dx < p.w - 8; dx += 22) {
            ctx.beginPath(); ctx.arc(sx + dx, sy + 7, 3, 0, Math.PI * 2); ctx.fill();
          }
          break;
        }
        case 'ice': {
          drawBricks(sx, sy, p.w, p.h, '#cfe9fb', 'rgba(120,170,215,.55)', 'rgba(255,255,255,.18)');
          ctx.strokeStyle = 'rgba(255,255,255,.65)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(sx + p.w * 0.18, sy + 6); ctx.lineTo(sx + p.w * 0.18 + 16, sy + 6); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(sx + p.w * 0.6, sy + 13); ctx.lineTo(sx + p.w * 0.6 + 22, sy + 13); ctx.stroke();
          break;
        }
        case 'obj': {
          // Semantic emoji values from the map are IDs only; the renderer turns
          // them into consistent chunky toy props on every device.
          const step = p.s * 0.8;
          for (let i = 0; i < p.n; i++) {
            const ocx = p.n === 1 ? sx + p.w / 2 : sx + step * i + step / 2;
            drawPropModel(p.e, ocx, sy + p.h, Math.max(30, p.h * .95));
          }
          break;
        }
        case 'move':  drawPlanks(sx, sy, p.w, p.h, true); break;
        case 'plank': drawPlanks(sx, sy, p.w, p.h, false); break;
        case 'grass': drawGrass(sx, sy, p.w, p.h, p.checkpoint, p.stage); break;
        case 'mound': drawGrass(sx, sy, p.w, p.h, false, 0); break;
        case 'snowmound': {
          rrPath(sx, sy, p.w, p.h, 6);
          ctx.fillStyle = '#b9cfe2';
          ctx.fill();
          ctx.fillStyle = '#f4f9ff';
          rrFill(sx - 2, sy, p.w + 4, 10, 5);
          rrPath(sx, sy, p.w, p.h, 6);
          ctx.strokeStyle = 'rgba(70,90,120,.85)';
          ctx.lineWidth = 2.5;
          ctx.stroke();
          break;
        }
        case 'hay':   drawHay(sx, sy, p.w, p.h); break;
        case 'metal': drawMetal(sx, sy, p.w, p.h); break;
        case 'crate': drawCrates(sx, sy, p.w, p.h); break;
        case 'barrel': drawBarrels(sx, sy, p.w, p.h); break;
        case 'stall': drawStall(sx, sy, p.w, p.h); break;
        case 'log':   drawLog(sx, sy, p.w, p.h); break;
        case 'rock':  drawRock(sx, sy, p.w, p.h, false); break;
        case 'snowrock': drawRock(sx, sy, p.w, p.h, true); break;
        case 'fence': drawFence(sx, sy, p.w, p.h); break;
        case 'machine': drawMachine(sx, sy, p.w, p.h); break;
        case 'pipe':  drawPipe(sx, sy, p.w, p.h); break;
        default:
          drawBricks(sx, sy, p.w, p.h, '#a8b0bf', '#8891a3', GameMap.zoneAt(p.y / map.summitY).tint);
      }
    }

    function propKind(e) {
      if ('📦🧺📚🧰🗄️'.includes(e)) return 'crate';
      if ('🏺🪣🛢️'.includes(e)) return 'vessel';
      if ('🪨🧊❄️'.includes(e)) return 'rock';
      if ('🍉🍞🧀🍎🎃🍄'.includes(e)) return 'round';
      if ('🌲🌳🌿🌾🌼🎄'.includes(e)) return 'plant';
      if ('⚙️🔩🔧📺'.includes(e)) return 'machine';
      if ('🪑🛋️🛏️🛶🚜🛷🚋🛖'.includes(e)) return 'furniture';
      return 'relic';
    }

    function propPalette(e) {
      const sets = [
        ['#e89d4f', '#9b552d', '#ffe2a1'],
        ['#63c8a4', '#287a71', '#d6fff0'],
        ['#f06b62', '#9b3943', '#ffd2b8'],
        ['#7aa9e8', '#405a99', '#d8eeff'],
        ['#c786dd', '#70468f', '#f0d7ff'],
      ];
      return sets[Math.abs(hashCode(e)) % sets.length];
    }

    function drawPropModel(e, cx, baseY, size) {
      const kind = propKind(e);
      const [base, dark, light] = propPalette(e);
      const w = size * (kind === 'furniture' ? 1.45 : .95);
      const h = size;
      ctx.save();
      ctx.translate(cx, baseY);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(2, size * .07);
      ctx.strokeStyle = '#2e354d';
      ctx.fillStyle = base;
      if (kind === 'crate') {
        rrPath(-w/2, -h, w, h, h*.12); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = dark; ctx.lineWidth *= .65;
        ctx.beginPath(); ctx.moveTo(-w*.34,-h*.8); ctx.lineTo(w*.34,-h*.2); ctx.moveTo(w*.34,-h*.8); ctx.lineTo(-w*.34,-h*.2); ctx.stroke();
        ctx.fillStyle = light; rrFill(-w*.36,-h*.88,w*.72,h*.12,h*.04);
      } else if (kind === 'vessel') {
        ctx.beginPath();
        ctx.moveTo(-w*.22,-h); ctx.bezierCurveTo(-w*.1,-h*.84,-w*.44,-h*.65,-w*.35,-h*.3);
        ctx.quadraticCurveTo(0,h*.06,w*.35,-h*.3); ctx.bezierCurveTo(w*.44,-h*.65,w*.1,-h*.84,w*.22,-h); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = light; rrFill(-w*.28,-h,w*.56,h*.12,h*.05);
        ctx.strokeStyle = dark; ctx.lineWidth *= .6; ctx.beginPath(); ctx.arc(0,-h*.48,w*.22,0,Math.PI); ctx.stroke();
      } else if (kind === 'rock') {
        ctx.beginPath(); ctx.moveTo(-w*.48,0); ctx.lineTo(-w*.42,-h*.55); ctx.lineTo(-w*.14,-h); ctx.lineTo(w*.28,-h*.82); ctx.lineTo(w*.5,-h*.34); ctx.lineTo(w*.4,0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = light; ctx.beginPath(); ctx.moveTo(-w*.27,-h*.57); ctx.lineTo(-w*.12,-h*.82); ctx.lineTo(w*.1,-h*.7); ctx.lineTo(-w*.02,-h*.45); ctx.closePath(); ctx.fill();
      } else if (kind === 'round') {
        ctx.beginPath(); ctx.ellipse(0,-h*.45,w*.46,h*.48,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = light; ctx.beginPath(); ctx.ellipse(-w*.13,-h*.68,w*.13,h*.12,-.5,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = dark; ctx.lineWidth *= .65; ctx.beginPath(); ctx.moveTo(0,-h*.94); ctx.quadraticCurveTo(w*.15,-h*1.12,w*.23,-h*.94); ctx.stroke();
      } else if (kind === 'plant') {
        ctx.fillStyle = dark; rrFill(-w*.1,-h*.55,w*.2,h*.55,h*.06);
        ctx.fillStyle = base;
        for (const [dx,dy,r] of [[0,-.82,.3],[-.25,-.63,.25],[.25,-.62,.25]]) { ctx.beginPath(); ctx.arc(w*dx,h*dy,w*r,0,Math.PI*2); ctx.fill(); ctx.stroke(); }
        ctx.fillStyle = light; ctx.beginPath(); ctx.arc(-w*.1,-h*.85,w*.1,0,Math.PI*2); ctx.fill();
      } else if (kind === 'machine') {
        rrPath(-w/2,-h,w,h,h*.12); ctx.fill(); ctx.stroke();
        ctx.fillStyle = dark; rrFill(-w*.34,-h*.76,w*.68,h*.4,h*.08);
        ctx.fillStyle = light; ctx.beginPath(); ctx.arc(-w*.18,-h*.56,h*.09,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ffcf4a'; ctx.beginPath(); ctx.arc(w*.16,-h*.56,h*.09,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = dark; rrFill(-w*.34,-h*.16,w*.68,h*.11,h*.04);
      } else if (kind === 'furniture') {
        rrPath(-w/2,-h*.72,w,h*.58,h*.14); ctx.fill(); ctx.stroke();
        ctx.fillStyle = light; rrFill(-w*.38,-h*.6,w*.76,h*.17,h*.07);
        ctx.fillStyle = dark; rrFill(-w*.4,-h*.15,w*.12,h*.15,h*.03); rrFill(w*.28,-h*.15,w*.12,h*.15,h*.03);
      } else {
        ctx.beginPath(); ctx.arc(0,-h*.5,w*.42,0,Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = light; ctx.beginPath(); ctx.moveTo(0,-h*.8); ctx.lineTo(w*.18,-h*.45); ctx.lineTo(-w*.18,-h*.45); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    function drawSceneryProp(e, cx, baseY, size) {
      ctx.save();
      ctx.shadowColor = 'rgba(30,38,58,.22)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 4;
      drawPropModel(e, cx, baseY, size);
      ctx.restore();
    }

    function drawAirRelic(e, cx, cy, size, time) {
      const [base, dark, light] = propPalette(e);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(time * 1.2 + cx) * .08);
      ctx.shadowColor = 'rgba(28,38,65,.22)'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 4;
      ctx.fillStyle = base; ctx.strokeStyle = '#30374f'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0,0,size,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = light; ctx.beginPath(); ctx.arc(-size*.28,-size*.3,size*.22,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = dark; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-size*.45,0); ctx.lineTo(size*.45,0); ctx.moveTo(0,-size*.45); ctx.lineTo(0,size*.45); ctx.stroke();
      ctx.restore();
    }

    // ---- structure support bodies ----
    function drawPillar(x, yTop, w, hgt) {
      ctx.fillStyle = '#99a2b1';
      ctx.fillRect(x, yTop, w, hgt);
      ctx.strokeStyle = 'rgba(70,80,100,.4)';
      ctx.lineWidth = 1.5;
      for (let yy = yTop + 14; yy < yTop + hgt; yy += 14) {
        ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(45,53,72,.75)';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x, yTop, w, hgt);
    }

    function drawPost(x, yTop, hgt) {
      ctx.fillStyle = '#8a5a28';
      ctx.fillRect(x, yTop, 7, hgt);
      ctx.strokeStyle = 'rgba(70,45,20,.8)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, yTop, 7, hgt);
    }

    function drawMass(x, yTop, w, depth, snow) {
      ctx.beginPath();
      ctx.moveTo(x + 4, yTop);
      ctx.lineTo(x + w - 4, yTop);
      ctx.lineTo(x + w - 4 - w * 0.12, yTop + depth);
      ctx.lineTo(x + 4 + w * 0.12, yTop + depth);
      ctx.closePath();
      ctx.fillStyle = snow ? '#c6d9ea' : '#7a4f27';
      ctx.fill();
      ctx.fillStyle = snow ? 'rgba(90,120,160,.25)' : 'rgba(50,30,12,.3)';
      for (let i = 0; i < Math.floor(w / 34); i++) {
        ctx.beginPath();
        ctx.arc(x + 20 + i * 34, yTop + 16 + ((i * 29) % Math.max(10, depth - 24)), 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = snow ? 'rgba(70,95,130,.7)' : 'rgba(50,30,12,.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // ---- prop skins ----
    function drawCrates(x, y, w, h) {
      for (let cx0 = x; cx0 < x + w; cx0 += 46) {
        const cw = Math.min(44, x + w - cx0);
        rrPath(cx0, y, cw, h, 3);
        ctx.fillStyle = '#c08a4a';
        ctx.fill();
        ctx.strokeStyle = 'rgba(90,55,20,.55)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx0 + 3, y + 3); ctx.lineTo(cx0 + cw - 3, y + h - 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx0 + cw - 3, y + 3); ctx.lineTo(cx0 + 3, y + h - 3); ctx.stroke();
        rrPath(cx0, y, cw, h, 3);
        ctx.strokeStyle = '#7a4c1e';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }

    function drawBarrels(x, y, w, h) {
      for (let cx0 = x; cx0 + 30 <= x + w + 6; cx0 += 36) {
        rrPath(cx0, y, 32, h, 9);
        ctx.fillStyle = '#a86f36';
        ctx.fill();
        ctx.strokeStyle = '#5f3d17';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx0 + 2, y + h * 0.3); ctx.lineTo(cx0 + 30, y + h * 0.3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx0 + 2, y + h * 0.7); ctx.lineTo(cx0 + 30, y + h * 0.7); ctx.stroke();
        rrPath(cx0, y, 32, h, 9);
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }

    function drawStall(x, y, w, h) {
      drawPlanks(x, y, w, h, false);
      // striped awning floating above the counter
      const ax = x - 4, aw = w + 8, ay = y - 30;
      ctx.save();
      rrPath(ax, ay, aw, 20, 6);
      ctx.clip();
      for (let i = 0; i * 18 < aw; i++) {
        ctx.fillStyle = i % 2 ? '#ffffff' : '#e84c4c';
        ctx.fillRect(ax + i * 18, ay, 18, 20);
      }
      ctx.restore();
      rrPath(ax, ay, aw, 20, 6);
      ctx.strokeStyle = 'rgba(120,40,40,.8)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // corner supports
      ctx.strokeStyle = '#8a5a28';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x + 6, y); ctx.lineTo(ax + 8, ay + 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w - 6, y); ctx.lineTo(ax + aw - 8, ay + 20); ctx.stroke();
    }

    function drawLog(x, y, w, h) {
      const r = h / 2;
      rrPath(x, y, w, h, r);
      ctx.fillStyle = '#9a6b3a';
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,45,20,.4)';
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(x + r, y + h * 0.35); ctx.lineTo(x + w - r, y + h * 0.35); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + r, y + h * 0.68); ctx.lineTo(x + w - r, y + h * 0.68); ctx.stroke();
      // cut end
      ctx.fillStyle = '#c89a66';
      ctx.beginPath(); ctx.ellipse(x + r, y + r, r * 0.7, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(120,80,40,.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(x + r, y + r, r * 0.4, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
      rrPath(x, y, w, h, r);
      ctx.strokeStyle = '#5f3d17';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    function drawRock(x, y, w, h, snow) {
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 2);
      ctx.lineTo(x + w - 8, y);
      ctx.lineTo(x + w - 1, y + h * 0.55);
      ctx.lineTo(x + w * 0.72, y + h + 7);
      ctx.lineTo(x + w * 0.32, y + h + 4);
      ctx.lineTo(x + 1, y + h * 0.65);
      ctx.closePath();
      ctx.fillStyle = '#98a1ad';
      ctx.fill();
      ctx.fillStyle = 'rgba(60,70,90,.25)';
      ctx.beginPath();
      ctx.ellipse(x + w * 0.62, y + h * 0.62, w * 0.16, h * 0.24, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 2);
      ctx.lineTo(x + w - 8, y);
      ctx.lineTo(x + w - 1, y + h * 0.55);
      ctx.lineTo(x + w * 0.72, y + h + 7);
      ctx.lineTo(x + w * 0.32, y + h + 4);
      ctx.lineTo(x + 1, y + h * 0.65);
      ctx.closePath();
      ctx.strokeStyle = '#4e5666';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      if (snow) {
        ctx.beginPath();
        ctx.moveTo(x + 6, y + 2);
        ctx.lineTo(x + w - 8, y);
        ctx.lineTo(x + w - 6, y + 8);
        ctx.quadraticCurveTo(x + w / 2, y + 14, x + 8, y + 10);
        ctx.closePath();
        ctx.fillStyle = '#f4f9ff';
        ctx.fill();
      }
    }

    function drawFence(x, y, w, h) {
      ctx.fillStyle = '#a9743c';
      ctx.fillRect(x, y, w, 6);
      ctx.fillRect(x, y + h - 9, w, 6);
      for (let px = x + 4; px < x + w - 6; px += 34) {
        ctx.fillStyle = '#8a5a28';
        ctx.fillRect(px, y - 4, 8, h + 6);
        ctx.strokeStyle = 'rgba(70,45,20,.8)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px, y - 4, 8, h + 6);
      }
      ctx.strokeStyle = 'rgba(70,45,20,.7)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, 6);
      ctx.strokeRect(x, y + h - 9, w, 6);
    }

    function drawMachine(x, y, w, h) {
      drawMetal(x, y, w, h);
      const mx = x + w * 0.22;
      ctx.fillStyle = '#2c3242';
      rrFill(mx, y + 5, w * 0.3, h - 10, 3);
      ctx.fillStyle = '#3fd0a4';
      rrFill(mx + 4, y + 8, w * 0.3 - 8, 5, 2);
      const colors = ['#e84c4c', '#f3c53d', '#4caf50'];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = colors[i];
        ctx.beginPath();
        ctx.arc(x + w * 0.62 + i * 12, y + h / 2, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawPipe(x, y, w, h) {
      const r = h / 2;
      rrPath(x, y, w, h, r);
      ctx.fillStyle = '#8d97a8';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.45)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + r, y + 6); ctx.lineTo(x + w - r, y + 6); ctx.stroke();
      ctx.fillStyle = '#6f7889';
      for (let px = x + 56; px < x + w - 20; px += 64) {
        rrFill(px, y - 2, 10, h + 4, 3);
      }
      rrPath(x, y, w, h, r);
      ctx.strokeStyle = '#454e60';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Grass-topped soil slab; checkpoints get a flag with the stage number.
    function drawGrass(x, y, w, h, checkpoint, stage) {
      rrPath(x, y, w, h, 6);
      ctx.fillStyle = '#8a5a2e';
      ctx.fill();
      ctx.fillStyle = 'rgba(60,38,16,.35)';
      for (let xx = x + 12; xx < x + w - 8; xx += 28) {
        ctx.beginPath(); ctx.arc(xx, y + h * 0.65, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#57c14f';
      rrFill(x - 2, y, w + 4, 10, 5);
      rrPath(x, y, w, h, 6);
      ctx.strokeStyle = 'rgba(60,38,16,.85)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      if (checkpoint) {
        const fx = x + w / 2;
        ctx.fillStyle = '#5d6678';
        ctx.fillRect(fx - 2, y - 40, 4, 40);
        ctx.fillStyle = '#3db4f2';
        ctx.beginPath();
        ctx.moveTo(fx + 2, y - 40); ctx.lineTo(fx + 34, y - 32); ctx.lineTo(fx + 2, y - 24);
        ctx.fill();
        ctx.font = '800 13px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(String(stage), fx + 13, y - 28);
      }
    }

    // Hay bale: golden block with diagonal cross-hatching.
    function drawHay(x, y, w, h) {
      rrPath(x, y, w, h, 6);
      ctx.fillStyle = '#e7c04f';
      ctx.fill();
      ctx.save();
      rrPath(x, y, w, h, 6);
      ctx.clip();
      ctx.strokeStyle = 'rgba(150,105,30,.5)';
      ctx.lineWidth = 1.5;
      for (let xx = x - h; xx < x + w; xx += 16) {
        ctx.beginPath(); ctx.moveTo(xx, y + h); ctx.lineTo(xx + h, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx + h, y + h); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      rrFill(x, y, w, 6, 4);
      rrPath(x, y, w, h, 6);
      ctx.strokeStyle = '#96702a';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Industrial metal panel with seams and rivets.
    function drawMetal(x, y, w, h) {
      rrPath(x, y, w, h, 4);
      ctx.fillStyle = '#7b8494';
      ctx.fill();
      ctx.save();
      rrPath(x, y, w, h, 4);
      ctx.clip();
      ctx.strokeStyle = '#5b6373';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(25,30,45,.55)';
      for (let xx = x + 48; xx < x + w; xx += 48) {
        ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx, y + h); ctx.stroke();
        ctx.beginPath(); ctx.arc(xx - 8, y + 6, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(xx + 8, y + h - 6, 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      rrFill(x, y, w, 5, 3);
      rrPath(x, y, w, h, 4);
      ctx.strokeStyle = '#39404f';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // topY = top edge of the blob body.
    function drawHat(acc, cx, topY) {
      const a = acc.accent;
      if (acc.hat === 1) {           // baseball cap
        ctx.fillStyle = a;
        ctx.beginPath(); ctx.arc(cx, topY + 5, 13, Math.PI, 0); ctx.fill();
        rrFill(cx - 1, topY + 1, 19, 5, 2.5);   // brim
      } else if (acc.hat === 2) {    // party hat
        ctx.fillStyle = a;
        ctx.beginPath();
        ctx.moveTo(cx, topY - 17); ctx.lineTo(cx - 10, topY + 4); ctx.lineTo(cx + 10, topY + 4);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(cx, topY - 17, 3.2, 0, Math.PI * 2); ctx.fill();
      } else if (acc.hat === 3) {    // beanie
        ctx.fillStyle = a;
        ctx.beginPath(); ctx.arc(cx, topY + 4, 13, Math.PI, 0); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        rrFill(cx - 13, topY + 1, 26, 4, 2);
        ctx.fillStyle = a;
        ctx.beginPath(); ctx.arc(cx, topY - 10, 3.5, 0, Math.PI * 2); ctx.fill();
      } else if (acc.hat === 4) {    // bow
        ctx.fillStyle = a;
        ctx.beginPath();
        ctx.moveTo(cx + 8, topY + 2); ctx.lineTo(cx - 1, topY - 4); ctx.lineTo(cx - 1, topY + 8);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx + 8, topY + 2); ctx.lineTo(cx + 17, topY - 4); ctx.lineTo(cx + 17, topY + 8);
        ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 8, topY + 2, 2.6, 0, Math.PI * 2); ctx.fill();
      } else if (acc.hat === 5) {    // graduation cap
        ctx.fillStyle = '#252b3a';
        ctx.beginPath(); ctx.arc(cx, topY + 5, 10, Math.PI, 0); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx, topY - 8); ctx.lineTo(cx + 17, topY - 1); ctx.lineTo(cx, topY + 6); ctx.lineTo(cx - 17, topY - 1);
        ctx.fill();
        ctx.strokeStyle = '#f3c53d';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx + 15, topY); ctx.lineTo(cx + 15, topY + 9); ctx.stroke();
        ctx.fillStyle = '#f3c53d';
        ctx.beginPath(); ctx.arc(cx + 15, topY + 10, 2.5, 0, Math.PI * 2); ctx.fill();
      }
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

  // iOS has ignored user-scalable=no and maximum-scale since iOS 10, so the page could still
  // be pinch-zoomed however the viewport meta was written. That is not just cosmetic: once
  // iOS decides a second finger begins a zoom gesture it takes ownership of the touch stream,
  // and the button that owned the first finger may never receive touchend or touchcancel.
  // The held direction then stays true forever — the key looks jammed, and pressing again
  // does nothing because the flag was already set. Blocking the gesture fixes both symptoms.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, e => e.preventDefault(), { passive: false });
  }
  document.addEventListener('touchmove', e => {
    if (e.touches.length > 1) e.preventDefault(); // pinch
  }, { passive: false });

  // Safety net, independent of which element the touch ended on: when the last finger leaves
  // the screen nothing can still be held. Also release when the tab is hidden or loses focus,
  // so switching apps mid-press cannot leave a direction stuck on return.
  const releaseHeld = () => { input.left = false; input.right = false; };
  window.addEventListener('touchend', e => { if (e.touches.length === 0) releaseHeld(); }, { passive: true });
  window.addEventListener('touchcancel', releaseHeld, { passive: true });
  window.addEventListener('pointercancel', releaseHeld, { passive: true });
  window.addEventListener('blur', releaseHeld);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseHeld(); });

  function bindHold(id, on, off) {
    const el = $(id);
    const start = e => { e.preventDefault(); on(); };
    const end = e => { e.preventDefault(); off(); };
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    // A touch that never reports its end on this element still releases via releaseHeld().
    el.addEventListener('lostpointercapture', off);
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

    if (preview) {
      $('qText').textContent = '6 × 7 等於多少？';
      $('qChoices').innerHTML = '';
      ['36', '42', '48', '54'].forEach((c, i) => {
        const btn = document.createElement('button');
        btn.className = 'q-choice';
        btn.textContent = c;
        btn.addEventListener('click', () => answer(i));
        $('qChoices').appendChild(btn);
      });
      return;
    }

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

    if (preview) {
      const correct = choice === 1;
      btns[choice].classList.add(correct ? 'correct' : 'wrong');
      if (!correct) btns[1].classList.add('correct');
      const fb = $('qFeedback');
      fb.textContent = correct ? '答啱喇！能量 +30 ⚡' : '差少少，正確答案係 42';
      fb.classList.add(correct ? 'good' : 'bad');
      if (correct) {
        game.energy = Math.min(100, game.energy + 30);
        setTimeout(closeQuestion, 850);
      } else {
        $('qClose').style.display = '';
      }
      return;
    }

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

  // Local-only art/physics preview for deterministic browser QA. It never
  // exists on deployed hosts and does not create or join a live classroom.
  const preview = new URLSearchParams(location.search).has('preview')
    && (location.hostname === '127.0.0.1' || location.hostname === 'localhost');
  if (preview) {
    clearInterval(roomsTimer);
    me = { name: 'Koko', studentId: 'preview' };
    myColor = PALETTE[Math.abs(hashCode(me.name)) % PALETTE.length];
    myAcc = accessoriesFor(me.name);
    startGame(20260711, 480, Date.now(), null);
  }
})();
