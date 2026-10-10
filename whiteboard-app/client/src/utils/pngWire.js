export function pngToWire(value) {
    if (typeof value !== 'string' || !value.startsWith('data:image/png;base64,')) return value;
    const raw = atob(value.slice('data:image/png;base64,'.length));
    return Uint8Array.from(raw, character => character.charCodeAt(0));
}
export function pngFromWire(value) {
    if (typeof value === 'string') return value;
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value instanceof Uint8Array ? value : null;
    if (!bytes || bytes.length > 3_750_000) return null;
    const parts = [];
    for (let offset = 0; offset < bytes.length; offset += 8192) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
    return 'data:image/png;base64,' + btoa(parts.join(''));
}
