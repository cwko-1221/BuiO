'use strict';

// Build a consistent view once per roster broadcast. Repeatedly finding every
// student's tabs and matches for each recipient makes a school-wide heartbeat
// cubic in the number of connections, even when no roster packet is sent.
function presenceView(members, rooms, reserved, time, quote) {
  const students = new Map(), playing = new Set();
  for (const member of members.values()) {
    const profile = member.profile;
    let student = students.get(profile.id);
    if (!student) {
      student = { first: profile, last: profile, online: false, busy: false };
      students.set(profile.id, student);
    }
    student.last = profile;
    student.online ||= member.active && !member.locked && time - member.seenAt < 25000;
    student.busy ||= member.busy;
  }
  for (const room of rooms.values()) {
    if (!['finished', 'cancelled'].includes(room.meta.status)) {
      for (const player of room.meta.players) playing.add(player.id);
    }
  }
  const rows = [];
  for (const [id, student] of students) {
    if (!student.online) continue;
    const profile = student.last, hasFighter = profile.pets.length > 0;
    rows.push({ id, name: profile.name, className: profile.className, rank: profile.rank,
      available: !student.busy && !playing.has(id) && !reserved.has(id) && hasFighter,
      hasFighter });
  }
  rows.sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
  return {
    ids: new Set(students.keys()),
    // Heartbeats extend expiry without changing what anybody can see. Include
    // viewer ranks too: duplicate tabs may have different refreshed profiles.
    signature: JSON.stringify({ rows, viewers: [...students].map(([id, student]) => [id, student.first.rank]) }),
    peersFor(id) {
      const own = students.get(id)?.first;
      return rows.filter(row => row.id !== id).map(row => ({ ...row,
        rankTerms: own?.rank && row.rank ? quote([own.rank, row.rank]) : undefined }));
    },
  };
}

module.exports = { presenceView };
