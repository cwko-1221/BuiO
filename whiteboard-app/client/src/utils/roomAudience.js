export function initialRoomAudience(roomId) {
    try {
        const rules = JSON.parse(sessionStorage.getItem(`whiteboard-audience:${roomId}`) || '[]');
        return Array.isArray(rules) ? rules : [];
    } catch { return []; }
}

export function saveRoomAudience(roomId, rules) {
    try { sessionStorage.setItem(`whiteboard-audience:${roomId}`, JSON.stringify(rules)); }
    catch { /* The server remains the source of truth when storage is unavailable. */ }
}
