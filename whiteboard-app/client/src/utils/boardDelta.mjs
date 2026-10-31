// Track acknowledged lengths: a teacher and student may draw simultaneously.
// Resend from the earliest growing stroke,
// rather than copying/encoding the whole canvas after each pointer movement.
export function createBoardDelta() {
    let epoch, sequence, acknowledged, base, lastAck, boardGeneration, lastAccepted, lengths;
    const reset = () => { epoch = crypto.randomUUID(); sequence = 0; acknowledged = 0; base = undefined; lastAck = 0; lengths = []; };
    reset();
    return {
        reset,
        get generationId() { return boardGeneration; },
        generation(value) { if (typeof value === 'string' && value !== boardGeneration) { boardGeneration = value; lastAccepted = null; reset(); } },
        isOlder(snapshot) { return !!lastAccepted && snapshot.epoch === lastAccepted.epoch && snapshot.seq < lastAccepted.seq; },
        build({ strokes, shapes, baseImageData }) {
            const replace = base !== baseImageData || strokes.length < acknowledged;
            let start = replace ? 0 : Math.max(0, acknowledged - 1);
            for (let i = 0; i < start; i++) if (strokes[i].points.length !== lengths[i]) { start = i; break; }
            return { protocol: 2, boardGeneration, epoch, seq: ++sequence, replace, start,
                strokes: strokes.slice(start).map(s => ({ ...s, points: s.points.map(p => ({ ...p })) })),
                shapes: shapes.map(s => ({ ...s })), ...(replace ? { baseImageData } : {}) };
        },
        result(packet, result) {
            if (packet.epoch !== epoch || packet.seq <= lastAck) return;
            if (result?.needsReset) { if (result.boardGeneration) boardGeneration = result.boardGeneration; reset(); return; }
            if (result?.success) {
                lastAck = packet.seq;
                lastAccepted = { epoch: packet.epoch, seq: packet.seq };
                acknowledged = packet.start + packet.strokes.length;
                lengths = [...lengths.slice(0, packet.start), ...packet.strokes.map(stroke => stroke.points.length)];
                if (packet.replace) base = packet.baseImageData;
            }
        },
    };
}
