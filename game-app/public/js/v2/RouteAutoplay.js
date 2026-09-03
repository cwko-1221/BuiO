// Local-preview route playtester. It drives the same action map as a player:
// no teleports, altered gravity, extra speed, or collision bypasses.
export class RouteAutoplay {
  constructor(course, report = () => {}) {
    this.course = course;
    this.report = report;
    this.nodes = course.nodes.filter(node => node.route === 'main');
    this.objectById = new Map(course.objects.map(object => [object.id, object]));
    this.nodeIndexByObject = new Map(this.nodes.map((node, index) => [node.objectId, index]));
    this.targetIndex = 0;
    this.startedAt = 0;
    this.lastJumpAt = -Infinity;
    this.lastGroundedAt = 0;
    this.maxAltitude = 0;
    this.landings = new Set();
    this.resets = 0;
    this.status = 'waiting';
    this.lastReportAt = 0;
    this.lastTargetIndex = -1;
    this.targetChangedAt = 0;
  }

  start(time = 0) {
    this.startedAt = time;
    this.status = 'running';
    this.publish(time, true);
  }

  noteReset(checkpoint) {
    this.resets += 1;
    if (!checkpoint) return;
    let bestIndex = 0;
    let bestScore = Infinity;
    for (let index = 0; index < this.nodes.length; index += 1) {
      const node = this.nodes[index];
      if (node.altitude > checkpoint.altitude + 8) continue;
      const score = Math.abs(node.altitude - checkpoint.altitude) * 1000 + Math.abs(node.x - checkpoint.x);
      if (score < bestScore) { bestScore = score; bestIndex = index; }
    }
    this.targetIndex = Math.min(bestIndex + 1, this.nodes.length - 1);
    this.lastTargetIndex = -1;
  }

  finish(time) {
    this.status = 'passed';
    this.publish(time, true);
  }

  update(scene, time) {
    if (this.status === 'waiting') this.start(time);
    if (this.status !== 'running') return;

    const altitude = Math.max(0, (this.course.startAltitudeY - scene.player.y) / 5);
    this.maxAltitude = Math.max(this.maxAltitude, altitude);
    this.sceneX = scene.playerBody.position.x;
    this.sceneY = scene.playerBody.position.y;

    // A long connected runway can be crossed without the foot sensor touching
    // every tile. Advance past route centres the player has already cleared so
    // the tester never turns back for an obsolete tile.
    while (this.targetIndex > 0 && this.targetIndex < this.nodes.length) {
      const previous = this.nodes[this.targetIndex - 1];
      const target = this.nodes[this.targetIndex];
      const direction = Math.sign(target.x - previous.x);
      const passedX = direction > 0
        ? scene.playerBody.position.x >= target.x - 18
        : direction < 0
          ? scene.playerBody.position.x <= target.x + 18
          : false;
      const climbedPastRunwayTarget = target.altitude <= 5
        && scene.playerBody.position.y < target.y - 70
        && Math.abs(scene.playerBody.position.x - target.x) < 210;
      if (target.altitude > 5 || (!passedX && !climbedPastRunwayTarget)) break;
      this.targetIndex += 1;
    }

    const standingIndexes = [...scene.groundContacts.values()]
      .map(body => this.nodeIndexByObject.get(body.courseObject?.id))
      .filter(Number.isInteger);
    if (scene.grounded && standingIndexes.length) {
      const standingIndex = Math.max(...standingIndexes);
      this.landings.add(this.nodes[standingIndex].id);
      this.targetIndex = Math.max(this.targetIndex, standingIndex + 1);
      this.lastGroundedAt = time;
    }

    if (this.targetIndex !== this.lastTargetIndex) {
      this.lastTargetIndex = this.targetIndex;
      this.targetChangedAt = time;
    }

    if (this.targetIndex >= this.nodes.length) {
      const summitDx = this.course.summit.x - scene.playerBody.position.x;
      scene.actions.left = summitDx < -8;
      scene.actions.right = summitDx > 8;
      if (scene.grounded && time - this.lastJumpAt > 240) {
        scene.queueJump();
        this.lastJumpAt = time;
      }
      this.publish(time);
      return;
    }

    const target = this.nodes[this.targetIndex];
    const dx = target.x - scene.playerBody.position.x;
    const dy = target.y - scene.playerBody.position.y;
    const deadzone = scene.grounded ? 7 : 18;
    scene.actions.left = dx < -deadzone;
    scene.actions.right = dx > deadzone;

    if (scene.grounded) {
      const needsJump = dy < -10 || Math.abs(dx) > 96;
      const direction = Math.sign(dx);
      const velocityAligned = direction === 0 || (
        Math.sign(scene.playerBody.velocity.x) === direction && Math.abs(scene.playerBody.velocity.x) >= 3.2
      );
      const readyToJump = velocityAligned || time - this.targetChangedAt > 260;
      if (needsJump && readyToJump && time - this.lastJumpAt > 210) {
        scene.queueJump();
        this.lastJumpAt = time;
      }
    } else {
      const airborneFor = time - this.lastGroundedAt;
      const targetObject = this.objectById.get(target.objectId);
      const demandingEdge = targetObject?.tags?.includes('double-jump-gap') || dy < -45 || Math.abs(dx) > 205;
      const launcherStillBoosting=time<(scene.launcherBoostUntil||0);
      const needsSecondJump = !launcherStillBoosting && demandingEdge && scene.airJump > 0 && airborneFor > 210 && (
        scene.playerBody.velocity.y > -3.2 || dy < -72 || Math.abs(dx) > 150
      );
      if (needsSecondJump && time - this.lastJumpAt > 190) {
        scene.queueJump();
        this.lastJumpAt = time;
      }
    }

    this.publish(time);
  }

  publish(time, force = false) {
    if (!force && time - this.lastReportAt < 180) return;
    this.lastReportAt = time;
    const target = this.nodes[Math.min(this.targetIndex, this.nodes.length - 1)];
    this.report({
      status: this.status,
      mapVersion: this.course.mapVersion,
      elapsedMs: Math.max(0, time - this.startedAt),
      targetIndex: this.targetIndex,
      targetCount: this.nodes.length,
      targetId: target?.id || null,
      maxAltitude: Math.round(this.maxAltitude * 10) / 10,
      landings: this.landings.size,
      resets: this.resets,
      targetX: Math.round(target?.x || 0),
      targetY: Math.round(target?.y || 0),
      playerX: Math.round(this.sceneX || 0),
      playerY: Math.round(this.sceneY || 0)
    });
  }
}
