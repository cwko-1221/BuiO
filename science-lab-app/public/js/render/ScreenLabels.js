import * as THREE from 'three';

// Browser text stays crisp at any render resolution and camera angle.
// Pointer events pass through to the original 3D interaction surfaces.
export class ScreenLabels {
  constructor(renderer) {
    this.renderer = renderer;
    this.point = new THREE.Vector3();
    this.projected = new THREE.Vector3();
    this.entries = [];
    this.layer = document.createElement('div');
    this.layer.className = 'science-apparatus-label-layer';
    this.layer.setAttribute('aria-label', window.BuiI18n?.pick?.('器材名稱', 'Apparatus labels') || '器材名稱');
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('aria-hidden', 'true');
    this.layer.append(this.svg);
    document.body.append(this.layer);
  }

  setEntries(entries) {
    this.clear();
    this.entries = entries.map(({ entity, point, fixed, overlay }) => {
      const anchor = point.clone();
      const host = fixed ? this.renderer.experimentRoot : entity.object;
      host.worldToLocal(anchor);
      const node = document.createElement('div');
      node.className = 'science-apparatus-label' + (overlay ? ' science-apparatus-label--card' : '');
      node.dataset.entity = entity.id;
      node.textContent = entity.label;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.hidden = Boolean(overlay);
      this.svg.append(line);
      this.layer.append(node);
      return { entity, host, anchor, node, line, overlay };
    });
    this.update();
  }

  update() {
    const renderer = this.renderer;
    this.layer.hidden = renderer.mode !== 'lab' || !document.querySelector('#stageScreen')?.hidden
      || Boolean(document.querySelector('dialog[open]'));
    if (this.layer.hidden) return;
    const { width, height } = renderer.canvas.getBoundingClientRect();
    const top = (document.querySelector('#topbar')?.getBoundingClientRect().bottom || 0) + 8;
    const obstacles = [...document.querySelectorAll('.lab-heading, .mission-panel:not(.collapsed), .mission-panel-toggle, .variable-control:not([hidden]), .record-panel:not([hidden]), .view-controls')]
      .filter(node => getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).display !== 'none')
      .map(node => node.getBoundingClientRect()).filter(rect => rect.width && rect.height);
    const occupied = [];
    const action = renderer.currentStep?.action;
    const overlap = (a, b) => a.left < b.right + 6 && a.right + 6 > b.left && a.top < b.bottom + 5 && a.bottom + 5 > b.top;
    for (const entry of this.entries) {
      this.point.copy(entry.anchor);
      entry.host.localToWorld(this.point);
      this.projected.copy(this.point).project(renderer.camera);
      const visible = this.projected.z > -1 && this.projected.z < 1;
      entry.node.hidden = !visible;
      entry.line.style.display = visible && !entry.overlay ? '' : 'none';
      if (!visible) continue;
      const targetX = (this.projected.x * .5 + .5) * width;
      const targetY = (-this.projected.y * .5 + .5) * height;
      const w = entry.node.offsetWidth;
      const h = entry.node.offsetHeight;
      let best;
      const offsets = entry.overlay ? [[0, -h / 2]] : [
        [0, 10], [0, -h - 12], [0, 48], [0, -h - 50], [0, 86], [0, -h - 88],
        [-w / 2 - 14, 10], [w / 2 + 14, 10], [0, 124], [0, -h - 126],
      ];
      for (const [dx, dy] of offsets) {
        const x = THREE.MathUtils.clamp(targetX + dx, w / 2 + 10, Math.max(w / 2 + 10, width - w / 2 - 10));
        const y = THREE.MathUtils.clamp(targetY + dy, top, Math.max(top, height - h - 12));
        const box = { left: x - w / 2, right: x + w / 2, top: y, bottom: y + h };
        const score = Math.abs(dx) + Math.abs(dy) + occupied.filter(other => overlap(box, other)).length * 3000
          + (entry.overlay ? 0 : obstacles.filter(other => overlap(box, other)).length * 2000);
        if (!best || score < best.score) best = { x, y, box, score };
      }
      occupied.push(best.box);
      entry.node.style.transform = `translate(${Math.round(best.x)}px,${Math.round(best.y)}px) translateX(-50%)`;
      entry.node.classList.toggle('is-active', action?.subject === entry.entity.id || action?.target === entry.entity.id);
      entry.line.setAttribute('d', `M ${targetX.toFixed(1)} ${targetY.toFixed(1)} L ${best.x.toFixed(1)} ${(best.y + h / 2).toFixed(1)}`);
    }
  }

  getStats() {
    return { count: this.entries.length, visible: !this.layer.hidden, type: 'html', ids: this.entries.map(entry => entry.entity.id) };
  }

  clear() {
    for (const entry of this.entries) { entry.node.remove(); entry.line.remove(); }
    this.entries = [];
    this.layer.hidden = true;
  }

  dispose() { this.clear(); this.layer.remove(); }
}
