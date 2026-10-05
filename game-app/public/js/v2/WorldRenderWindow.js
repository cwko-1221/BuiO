export class WorldRenderWindow {
  constructor(objects, padding = 240) {
    this.padding = padding;
    this.nextUpdate = 0;
    this.lastView = null;
    this.entries = objects
      .filter(object => typeof object.getBounds === 'function' && object.scrollFactorX !== 0 && object.scrollFactorY !== 0)
      .map(object => ({ object, bounds: object.getBounds() }));
  }

  update(camera, time) {
    const view = camera.worldView;
    if (!view.width || !view.height) return;
    const last = this.lastView;
    if (last && time < this.nextUpdate && last.width === view.width && last.height === view.height
      && Math.abs(last.x - view.x) < this.padding / 2 && Math.abs(last.y - view.y) < this.padding / 2) return;
    this.nextUpdate = time + 80;
    this.lastView = { x: view.x, y: view.y, width: view.width, height: view.height };
    const left = view.x - this.padding, right = view.x + view.width + this.padding;
    const top = view.y - this.padding, bottom = view.y + view.height + this.padding;
    for (const { object, bounds } of this.entries) {
      const visible = bounds.x <= right && bounds.x + bounds.width >= left
        && bounds.y <= bottom && bounds.y + bounds.height >= top;
      // Camera filtering leaves trap visibility and every physics body untouched.
      object.cameraFilter = visible ? object.cameraFilter & ~camera.id : object.cameraFilter | camera.id;
    }
  }
}
