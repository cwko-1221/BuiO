// Keep one acknowledged checkpoint in flight. Short strokes share the next
// checkpoint instead of encoding and sending the whole canvas after every dot.
export function createBoardSnapshots({ build, send, intervalMs = 1500, ackTimeoutMs = 5000, onResult = () => {} }) {
    let ready = false;
    let dirty = false;
    let closed = false;
    let timer = null;
    let flight = null;
    let nextAt = 0, publishedAt = -Infinity;

    const cancelTimer = () => { clearTimeout(timer); timer = null; };
    const schedule = () => {
        if (closed || !ready || !dirty || flight || timer) return;
        timer = setTimeout(publish, Math.max(0, nextAt - Date.now()));
    };
    function publish() {
        cancelTimer();
        if (closed || !ready || !dirty || flight) return;
        const token = {};
        flight = token;
        dirty = false;
        publishedAt = Date.now();
        nextAt = publishedAt + intervalMs;
        const finish = (saved) => {
            if (flight !== token) return;
            clearTimeout(token.timer);
            flight = null;
            if (!saved) dirty = true;
            schedule();
        };
        token.timer = setTimeout(() => finish(false), ackTimeoutMs);
        try {
            const snapshot = build();
            if (!snapshot) return finish(false);
            send(snapshot, (result) => { if (flight !== token) return; onResult(snapshot, result); finish(result?.success === true); });
        } catch {
            finish(false);
        }
    }
    function reset() {
        cancelTimer();
        clearTimeout(flight?.timer);
        flight = null;
        dirty = false;
    }
    return {
        changed() { dirty = true; schedule(); },
        settled() { dirty = true; nextAt = Math.max(publishedAt + 250, Math.min(nextAt, Date.now() + 60)); cancelTimer(); schedule(); },
        pending() { return dirty || !!flight; },
        connected() { ready = true; schedule(); },
        disconnected() {
            ready = false;
            cancelTimer();
            if (flight) dirty = true;
            clearTimeout(flight?.timer);
            flight = null;
        },
        flush() { publish(); },
        reset,
        close() { closed = true; reset(); },
    };
}
