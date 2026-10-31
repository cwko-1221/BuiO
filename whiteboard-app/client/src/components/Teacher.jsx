import { paintStrokes } from '../utils/paintBoard';
import { pngFromWire } from '../utils/pngWire';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { io } from 'socket.io-client';
import styles from './Teacher.module.css';
import { renderShapeLayer } from '../utils/drawing';
import { watchRoomConnection } from '../utils/roomConnection';
import ConnectionNotice from './ConnectionNotice';
import AudienceButton from './AudienceButton';
import { initialRoomAudience, saveRoomAudience } from '../utils/roomAudience';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;
const STUDENTS_PER_PAGE = 12;
const OFFSCREEN_WIDTH = 800;
const OFFSCREEN_HEIGHT = 600;

export default function Teacher() {
    const [searchParams] = useSearchParams();
    const roomId = searchParams.get('room');

    const socketRef = useRef(null);

    // students: [{ socketId, name }]
    const [students, setStudents] = useState([]);
    const [requestedPage, setPage] = useState(0);
    const page = Math.min(requestedPage, Math.max(0, Math.ceil(students.length / STUDENTS_PER_PAGE) - 1));
    const [zoomedStudent, setZoomedStudent] = useState(null); // socketId or null
    const [showLargeQR, setShowLargeQR] = useState(false);
    const [locked, setLocked] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('connecting');

    // Teacher drawing state
    const [teacherActiveTool, setTeacherActiveTool] = useState('pen');
    const isTeacherDrawing = useRef(false);
    const teacherLastPos = useRef({ normX: 0, normY: 0 });

    // Special offscreen canvas for the Teacher Board
    const teacherOffscreenRef = useRef(null);

    // Map<socketId, { canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D }>
    const offscreenCanvasesRef = useRef(new Map());
    // Map<socketId, { drawing: boolean }> — track per-student drawing state for beginPath
    const drawStateRef = useRef(new Map());

    // Refs for visible grid canvases
    const gridCanvasRefs = useRef(new Map());
    // Ref for zoomed canvas
    const zoomCanvasRef = useRef(null);
    const requestPaintRef = useRef(() => {});
    const markChanged = useCallback((id) => {
        const board = id === 'teacher' ? teacherOffscreenRef.current : offscreenCanvasesRef.current.get(id);
        if (board) board.revision = (board.revision || 0) + 1;
        requestPaintRef.current();
    }, []);

    useEffect(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 900;
        const ctx = canvas.getContext('2d');
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        teacherOffscreenRef.current = { canvas, ctx };
    }, []);

    const getOrCreateOffscreen = useCallback((studentId) => {
        if (!offscreenCanvasesRef.current.has(studentId)) {
            const canvas = document.createElement('canvas');
            canvas.width = OFFSCREEN_WIDTH;
            canvas.height = OFFSCREEN_HEIGHT;
            const ctx = canvas.getContext('2d');
            const shapeCanvas = document.createElement('canvas');
            shapeCanvas.width = OFFSCREEN_WIDTH;
            shapeCanvas.height = OFFSCREEN_HEIGHT;
            const shapeCtx = shapeCanvas.getContext('2d');
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            shapeCtx.lineCap = 'round';
            shapeCtx.lineJoin = 'round';
            // White background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
            offscreenCanvasesRef.current.set(studentId, { canvas, ctx, shapeCanvas, shapeCtx, shapes: [] });
        }
        return offscreenCanvasesRef.current.get(studentId);
    }, []);

    // Socket setup
    useEffect(() => {
        if (!roomId) return;

        socketRef.current = io(SERVER_URL);
        const stopWatchingConnection = watchRoomConnection(socketRef.current, setConnectionStatus);
        socketRef.current.on('lock-board', () => setLocked(true));
        socketRef.current.on('unlock-board', () => setLocked(false));

        socketRef.current.on('connect', () => {
            socketRef.current.emit('join-room', { roomId, name: 'Teacher', isTeacher: true, audienceRules: initialRoomAudience(roomId) });
        });
        socketRef.current.on('room-audience', data => saveRoomAudience(roomId, data.audienceRules));

        socketRef.current.on('student-list', (list) => {
            setStudents(list);
            // Clean up offscreen canvases for students who left
            const activeIds = new Set(list.map(s => s.socketId));
            for (const id of offscreenCanvasesRef.current.keys()) {
                if (!activeIds.has(id)) {
                    offscreenCanvasesRef.current.delete(id);
                    drawStateRef.current.delete(id);
                }
            }
        });

        const draw = (data) => {
            const { studentId, id, x, y, state, shape, startX, startY, endX, endY, color, size, isEraser } = data;
            if (!studentId) return;

            const offscreen = getOrCreateOffscreen(studentId);
            markChanged(studentId);
            if (offscreen.pendingDraws) {
                offscreen.pendingDraws.push(data);
                return;
            }
            const { ctx, shapeCanvas, shapeCtx, shapes } = offscreen;

            if (state === 'shape' && shape) {
                const shapeObject = { id, shape, startX, startY, endX, endY, color: color || '#000000', size: size || 1.5 };
                const existingIndex = shapes.findIndex((item) => item.id === id);
                if (existingIndex >= 0) shapes[existingIndex] = shapeObject;
                else shapes.push(shapeObject);
                renderShapeLayer(shapeCtx, shapeCanvas, shapes, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
                return;
            }

            if (state === 'shape-move' && id) {
                const shapeObject = shapes.find((item) => item.id === id);
                if (shapeObject) {
                    Object.assign(shapeObject, { startX, startY, endX, endY });
                    renderShapeLayer(shapeCtx, shapeCanvas, shapes, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
                }
                return;
            }

            const localX = x * OFFSCREEN_WIDTH;
            const localY = y * OFFSCREEN_HEIGHT;

            if (state === 'start' || state === 'move' || state === 'end') {
                const previous = drawStateRef.current.get(studentId);
                ctx.save();
                if (isEraser) {
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.lineWidth = size * 2;
                } else {
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.strokeStyle = color;
                    ctx.lineWidth = size;
                }
                // Draw just the new segment. Re-stroking the entire growing
                // path costs progressively more and can repaint erased pixels.
                ctx.beginPath();
                ctx.moveTo(state === 'start' || !previous ? localX : previous.x,
                    state === 'start' || !previous ? localY : previous.y);
                ctx.lineTo(localX, localY);
                ctx.stroke();
                ctx.restore();
                drawStateRef.current.set(studentId, { x: localX, y: localY });
            }
        };
        socketRef.current.on('draw', draw);

        socketRef.current.on('student-board-snapshot', ({ studentId, imageData, baseImageData, strokes, shapes }) => {
            if (!studentId) return;
            const offscreen = getOrCreateOffscreen(studentId);
            const version = (offscreen.snapshotVersion || 0) + 1;
            offscreen.snapshotVersion = version;
            const vector = Array.isArray(strokes);
            const source = pngFromWire(vector ? baseImageData : imageData);
            if (!vector && (typeof source !== 'string' || !source.startsWith('data:image/png;base64,'))) return;
            offscreen.pendingDraws = [];
            const replay = () => {
                const pending = offscreen.pendingDraws || [];
                offscreen.pendingDraws = null;
                for (const event of pending) draw(event);
                markChanged(studentId);
            };
            const apply = image => {
                if (offscreenCanvasesRef.current.get(studentId) !== offscreen || offscreen.snapshotVersion !== version) return;
                offscreen.ctx.globalCompositeOperation = 'source-over';
                offscreen.ctx.clearRect(0, 0, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
                if (image) offscreen.ctx.drawImage(image, 0, 0, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
                if (vector) paintStrokes(offscreen.ctx, strokes, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
                offscreen.shapes = Array.isArray(shapes) ? shapes.map(shape => ({ ...shape })) : [];
                renderShapeLayer(offscreen.shapeCtx, offscreen.shapeCanvas, offscreen.shapes, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
                drawStateRef.current.delete(studentId);
                replay();
            };
            if (!source) { apply(null); return; }
            const image = new Image();
            image.onload = () => apply(image);
            image.onerror = () => {
                if (offscreenCanvasesRef.current.get(studentId) === offscreen && offscreen.snapshotVersion === version) replay();
            };
            image.src = source;
        });

        socketRef.current.on('student-clear', ({ studentId }) => {
            if (offscreenCanvasesRef.current.has(studentId)) {
                markChanged(studentId);
                const offscreen = offscreenCanvasesRef.current.get(studentId);
                offscreen.snapshotVersion = (offscreen.snapshotVersion || 0) + 1; offscreen.pendingDraws = null;
                const { ctx, shapeCanvas, shapeCtx, shapes } = offscreen;
                ctx.globalCompositeOperation = 'source-over';
                ctx.clearRect(0, 0, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
                shapes.length = 0;
                renderShapeLayer(shapeCtx, shapeCanvas, shapes, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
            }
        });

        socketRef.current.on('clear-board', () => {
            // Clear all offscreen canvases
            for (const [studentId, offscreen] of offscreenCanvasesRef.current) {
                markChanged(studentId);
                offscreen.snapshotVersion = (offscreen.snapshotVersion || 0) + 1; offscreen.pendingDraws = null;
                const { ctx, shapeCanvas, shapeCtx, shapes } = offscreen;
                ctx.globalCompositeOperation = 'source-over';
                ctx.clearRect(0, 0, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
                shapes.length = 0;
                renderShapeLayer(shapeCtx, shapeCanvas, shapes, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
            }
        });

        return () => {
            stopWatchingConnection();
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, [roomId, getOrCreateOffscreen, markChanged]);

    // Idle boards schedule no animation frames. A changed board, layout,
    // background or newly visible page requests one coalesced paint.
    useEffect(() => {
        let frame = null, cache = new WeakMap();
        const paint = (canvas, board) => {
            if (!canvas || !board) return;
            if (cache.has(canvas) && cache.get(canvas) === board.revision) return;
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight) return;
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
            if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
            ctx.drawImage(board.canvas, 0, 0, width, height);
            if (board.shapeCanvas) ctx.drawImage(board.shapeCanvas, 0, 0, width, height);
            cache.set(canvas, board.revision);
        };
        const render = () => {
            frame = null;
            for (const [id, canvas] of gridCanvasRefs.current) paint(canvas, offscreenCanvasesRef.current.get(id));
            paint(zoomCanvasRef.current, zoomedStudent === 'teacher' ? teacherOffscreenRef.current : offscreenCanvasesRef.current.get(zoomedStudent));
        };
        const request = (layout = false) => {
            if (layout === true) cache = new WeakMap();
            if (frame === null && !document.hidden) frame = requestAnimationFrame(render);
        };
        const layout = () => request(true);
        requestPaintRef.current = request;
        const resize = new ResizeObserver(layout);
        for (const canvas of gridCanvasRefs.current.values()) resize.observe(canvas);
        if (zoomCanvasRef.current) resize.observe(zoomCanvasRef.current);
        window.addEventListener('resize', layout);
        window.addEventListener('scroll', layout, true);
        document.addEventListener('visibilitychange', layout);
        request();
        return () => {
            if (frame !== null) cancelAnimationFrame(frame);
            resize.disconnect(); requestPaintRef.current = () => {};
            window.removeEventListener('resize', layout);
            window.removeEventListener('scroll', layout, true);
            document.removeEventListener('visibilitychange', layout);
        };
    }, [zoomedStudent, page, students]);

    // Pagination
    const totalPages = Math.max(1, Math.ceil(students.length / STUDENTS_PER_PAGE));
    const visibleStudents = students.slice(page * STUDENTS_PER_PAGE, (page + 1) * STUDENTS_PER_PAGE);

    const clearAllBoards = () => {
        if (socketRef.current) {
            socketRef.current.emit('clear-board');
        }
    };

    const toggleLock = () => {
        if (socketRef.current) {
            if (locked) {
                socketRef.current.emit('unlock-board');
            } else {
                socketRef.current.emit('lock-board');
            }
            setLocked(!locked);
        }
    };

    const emitTeacherDraw = useCallback((studentId, state, normX, normY) => {
        if (studentId === 'teacher') return; // Don't emit network events for local teacher board
        if (socketRef.current) {
            socketRef.current.emit('teacher-draw', {
                studentId,
                x: normX,
                y: normY,
                state,
                color: '#ef4444', // Red for teacher
                size: teacherActiveTool === 'eraser' ? 10 : 3,
                isEraser: teacherActiveTool === 'eraser'
            });
        }
    }, [teacherActiveTool]);

    const getZoomNormCoords = (e) => {
        const canvas = zoomCanvasRef.current;
        const rect = canvas.getBoundingClientRect();
        
        const cssX = e.clientX - rect.left;
        const cssY = e.clientY - rect.top;
        
        const offscreen = zoomedStudent === 'teacher' 
            ? teacherOffscreenRef.current 
            : offscreenCanvasesRef.current.get(zoomedStudent);
            
        if (!offscreen) return null;
        
        const normX = cssX / rect.width;
        const normY = cssY / rect.height;
        
        return { normX, normY, offscreen };
    };

    const handleZoomPointerDown = (e) => {
        if (!zoomedStudent) return;
        if (e.cancelable) e.preventDefault();
        
        const coords = getZoomNormCoords(e);
        if (!coords) return;
        
        isTeacherDrawing.current = true;
        teacherLastPos.current = { normX: coords.normX, normY: coords.normY };
        
        const { offscreen, normX, normY } = coords;
        const ctx = offscreen.ctx;
        const pxX = normX * offscreen.canvas.width;
        const pxY = normY * offscreen.canvas.height;
        
        ctx.beginPath();
        if (teacherActiveTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = 20;
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3;
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(pxX, pxY);
        ctx.lineTo(pxX, pxY);
        ctx.stroke();
        
        markChanged(zoomedStudent);
        emitTeacherDraw(zoomedStudent, 'start', normX, normY);
    };

    const handleZoomPointerMove = (e) => {
        if (!isTeacherDrawing.current || !zoomedStudent) return;
        if (e.cancelable) e.preventDefault();
        
        const coords = getZoomNormCoords(e);
        if (!coords) return;
        const { offscreen, normX, normY } = coords;
        
        const ctx = offscreen.ctx;
        const startX = teacherLastPos.current.normX * offscreen.canvas.width;
        const startY = teacherLastPos.current.normY * offscreen.canvas.height;
        const endX = normX * offscreen.canvas.width;
        const endY = normY * offscreen.canvas.height;
        
        ctx.beginPath();
        if (teacherActiveTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = 20;
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3;
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        
        teacherLastPos.current = { normX, normY };
        markChanged(zoomedStudent);
        emitTeacherDraw(zoomedStudent, 'move', normX, normY);
    };

    const handleZoomPointerUp = (e) => {
        if (!isTeacherDrawing.current || !zoomedStudent) return;
        if (e.cancelable) e.preventDefault();
        
        isTeacherDrawing.current = false;
        
        const coords = getZoomNormCoords(e);
        if (coords) {
            markChanged(zoomedStudent);
            emitTeacherDraw(zoomedStudent, 'end', coords.normX, coords.normY);
        }
    };

    const joinUrl = `${window.location.origin}/student?room=${roomId}`;

    const zoomedStudentName = zoomedStudent === 'teacher' 
        ? '👨‍🏫 Teacher Board' 
        : (zoomedStudent ? (students.find(s => s.socketId === zoomedStudent)?.name || 'Unknown Student') : '');

    return (
        <div className={styles.container}>
            <ConnectionNotice status={connectionStatus} />
            {/* Header */}
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1>Interactive Board</h1>
                    <div className={styles.roomBadge}>Room: {roomId}</div>
                </div>

                <div className={styles.headerCenter}>
                    <span className={styles.studentCount}>
                        {students.length} Student{students.length !== 1 ? 's' : ''} Connected
                    </span>
                </div>

                <div className={styles.headerRight}>
                    <AudienceButton roomId={roomId} serverUrl={SERVER_URL} />
                    <button
                        className={styles.teachingBtn}
                        onClick={() => setZoomedStudent('teacher')}
                    >
                        👨‍🏫 Teaching
                    </button>

                    <button
                        className={locked ? styles.unlockBtn : styles.lockBtn}
                        onClick={toggleLock}
                    >
                        {locked ? '🔓 Unlock' : '🔒 Lock'}
                    </button>

                    <button className={styles.clearBtn} onClick={clearAllBoards}>
                        Clear All Boards
                    </button>

                    <div
                        className={styles.qrContainer}
                        onClick={() => setShowLargeQR(true)}
                        title="Click to enlarge"
                    >
                        <div className={styles.qrLabel}>Scan to Join</div>
                        <QRCodeSVG value={joinUrl} size={64} />
                    </div>
                </div>
            </header>

            {/* Main Grid Area */}
            <main className={styles.gridArea}>
                {students.length === 0 ? (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>👋</div>
                        <h2>Waiting for students...</h2>
                        <p>Share the room code or QR code for students to join.</p>
                    </div>
                ) : (
                    <div className={styles.grid}>
                        {visibleStudents.map((student) => (
                            <div
                                key={student.socketId}
                                className={styles.studentTile}
                                onClick={() => setZoomedStudent(student.socketId)}
                            >
                                <div className={styles.tileHeader}>
                                    <span className={styles.dot}></span>
                                    <span className={styles.tileName}>{student.name}</span>
                                </div>
                                <div className={styles.tileCanvas}>
                                    <canvas
                                        ref={(el) => {
                                            if (el) {
                                                gridCanvasRefs.current.set(student.socketId, el);
                                                // Ensure offscreen exists
                                                getOrCreateOffscreen(student.socketId);
                                            } else {
                                                gridCanvasRefs.current.delete(student.socketId);
                                            }
                                        }}
                                        className={styles.miniCanvas}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className={styles.pagination}>
                    <button
                        className={styles.pageBtn}
                        disabled={page === 0}
                        onClick={() => setPage(p => p - 1)}
                    >
                        ← Previous
                    </button>
                    <span className={styles.pageIndicator}>
                        Page {page + 1} of {totalPages}
                    </span>
                    <button
                        className={styles.pageBtn}
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage(p => p + 1)}
                    >
                        Next →
                    </button>
                </div>
            )}

            {/* Zoom Modal */}
            {zoomedStudent && (
                <div className={styles.zoomOverlay} onClick={() => setZoomedStudent(null)}>
                    <div className={styles.zoomContent} onClick={e => e.stopPropagation()}>
                        <div className={styles.zoomHeader}>
                            <h2 className={styles.zoomTitle}>{zoomedStudentName}</h2>
                            <div className={styles.zoomToolbar}>
                                <button 
                                    className={`${styles.zoomToolBtn} ${teacherActiveTool === 'pen' ? styles.zoomToolActive : ''}`}
                                    onClick={() => setTeacherActiveTool('pen')}
                                >Pen</button>
                                <button 
                                    className={`${styles.zoomToolBtn} ${teacherActiveTool === 'eraser' ? styles.zoomToolActive : ''}`}
                                    onClick={() => setTeacherActiveTool('eraser')}
                                >Eraser</button>
                                {zoomedStudent === 'teacher' && (
                                    <button 
                                        className={styles.zoomToolBtn}
                                        onClick={() => {
                                            const offscreen = teacherOffscreenRef.current;
                                            if (offscreen) {
                                                const { ctx, canvas } = offscreen;
                                                ctx.clearRect(0, 0, canvas.width, canvas.height);
                                                ctx.fillStyle = '#ffffff';
                                                ctx.fillRect(0, 0, canvas.width, canvas.height);
                                                markChanged('teacher');
                                            }
                                        }}
                                    >Clear</button>
                                )}
                            </div>
                            <button className={styles.closeZoomBtn} onClick={() => setZoomedStudent(null)}>×</button>
                        </div>
                        <div className={styles.zoomCanvasWrapper}>
                            <canvas 
                                ref={zoomCanvasRef} 
                                className={styles.zoomCanvas} 
                                onPointerDown={handleZoomPointerDown}
                                onPointerMove={handleZoomPointerMove}
                                onPointerUp={handleZoomPointerUp}
                                onPointerCancel={handleZoomPointerUp}
                                onPointerLeave={handleZoomPointerUp}
                                style={{ touchAction: 'none' }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Large QR Code Overlay */}
            {showLargeQR && (
                <div className={styles.qrModalOverlay} onClick={() => setShowLargeQR(false)}>
                    <div className={styles.qrModalContent} onClick={e => e.stopPropagation()}>
                        <button className={styles.closeQRBtn} onClick={() => setShowLargeQR(false)}>×</button>
                        <h2 className={styles.qrModalTitle}>Scan to Join Board</h2>
                        <div className={styles.largeQRCodeWrapper}>
                            <QRCodeSVG value={joinUrl} size={300} />
                        </div>
                        <div className={styles.qrModalRoomCode}>
                            Room Code: <strong>{roomId}</strong>
                        </div>
                        <p className={styles.qrModalInstructions}>
                            Point your device camera here to instantly join the session
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
