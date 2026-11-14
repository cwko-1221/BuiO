import * as THREE from 'three';

// Presentation for the competition edition. Text is rendered by the browser,
// independently of WebGL resolution, lighting and perspective.
const APPARATUS = [
  { id: 'hot-bath-bowl', text: '熱水盆', kind: 'hot', offset: [0, .02, 1.35] },
  { id: 'ice-bath-bowl', text: '冰水盆', kind: 'cold', offset: [0, .02, 1.35] },
  { id: 'bottle', text: '硬身膠樽', kind: 'neutral', offset: [0, -.03, .65] },
  { id: 'water-temperature', text: '熱水溫度掣', kind: 'hot', offset: [0, -.12, .8] },
  { id: 'balloon', text: '氣球', kind: 'neutral', offset: [0, .5, 0], above: true },
];

export class AirLabPresentation {
  constructor(renderer) {
    this.renderer = renderer;
    this.worldPoint = new THREE.Vector3();
    this.projected = new THREE.Vector3();
    this.layer = document.createElement('div');
    this.layer.className = 'air-label-layer';
    this.layer.setAttribute('aria-label', '實驗器材名稱');
    this.lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.lines.classList.add('air-label-lines');
    this.lines.setAttribute('aria-hidden', 'true');
    this.layer.append(this.lines);
    this.labels = APPARATUS.map(item => {
      const node = document.createElement('div');
      node.className = `air-label air-label--${item.kind}`;
      node.dataset.apparatus = item.id;
      const dot = document.createElement('i');
      const text = document.createElement('span');
      text.textContent = window.BuiI18n.t(`air.label.${item.id}`);
      node.append(dot, text);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      this.lines.append(line);
      this.layer.append(node);
      return { ...item, node, textNode: text, line, offset: new THREE.Vector3(...item.offset) };
    });
    this.readout = document.createElement('section');
    this.readout.className = 'air-readout';
    this.readout.setAttribute('aria-label', 'Live scientific readings');
    this.readout.innerHTML = `<div class="air-readout-heading"><span data-i18n="air.live">即時觀測</span><i></i><small>LIVE</small></div>
      <div class="air-readings"><div><span data-reading="temperature-label">室溫</span><strong data-reading="temperature">22<small>°C</small></strong></div>
      <div><span data-i18n="air.volume">空氣體積變化</span><strong data-reading="volume">0<small>mL</small></strong></div></div>
      <p data-reading="status">先把氣球套上樽口</p><footer data-i18n="air.reference">基準：22 °C · 500 mL 空氣</footer>`;
    this.temperature = this.readout.querySelector('[data-reading="temperature"]');
    this.temperatureLabel = this.readout.querySelector('[data-reading="temperature-label"]');
    this.volume = this.readout.querySelector('[data-reading="volume"]');
    this.status = this.readout.querySelector('[data-reading="status"]');
    document.body.append(this.layer, this.readout);
    window.BuiI18n.apply();
    this.lastReading = '';
  }

  mount() {
    // The old name plates and canvas display are replaced by sharp DOM text.
    this.renderer.experimentRoot.traverse(object => {
      if (object.userData.canvasTexture && object.userData.setText) object.visible = false;
    });
    this.lastReading = '';
    this.update();
  }

  update() {
    const renderer = this.renderer;
    const state = renderer.sceneController?.getState?.();
    const hidden = renderer.mode !== 'lab' || !state
      || !document.querySelector('#stageScreen').hidden
      || Boolean(document.querySelector('dialog[open]'));
    this.layer.hidden = hidden;
    this.readout.hidden = hidden;
    if (hidden) return;
    if (renderer.selectionHelper) renderer.selectionHelper.visible = false;

    const t = window.BuiI18n.t;
    const reading = `${window.BuiI18n.lang}|${state.attached}|${state.bath}|${state.waterTemperature}|${state.balloonVolumeMl}`;
    if (reading !== this.lastReading) {
      const value = Math.round(state.balloonVolumeMl);
      this.temperatureLabel.textContent = t(state.bath ? 'air.water' : 'air.room');
      this.temperature.innerHTML = `${state.waterTemperature}<small>°C</small>`;
      this.volume.innerHTML = `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}<small>mL</small>`;
      this.status.textContent = t(!state.attached ? 'air.attach'
        : state.bath === 'hot' ? 'air.expands' : state.bath === 'ice' ? 'air.contracts' : 'air.attached');
      this.readout.dataset.bath = state.bath || 'room';
      this.lastReading = reading;
    }

    const { width, height } = renderer.canvas.getBoundingClientRect();
    const mobile = width <= 620;
    const floor = mobile ? 272 : 136;
    const ceiling = height - (mobile ? 164 : 100);
    const occupied = [];
    const active = renderer.currentStep?.action;
    for (const label of this.labels) {
      label.textNode.textContent = t(`air.label.${label.id}`);
      const entity = renderer.entities.get(label.id);
      if (!entity) { label.node.hidden = true; continue; }
      label.node.hidden = false;
      entity.object.getWorldPosition(this.worldPoint);
      this.worldPoint.add(label.offset);
      this.projected.copy(this.worldPoint).project(renderer.camera);
      const pointX = (this.projected.x * .5 + .5) * width;
      const pointY = (-this.projected.y * .5 + .5) * height;
      const w = label.node.offsetWidth || label.text.length * 16 + 36;
      const h = label.node.offsetHeight || 36;
      const x = THREE.MathUtils.clamp(pointX, w / 2 + 12, width - w / 2 - 12);
      const initialY = pointY + (label.above ? -48 : 18);
      let y = THREE.MathUtils.clamp(initialY, floor, ceiling - h);
      const candidates = [0, 42, -42, 84, -84, 126, -126];
      for (const dy of candidates) {
        const candidate = THREE.MathUtils.clamp(initialY + dy, floor, ceiling - h);
        const collision = occupied.some(box => Math.abs(box.x - x) < (box.w + w) / 2 + 8
          && candidate < box.y + box.h + 7 && candidate + h + 7 > box.y);
        if (!collision) { y = candidate; break; }
      }
      occupied.push({ x, y, w, h });
      label.node.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) translateX(-50%)`;
      const on = active?.subject === label.id
        || (active?.target === 'hot-bath' && label.id === 'hot-bath-bowl')
        || (active?.target === 'ice-bath' && label.id === 'ice-bath-bowl');
      label.node.classList.toggle('is-active', on);
      label.line.setAttribute('d', `M ${pointX.toFixed(1)} ${pointY.toFixed(1)} L ${x.toFixed(1)} ${(y + h / 2).toFixed(1)}`);
    }
  }

  dispose() {
    this.layer.remove();
    this.readout.remove();
  }
}
