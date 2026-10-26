'use strict';

const { randomUUID } = require('crypto');

function pointsForAnswer(correct, elapsedMs, durationMs) {
  if (!correct) return 0;
  if (elapsedMs < 500) return 1000;
  return Math.round(1000 * (1 - Math.min(Math.max(0, elapsedMs), durationMs) / durationMs / 2));
}

function fail(message) { throw new Error(message); }

class QuizRoom {
  constructor({ code, set, hostName, seconds = 20, limit = 0, now = Date.now() }) {
    this.code = code;
    this.hostName = hostName;
    this.setTitle = set.title;
    this.questions = set.questions.slice(0, limit || set.questions.length);
    this.durationMs = Math.min(120, Math.max(5, Math.round(Number(seconds) || 20))) * 1000;
    this.phase = 'lobby';
    this.index = -1;
    this.roundId = null;
    this.players = new Map();
    this.answers = new Map();
    this.participants = new Set();
    this.hostConnected = true;
    this.createdAt = now;
  }

  join(key, name, now = Date.now()) {
    if (this.phase === 'ended' && !this.players.has(key)) fail('這個課堂已經結束。');
    let player = this.players.get(key);
    if (!player) {
      player = { key, name, score: 0, correct: 0, responseMs: 0, joinedAt: now, connected: true, last: null };
      this.players.set(key, player);
    }
    player.name = name;
    player.connected = true;
    if (this.phase === 'question' && now < this.closesAt) this.participants.add(key);
    return player;
  }

  startQuestion(now = Date.now()) {
    if (!['lobby', 'leaderboard'].includes(this.phase)) fail('請先顯示本題分數。');
    if (this.index + 1 >= this.questions.length) fail('已經沒有下一題。');
    if (![...this.players.values()].some(p => p.connected)) fail('未有學生加入。');
    this.index++;
    this.phase = 'question';
    this.roundId = randomUUID();
    this.opensAt = now + 3000;
    this.closesAt = this.opensAt + this.durationMs;
    this.answers = new Map();
    this.participants = new Set([...this.players.values()].filter(p => p.connected).map(p => p.key));
  }

  answer(key, roundId, choice, now = Date.now()) {
    if (!this.hostConnected) fail('老師正在重新連線，請稍候。');
    if (this.phase !== 'question' || roundId !== this.roundId) fail('這一題已結束。');
    if (now < this.opensAt) fail('這一題尚未開始。');
    if (now >= this.closesAt) fail('答題時間已結束。');
    if (!this.participants.has(key)) fail('請先加入課堂。');
    if (this.answers.has(key)) fail('你已經提交答案。');
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) fail('選項無效。');
    const correct = choice === this.questions[this.index].correctIndex;
    const responseMs = Math.max(0, now - this.opensAt);
    this.answers.set(key, { choice, correct, responseMs, points: pointsForAnswer(correct, responseMs, this.durationMs) });
    return this.answers.size === this.participants.size;
  }

  endQuestion() {
    if (this.phase !== 'question') return false;
    this.phase = 'results';
    for (const key of this.participants) {
      const player = this.players.get(key);
      const answer = this.answers.get(key);
      player.last = answer ? { ...answer } : { choice: null, correct: false, points: 0, responseMs: null };
      player.score += answer?.points || 0;
      if (answer?.correct) { player.correct++; player.responseMs += answer.responseMs; }
    }
    return true;
  }

  showLeaderboard() {
    if (this.phase !== 'results') fail('請先結束本題。');
    this.phase = 'leaderboard';
  }

  finish() { this.endQuestion(); this.phase = 'ended'; }

  leaderboard() {
    return [...this.players.values()]
      .sort((a, b) => b.score - a.score || b.correct - a.correct || a.responseMs - b.responseMs || a.joinedAt - b.joinedAt || a.key.localeCompare(b.key))
      .map((p, index) => ({ key: p.key, name: p.name, score: p.score, correct: p.correct, rank: index + 1, connected: p.connected, gained: this.participants.has(p.key) ? p.last?.points || 0 : 0 }));
  }

  common(now = Date.now()) {
    return { code: this.code, hostName: this.hostName, setTitle: this.setTitle, phase: this.phase,
      questionIndex: this.index, questionCount: this.questions.length, roundId: this.roundId,
      opensAt: this.opensAt || null, closesAt: this.closesAt || null, serverNow: now,
      answered: this.answers.size, total: this.participants.size, hostConnected: this.hostConnected };
  }

  hostView(now = Date.now()) {
    const state = this.common(now);
    state.roster = [...this.players.values()].map(p => ({ key: p.key, name: p.name, connected: p.connected }));
    if (this.index >= 0) {
      const question = this.questions[this.index];
      state.question = { question: question.question, image: question.image || null, choices: question.choices };
      if (['results', 'leaderboard', 'ended'].includes(this.phase)) {
        state.correctIndex = question.correctIndex;
        state.distribution = question.choices.map((_, choice) => ({ choice, voters: [...this.answers]
          .filter(([, answer]) => answer.choice === choice)
          .map(([key, answer]) => ({ key, name: this.players.get(key).name, points: answer.points, responseMs: answer.responseMs })) }));
        state.unanswered = [...this.participants].filter(key => !this.answers.has(key)).map(key => ({ key, name: this.players.get(key).name }));
      }
    }
    if (this.phase !== 'question') state.leaderboard = this.leaderboard();
    return state;
  }

  playerView(key, now = Date.now()) {
    const state = this.common(now);
    const player = this.players.get(key);
    state.me = { key, name: player.name, score: player.score, choice: this.answers.get(key)?.choice ?? null };
    if (['results', 'leaderboard', 'ended'].includes(this.phase)) {
      state.me.result = this.participants.has(key) ? player.last : null;
      state.me.rank = this.leaderboard().find(p => p.key === key)?.rank;
      state.correctIndex = this.index >= 0 ? this.questions[this.index].correctIndex : null;
      state.leaderboard = this.leaderboard();
    }
    return state;
  }
}

module.exports = { QuizRoom, pointsForAnswer };
