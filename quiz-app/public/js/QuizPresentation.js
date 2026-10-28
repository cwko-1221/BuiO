export class QuizPresentation {
  constructor(main) {
    this.main = main;
    this.key = null;
    this.animations = [];
    this.scoreFrames = [];
    this.scores = new Map();
    this.scoreTargets = new Map();
    this.rowPositions = new Map();
    this.seenPlayers = new Set();
    this.effects = new Set();
    this.confettiTimer = null;
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.onMotionChange = () => { if (this.motion.matches) this.clear(); };
    this.motion.addEventListener('change', this.onMotionChange);
  }

  clear() {
    this.animations.forEach(animation => animation.cancel()); this.animations = [];
    this.scoreFrames.forEach(cancelAnimationFrame); this.scoreFrames = [];
    for (const [cell, value] of this.scoreTargets) if (cell.isConnected) cell.textContent = value.toLocaleString();
    this.scoreTargets.clear();
    clearTimeout(this.confettiTimer);
    document.getElementById('quizConfetti')?.remove();
    for (const effect of this.effects) { clearTimeout(effect.timer); effect.node.remove(); }
    this.effects.clear();
  }

  animate(node, frames, options = {}) {
    if (node?.animate && !this.motion.matches) this.animations.push(node.animate(frames, { duration: 360, easing: 'cubic-bezier(.2,.7,.2,1)', ...options }));
  }

  capturePositions() {
    const rows = [...this.main.querySelectorAll('tbody tr[data-player-key]')];
    if (rows.length) this.rowPositions = new Map(rows.map(row => [row.dataset.playerKey, row.getBoundingClientRect().top]));
  }

  joinedPlayers() {
    for (const node of this.main.querySelectorAll('#roster [data-player-key]')) {
      if (this.seenPlayers.has(node.dataset.playerKey)) continue;
      this.seenPlayers.add(node.dataset.playerKey);
      this.animate(node, [{ opacity: 0, transform: 'translateY(12px) scale(.96)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 420 });
    }
  }

  present(state, { host }) {
    const key = `${state.code}:${state.phase}:${state.roundId}`;
    if (key === this.key) return;
    this.key = key; this.clear();
    this.main.dataset.phase = state.phase;
    this.animate(this.main.firstElementChild, [{ opacity: .35, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 380 });
    if (state.phase === 'lobby') this.animate(this.main.querySelector('.trophy-art'),
      [{ opacity: 0, transform: 'translateY(20px) rotate(-6deg) scale(.85)' }, { opacity: 1, transform: 'translateY(0) rotate(0) scale(1)' }], { duration: 700 });
    if (state.phase === 'question') {
      this.main.querySelectorAll('.choice').forEach((node, index) => this.animate(node,
        [{ opacity: 0, transform: 'translateY(22px) scale(.97)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { delay: index * 65, duration: 380 }));
      this.animate(this.main.querySelector('.time-track'), [{ transform: 'scaleX(.4)', opacity: .3 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 500 });
    }
    if (state.phase === 'results' && host) {
      this.main.querySelectorAll('.bar-fill').forEach((node, index) => this.animate(node,
        [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1.04)', offset: .8 }, { transform: 'scaleY(1)' }], { delay: index * 85, duration: 650 }));
      this.animate(this.main.querySelector('.correct-label'), [{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'scale(1)' }], { delay: 250, duration: 360 });
      this.particles(this.main.querySelector('.correct-label'), 9, ['#f0c442', '#159c82', '#2563c4']);
    }
    if (state.phase === 'results' && state.me?.result?.correct) {
      this.animate(this.main.querySelector('.personal-result'), [{ transform: 'scale(.85)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }]);
      this.confetti(26);
    }
    if (state.phase === 'results' && !host) {
      this.animate(this.main.querySelector('.feedback-mark'),
        [{ transform: 'scale(.5) rotate(-18deg)', opacity: 0 }, { transform: 'scale(1.12) rotate(5deg)', opacity: 1, offset: .75 }, { transform: 'scale(1) rotate(0)', opacity: 1 }], { duration: 500 });
    }
    if (['leaderboard', 'ended'].includes(state.phase)) {
      this.main.querySelectorAll('tbody tr').forEach((node, index) => {
        const old = this.rowPositions.get(node.dataset.playerKey);
        const delta = old == null ? 18 : Math.max(-240, Math.min(240, old - node.getBoundingClientRect().top));
        this.animate(node, [{ transform: `translateY(${delta}px)`, opacity: .25 }, { transform: 'translateY(0)', opacity: 1 }], { delay: Math.min(index, 8) * 40, duration: 480 });
      });
      if (!this.motion.matches) this.countScores(state.leaderboard || []);
      else for (const row of state.leaderboard || []) this.scores.set(row.key, row.score);
    }
    if (state.phase === 'ended') {
      this.main.querySelectorAll('.podium-step').forEach((node, index) => this.animate(node,
        [{ transform: 'scaleY(.3)', opacity: 0 }, { transform: 'scaleY(1)', opacity: 1 }], { delay: index * 140, duration: 650 }));
      this.animate(this.main.querySelector('.final-trophy'),
        [{ transform: 'scale(.65) rotate(-12deg)', opacity: 0 }, { transform: 'scale(1.08) rotate(4deg)', opacity: 1, offset: .75 }, { transform: 'scale(1) rotate(0)', opacity: 1 }], { duration: 800 });
      this.particles(this.main.querySelector('.final-trophy'), 14, ['#f0c442', '#d44360', '#2563c4']);
      this.confetti(54);
    }
  }

  countScores(rows) {
    const cells = [...this.main.querySelectorAll('.score-value')];
    rows.forEach((row, index) => {
      const cell = cells[index], from = this.scores.get(row.key) || 0;
      this.scores.set(row.key, row.score);
      if (!cell || from === row.score) return;
      this.scoreTargets.set(cell, row.score);
      const started = performance.now();
      const update = now => {
        if (!cell.isConnected) return;
        const progress = Math.min(1, (now - started) / 650);
        cell.textContent = Math.round(from + (row.score - from) * (1 - (1 - progress) ** 3)).toLocaleString();
        if (progress < 1) this.scoreFrames.push(requestAnimationFrame(update));
      };
      this.scoreFrames.push(requestAnimationFrame(update));
    });
  }

  confetti(count) {
    if (this.motion.matches) return;
    document.getElementById('quizConfetti')?.remove();
    const layer = document.createElement('div'); layer.id = 'quizConfetti'; layer.setAttribute('aria-hidden', 'true');
    const colors = ['#c63d51', '#176abc', '#e8b51a', '#188468'];
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('i');
      piece.style.cssText = `--x:${(i * 71 % 100)}vw;--drift:${(i % 2 ? 1 : -1) * (40 + i % 65)}px;--delay:${i % 9 * 45}ms;--spin:${(i % 2 ? 1 : -1) * 420}deg;background:${colors[i % colors.length]}`;
      layer.appendChild(piece);
    }
    document.body.appendChild(layer);
    this.confettiTimer = setTimeout(() => layer.remove(), 2300);
  }

  particles(anchor, count = 8, colors = ['#fff', '#f0c442']) {
    if (!anchor || this.motion.matches || document.hidden) return;
    const bounds = anchor.getBoundingClientRect();
    const node = document.createElement('div'); node.className = 'quiz-sparks'; node.setAttribute('aria-hidden', 'true');
    node.style.left = `${bounds.left + bounds.width / 2}px`; node.style.top = `${bounds.top + bounds.height / 2}px`;
    for (let i = 0; i < Math.min(count, 16); i++) {
      const angle = i / count * Math.PI * 2, distance = 35 + (i % 4) * 15;
      const piece = document.createElement('i');
      piece.style.cssText = `--dx:${Math.cos(angle) * distance}px;--dy:${Math.sin(angle) * distance}px;--rotation:${i * 47}deg;background:${colors[i % colors.length]}`;
      node.appendChild(piece);
    }
    document.body.appendChild(node);
    const effect = { node, timer: setTimeout(() => { node.remove(); this.effects.delete(effect); }, 850) };
    this.effects.add(effect);
  }

  submitted(button) {
    this.animate(button, [{ transform: 'scale(1)' }, { transform: 'scale(.96)', offset: .35 }, { transform: 'scale(1)' }], { duration: 320 });
    this.particles(button, 10);
  }

  tick(clock, { preparing = false } = {}) {
    this.animate(clock, [{ transform: 'scale(1.16) rotate(-2deg)' }, { transform: 'scale(1) rotate(0)' }], { duration: 250 });
    if (preparing) this.particles(clock, 6, ['#f0c442', '#2563c4', '#d44360']);
  }

  destroy() { this.clear(); this.motion.removeEventListener('change', this.onMotionChange); }
}
