'use strict';

const rooms = new Map();
const MAP_IDS = new Set(['starport', 'moonwood', 'embercore']);

function makeCode() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    if (!rooms.has(code)) return code;
  }
  throw new Error('暫時無法建立房間代碼，請再試一次。');
}

function playerKey(studentId, socketId) {
  return studentId ? `s:${studentId}` : `a:${socketId}`;
}

function connectedPlayers(room) {
  return [...room.players.values()].filter(player => player.connected);
}

function roster(room) {
  return [...room.players.values()]
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map(player => ({
      key: player.key,
      name: player.name,
      studentId: player.studentId,
      connected: player.connected,
      mapId: player.mapId,
      status: player.status,
      wave: player.wave,
      score: player.score,
      quizCorrect: player.quizCorrect,
      quizAnswered: player.quizAnswered,
    }));
}

function publicSessions() {
  return [...rooms.values()]
    .filter(room => room.phase !== 'ended')
    .map(room => ({
      code: room.code,
      hostName: room.hostName,
      phase: room.phase,
      players: connectedPlayers(room).length,
      setTitle: room.set.title,
      difficulty: 'guardian',
    }));
}

function findPlayerForOwner(room, owner) {
  return room?.players.get(`s:${owner}`) || null;
}

module.exports = {
  MAP_IDS,
  rooms,
  connectedPlayers,
  findPlayerForOwner,
  makeCode,
  playerKey,
  publicSessions,
  roster,
};
