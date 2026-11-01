// The simulator fixture can have requests from a page that is unloading.
// A navigation belongs to its source page and stays queued until the target
// reports ready. Only the export-dismiss action is intentionally one-shot.
export class FixtureNavigation {
  pending;
  issue(from, command) { this.pending = { from, command }; }
  read(from) {
    if (!this.pending || this.pending.from !== from) return null;
    const command = this.pending.command;
    if (typeof command !== 'string') this.pending = undefined;
    return command;
  }
  acknowledge(path) {
    if (typeof this.pending?.command === 'string' && this.pending.command === path) this.pending = undefined;
  }
  clear() { this.pending = undefined; }
}
