// Keep edits newer than the accepted checkpoint, including edits that arrived
// before its bitmap finished decoding. Orders are assigned by the server.
export function createBoardTimeline() {
    let epoch, events = [], covered = { student: 0, teacher: 0 }, dropped = { student: 0, teacher: 0 };
    const clear = () => { epoch = undefined; events = []; covered = { student: 0, teacher: 0 }; dropped = { student: 0, teacher: 0 }; };
    function record(event) {
        const order = event.liveOrder;
        if (!order && !event.eventId) return true;
        if (order && epoch && epoch !== order.epoch) clear();
        if (order) epoch = order.epoch;
        const origin = event.origin || 'student';
        const existing = event.eventId && events.find(item => item.eventId === event.eventId);
        if (existing) { Object.assign(existing, event); return false; }
        if (order && order.order <= covered[origin]) return false;
        events.push({ ...event, origin });
        if (events.length > 4096) {
            const index = events.findIndex(item => item.liveOrder);
            if (index >= 0) { const [old] = events.splice(index, 1); dropped[old.origin] = Math.max(dropped[old.origin], old.liveOrder.order); }
            else events.shift();
        }
        return true;
    }
    function confirm(order) {
        if (!order) return []; // Compatibility for old, unversioned senders.
        if (epoch && epoch !== order.epoch) clear();
        epoch = order.epoch;
        if (order.student < covered.student || order.teacher < covered.teacher
            || order.student < dropped.student || order.teacher < dropped.teacher) return null;
        covered = { student: order.student, teacher: order.teacher };
        events = events.filter(event => !event.liveOrder || event.liveOrder.order > covered[event.origin]);
        return events;
    }
    return { record, confirm, clear };
}
