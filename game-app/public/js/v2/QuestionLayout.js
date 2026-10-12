// Fit the entire question, including feedback and the continue button, inside
// the visible viewport. Scale the card only; never truncate or scroll its text.
export class QuestionLayout {
  constructor(overlay) {
    this.overlay = overlay;
    this.frame = overlay.querySelector('.q-fit');
    this.box = overlay.querySelector('.q-box');
    this.image = overlay.querySelector('.q-image');
    this.pending = 0;
    this.schedule = () => {
      if (!this.pending) this.pending = requestAnimationFrame(() => { this.pending = 0; this.fit(); });
    };
    this.resize = new ResizeObserver(this.schedule);
    this.resize.observe(this.box);
    this.changes = new MutationObserver(this.schedule);
    this.changes.observe(this.box, { subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['hidden', 'class', 'src', 'style'] });
    this.visibility = new MutationObserver(this.schedule);
    this.visibility.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    this.image.addEventListener('load', this.schedule);
    this.image.addEventListener('error', this.schedule);
    window.addEventListener('resize', this.schedule);
    window.visualViewport?.addEventListener('resize', this.schedule);
    window.visualViewport?.addEventListener('scroll', this.schedule);
    document.fonts?.ready.then(this.schedule);
    document.fonts?.addEventListener('loadingdone', this.schedule);
  }

  fit() {
    if (!this.overlay.classList.contains('open')) return;
    const viewport = window.visualViewport;
    const width = viewport?.width || window.innerWidth;
    const height = viewport?.height || window.innerHeight;
    this.set(this.overlay, 'left', `${viewport?.offsetLeft || 0}px`);
    this.set(this.overlay, 'top', `${viewport?.offsetTop || 0}px`);
    this.set(this.overlay, 'width', `${width}px`);
    this.set(this.overlay, 'height', `${height}px`);
    const padding = getComputedStyle(this.overlay);
    const availableWidth = Math.max(1, width - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight));
    const availableHeight = Math.max(1, height - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom));
    const landscapeImage = !this.image.hidden && width >= 700 && width > height;
    this.box.classList.toggle('q-landscape-image', landscapeImage);
    this.set(this.box, 'width', `${Math.min(availableWidth, landscapeImage ? 1000 : 640)}px`);
    this.set(this.box, '--q-image-height', `${Math.min(280, availableHeight * .48)}px`);
    const contentWidth = Math.max(this.box.offsetWidth, this.box.scrollWidth);
    const contentHeight = Math.max(this.box.offsetHeight, this.box.scrollHeight);
    const scale = Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight);
    this.set(this.box, 'transform', `scale(${scale})`);
    this.set(this.frame, 'width', `${contentWidth * scale}px`);
    this.set(this.frame, 'height', `${contentHeight * scale}px`);
  }

  set(element, property, value) {
    if (element.style.getPropertyValue(property) !== value) element.style.setProperty(property, value);
  }
}
