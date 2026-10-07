// Wait for the room join response before hiding the reconnect notice.
// Removing these listeners before disconnect avoids updates after unmount.
export function watchRoomConnection(socket, onChange) {
    const connecting = () => onChange('connecting');
    const disconnected = () => onChange('reconnecting');
    const teacherConnection = ({ connected, reconnecting }) => {
        onChange(!connected && reconnecting ? 'teacher-reconnecting' : 'connected');
    };

    onChange('connecting');
    socket.on('connect', connecting);
    socket.on('disconnect', disconnected);
    socket.on('connect_error', disconnected);
    socket.on('teacher-connection', teacherConnection);

    return () => {
        socket.off('connect', connecting);
        socket.off('disconnect', disconnected);
        socket.off('connect_error', disconnected);
        socket.off('teacher-connection', teacherConnection);
    };
}
