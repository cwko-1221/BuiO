import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Pen, Eraser, Trash2, Lock, Shapes, Triangle, Square, Circle, Diamond } from 'lucide-react';
import styles from './ClassStudent.module.css';
import { drawShape, shapeContainsPoint } from '../utils/drawing';
import { watchRoomConnection } from '../utils/roomConnection';
import ConnectionNotice from './ConnectionNotice';
import { pngToWire, pngFromWire } from '../utils/pngWire';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;
const PEN_COLORS = ['#111827', '#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#2563eb', '#7c3aed', '#ec4899'];
const SHAPE_OPTIONS = [
    { id: 'triangle', label: 'Triangle', icon: Triangle },
    { id: 'square', label: 'Square', icon: Square },
    { id: 'circle', label: 'Circle', icon: Circle },
    { id: 'parallelogram', label: 'Parallelogram', glyph: '▱' },
    { id: 'diamond', label: 'Diamond', icon: Diamond },
];

function appendStrokePoint(stroke, x, y, width, height) {
    if (!stroke || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const previous = stroke.points[stroke.points.length - 1];
    if (previous && Math.hypot((x - previous.x) * width, (y - previous.y) * height) < 0.75) return;
    stroke.points.push({ x, y });
}

export default function ClassStudent() {
    const [searchParams] = useSearchParams();
    const roomId = searchParams.get('room');
    const urlName = searchParams.get('name') || '';

    const [name, setName] = useState(urlName);
    const [joined, setJoined] = useState(!!urlName);
    const [error, setError] = useState('');
    const [locked, setLocked] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('connecting');
    const [buzzerState, setBuzzerState] = useState(null);
    const [buzzerNow, setBuzzerNow] = useState(Date.now());
    const [buzzerClockOffset, setBuzzerClockOffset] = useState(0);
    const [buzzerPending, setBuzzerPending] = useState(false);
    const [buzzerNotice, setBuzzerNotice] = useState('');
    const buzzerSubmitted = buzzerPending || !!buzzerState?.submitted;
    const buzzerLocked = buzzerPending || !!buzzerState?.locked;

    const [activeTool, setActiveTool] = useState('pen'); // 'pen' | 'shape' | 'eraser'
    const [penColor, setPenColor] = useState(PEN_COLORS[0]);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [selectedShape, setSelectedShape] = useState('triangle');
    const [showShapePicker, setShowShapePicker] = useState(false);
    const isDrawing = useRef(false);
    const activePointerId = useRef(null);
    const activeToolRef = useRef(activeTool);
    const penColorRef = useRef(penColor);
    const selectedShapeRef = useRef(selectedShape);
    const shapeStartRef = useRef(null);
    const shapeDragRef = useRef(null);
    const shapeObjectsRef = useRef([]);
    const drawingHistoryRef = useRef([]);
    const activeStudentStrokeRef = useRef(null);
    const activeTeacherStrokeRef = useRef(null);
    const baseDrawingImageDataRef = useRef(null);
    const baseDrawingImageRef = useRef(null);
    const selectedShapeIdRef = useRef(null);
    const studentLastPos = useRef({ x: 0, y: 0 });
    const teacherLastPos = useRef({ x: 0, y: 0 });
    const latestTeacherSync = useRef(0);

    const bgCanvasRef = useRef(null);   // Background image layer (bottom)
    const shapeCanvasRef = useRef(null); // Vector shape layer
    const canvasRef = useRef(null);      // Drawing layer (top, transparent)
    const contextRef = useRef(null);
    const shapeContextRef = useRef(null);
    const renderShapesRef = useRef(() => {});
    const redrawDrawingLayerRef = useRef(() => {});
    const socketRef = useRef(null);
    const joinedRef = useRef(false);
    const bgImageRef = useRef(null);     // stored HTMLImageElement
    const buzzerRoundIdRef = useRef(null);
    const pendingBoardSnapshotRef = useRef(null);
    const boardRestoreVersionRef = useRef(0);
    const boardRestoringRef = useRef(false);

    useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
    useEffect(() => { penColorRef.current = penColor; }, [penColor]);
    useEffect(() => { selectedShapeRef.current = selectedShape; }, [selectedShape]);
    useEffect(() => { joinedRef.current = joined; }, [joined]);

    useEffect(() => {
        if (!buzzerState?.active) return undefined;
        const timer = window.setInterval(() => setBuzzerNow(Date.now()), 200);
        return () => window.clearInterval(timer);
    }, [buzzerState?.active, buzzerState?.roundId]);

    // Draw background image onto the BACKGROUND canvas (separate from drawing layer)
    const drawBackground = useCallback(() => {
        const bgCanvas = bgCanvasRef.current;
        if (!bgCanvas || !bgImageRef.current) return;

        const rect = bgCanvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        bgCanvas.width = Math.round(rect.width * dpr);
        bgCanvas.height = Math.round(rect.height * dpr);

        const bgCtx = bgCanvas.getContext('2d');
        bgCtx.scale(dpr, dpr);
        bgCtx.drawImage(bgImageRef.current, 0, 0, rect.width, rect.height);
    }, []);

    // Load and display a background image from base64 data
    const loadAndDrawImage = useCallback((imageData) => {
        if (!imageData) return;
        const img = new Image();
        img.onload = () => {
            bgImageRef.current = img;
            drawBackground();
        };
        img.src = imageData;
    }, [drawBackground]);

    const redrawDrawingLayer = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = contextRef.current;
        if (!canvas || !ctx) return;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const dpr = window.devicePixelRatio || 1;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        if (baseDrawingImageRef.current?.complete && baseDrawingImageRef.current.naturalWidth > 0) {
            ctx.drawImage(baseDrawingImageRef.current, 0, 0, rect.width, rect.height);
        }

        for (const stroke of drawingHistoryRef.current) {
            if (!stroke.points?.length) continue;
            ctx.save();
            ctx.globalCompositeOperation = stroke.isEraser ? 'destination-out' : 'source-over';
            ctx.strokeStyle = stroke.color || '#111827';
            ctx.lineWidth = stroke.size || 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(stroke.points[0].x * rect.width, stroke.points[0].y * rect.height);
            if (stroke.points.length === 1) {
                ctx.lineTo(stroke.points[0].x * rect.width, stroke.points[0].y * rect.height);
            } else {
                for (let index = 1; index < stroke.points.length; index += 1) {
                    ctx.lineTo(stroke.points[index].x * rect.width, stroke.points[index].y * rect.height);
                }
            }
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
    }, []);
    redrawDrawingLayerRef.current = redrawDrawingLayer;

    const restoreBoardSnapshot = useCallback((snapshot) => {
        const canvas = canvasRef.current;
        const ctx = contextRef.current;
        if (!canvas || !ctx) {
            pendingBoardSnapshotRef.current = snapshot;
            return;
        }

        const restoreVersion = ++boardRestoreVersionRef.current;
        boardRestoringRef.current = true;
        shapeObjectsRef.current = Array.isArray(snapshot?.shapes)
            ? snapshot.shapes.map((shape) => ({ ...shape }))
            : [];
        selectedShapeIdRef.current = null;
        renderShapesRef.current();

        snapshot = { ...snapshot, imageData: pngFromWire(snapshot?.imageData), baseImageData: pngFromWire(snapshot?.baseImageData) };
        const isPng = (value) => typeof value === 'string' && value.startsWith('data:image/png;base64,');
        const hasStrokeState = Array.isArray(snapshot?.strokes)
            && (snapshot.baseImageData === null || isPng(snapshot.baseImageData));
        if (hasStrokeState) {
            baseDrawingImageDataRef.current = isPng(snapshot.baseImageData) ? snapshot.baseImageData : null;
            baseDrawingImageRef.current = null;
            drawingHistoryRef.current = snapshot.strokes.map((stroke) => ({
                ...stroke,
                points: Array.isArray(stroke.points) ? stroke.points.map((point) => ({ ...point })) : [],
            }));
        } else {
            baseDrawingImageDataRef.current = isPng(snapshot?.imageData) ? snapshot.imageData : null;
            baseDrawingImageRef.current = null;
            drawingHistoryRef.current = [];
        }
        activeStudentStrokeRef.current = null;
        activeTeacherStrokeRef.current = null;

        if (!baseDrawingImageDataRef.current) {
            redrawDrawingLayerRef.current();
            boardRestoringRef.current = false;
            return;
        }
        const image = new Image();
        image.onload = () => {
            if (restoreVersion !== boardRestoreVersionRef.current) return;
            const currentCanvas = canvasRef.current;
            const currentContext = contextRef.current;
            if (!currentCanvas || !currentContext) {
                boardRestoringRef.current = false;
                return;
            }
            baseDrawingImageRef.current = image;
            redrawDrawingLayerRef.current();
            boardRestoringRef.current = false;
        };
        image.onerror = () => {
            if (restoreVersion === boardRestoreVersionRef.current) boardRestoringRef.current = false;
        };
        image.src = baseDrawingImageDataRef.current;
    }, []);

    const publishBoardSnapshot = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !socketRef.current || !joinedRef.current) return;
        try {
            const imageData = canvas.toDataURL('image/png');
            const strokes = drawingHistoryRef.current.map((stroke) => ({
                ...stroke,
                points: stroke.points.map((point) => ({ ...point })),
            }));
            const vectorPointCount = strokes.reduce((total, stroke) => total + stroke.points.length, 0);
            const useRasterFallback = strokes.length > 2_000 || vectorPointCount > 60_000;
            socketRef.current.emit('student-board-snapshot', {
                imageData: pngToWire(imageData),
                baseImageData: pngToWire(useRasterFallback ? imageData : baseDrawingImageDataRef.current),
                strokes: useRasterFallback ? [] : strokes,
                shapes: shapeObjectsRef.current.map((shape) => ({ ...shape })),
            });
        } catch (error) {
            console.warn('[WB] Could not save student board snapshot:', error);
        }
    }, []);

    // Initialize Socket and Canvas
    useEffect(() => {
        if (!joined || !roomId) return;

        const socket = io(SERVER_URL);
        socketRef.current = socket;
        const stopWatchingConnection = watchRoomConnection(socket, setConnectionStatus);

        socket.on('connect', () => {
            socket.emit('join-room', { roomId, name, isTeacher: false });
        });

        socket.on('error', (msg) => {
            setError(msg);
            setJoined(false);
        });

        socket.on('student-board-snapshot', (snapshot) => {
            restoreBoardSnapshot(snapshot);
        });

        socket.on('buzzer-player-state', (state) => {
            if (state.serverNow) setBuzzerClockOffset(state.serverNow - Date.now());
            if (buzzerRoundIdRef.current !== state.roundId) {
                buzzerRoundIdRef.current = state.roundId;
                setBuzzerPending(false);
                setBuzzerNotice('');
            }
            setBuzzerState(state);
            setBuzzerPending(false);
        });

        socket.on('buzzer-error', (message) => {
            setBuzzerNotice(String(message || '搶答操作未能完成。'));
            setBuzzerPending(false);
        });

        // Receive background image from server
        socket.on('room-image', (imageData) => {
            loadAndDrawImage(imageData);
        });

        // Handle teacher clearing ALL boards — only clear the drawing layer
        socket.on('clear-board', () => {
            boardRestoreVersionRef.current += 1;
            boardRestoringRef.current = false;
            pendingBoardSnapshotRef.current = null;
            baseDrawingImageDataRef.current = null;
            baseDrawingImageRef.current = null;
            drawingHistoryRef.current = [];
            activeStudentStrokeRef.current = null;
            activeTeacherStrokeRef.current = null;
            const ctx = contextRef.current;
            const canvas = canvasRef.current;
            if (ctx && canvas) {
                const rect = canvas.getBoundingClientRect();
                ctx.globalCompositeOperation = 'source-over';
                ctx.clearRect(0, 0, rect.width, rect.height);
                // Background canvas is untouched — image stays visible
            }
            shapeObjectsRef.current = [];
            selectedShapeIdRef.current = null;
            const shapeCanvas = shapeCanvasRef.current;
            const shapeCtx = shapeContextRef.current;
            if (shapeCanvas && shapeCtx) {
                shapeCtx.save();
                shapeCtx.setTransform(1, 0, 0, 1, 0, 0);
                shapeCtx.clearRect(0, 0, shapeCanvas.width, shapeCanvas.height);
                shapeCtx.restore();
            }
        });

        // Handle teacher locking boards
        socket.on('lock-board', () => {
            setLocked(true);
        });

        // Handle teacher unlocking boards
        socket.on('unlock-board', () => {
            setLocked(false);
        });

        // Handle teacher drawing on this student's board
        socket.on('teacher-draw', (data) => {
            const ctx = contextRef.current;
            const canvas = canvasRef.current;
            if (!ctx || !canvas) return;

            const { x, y, state, color, size, isEraser } = data;
            const rect = canvas.getBoundingClientRect();
            const cssX = x * rect.width;
            const cssY = y * rect.height;

            if (state === 'start') {
                const stroke = {
                    color: color || '#ef4444',
                    size: isEraser ? size * 2 : size,
                    isEraser: !!isEraser,
                    points: [{ x, y }],
                };
                drawingHistoryRef.current.push(stroke);
                activeTeacherStrokeRef.current = stroke;
            } else if (state === 'move' || state === 'end') {
                appendStrokePoint(activeTeacherStrokeRef.current, x, y, rect.width, rect.height);
            }

            if (state !== 'start' && state !== 'move' && state !== 'end') return;
            ctx.save();
            if (isEraser) {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.lineWidth = size * 2;
            } else {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = color;
                ctx.lineWidth = size;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
            }

            if (state === 'start') {
                ctx.beginPath();
                ctx.moveTo(cssX, cssY);
                ctx.lineTo(cssX, cssY);
                ctx.stroke();
                teacherLastPos.current = { x: cssX, y: cssY };
            } else if (state === 'move' || state === 'end') {
                ctx.beginPath();
                ctx.moveTo(teacherLastPos.current.x, teacherLastPos.current.y);
                ctx.lineTo(cssX, cssY);
                ctx.stroke();
                teacherLastPos.current = { x: cssX, y: cssY };
            }
            ctx.restore();
            if (state === 'end') activeTeacherStrokeRef.current = null;
        });

        // Reconcile the complete stroke layer after every teacher gesture. This
        // removes any residue caused by rapid erasing, event batching or the
        // teacher and student canvases having different aspect ratios.
        socket.on('teacher-board-sync', ({ imageData }) => {
            if (typeof imageData !== 'string' || !imageData.startsWith('data:image/png;base64,')) return;

            const syncToken = latestTeacherSync.current + 1;
            latestTeacherSync.current = syncToken;
            const image = new Image();

            image.onload = () => {
                if (syncToken !== latestTeacherSync.current) return;

                const ctx = contextRef.current;
                const canvas = canvasRef.current;
                if (!ctx || !canvas) return;

                boardRestoreVersionRef.current += 1;
                boardRestoringRef.current = false;
                baseDrawingImageDataRef.current = imageData;
                baseDrawingImageRef.current = image;
                drawingHistoryRef.current = [];
                activeStudentStrokeRef.current = null;
                activeTeacherStrokeRef.current = null;
                shapeObjectsRef.current = [];
                selectedShapeIdRef.current = null;
                renderShapesRef.current();
                redrawDrawingLayerRef.current();
            };

            image.src = imageData;
        });

        // Setup DRAWING Canvas (transparent — strokes only)
        const canvas = canvasRef.current;
        let handleResize;
        let resizeObserver;
        if (canvas) {
            handleResize = () => {
                const rect = canvas.getBoundingClientRect();
                if (!rect.width || !rect.height) return;
                const dpr = window.devicePixelRatio || 1;
                const nextWidth = Math.round(rect.width * dpr);
                const nextHeight = Math.round(rect.height * dpr);
                const shapeCanvas = shapeCanvasRef.current;
                const dimensionsChanged = canvas.width !== nextWidth || canvas.height !== nextHeight
                    || (shapeCanvas && (shapeCanvas.width !== nextWidth || shapeCanvas.height !== nextHeight));
                if (!dimensionsChanged) return;

                canvas.width = nextWidth;
                canvas.height = nextHeight;

            const ctx = canvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                contextRef.current = ctx;

                if (shapeCanvas) {
                    shapeCanvas.width = nextWidth;
                    shapeCanvas.height = nextHeight;
                    const shapeCtx = shapeCanvas.getContext('2d');
                    shapeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
                    shapeCtx.lineCap = 'round';
                    shapeCtx.lineJoin = 'round';
                    shapeContextRef.current = shapeCtx;
                    renderShapesRef.current();
                }

                // Replay normalized pen strokes at the new resolution so every
                // resize stays crisp instead of repeatedly scaling a bitmap.
                redrawDrawingLayerRef.current();
                const latestStudentPoint = activeStudentStrokeRef.current?.points.at(-1);
                if (latestStudentPoint) {
                    studentLastPos.current = {
                        x: latestStudentPoint.x * rect.width,
                        y: latestStudentPoint.y * rect.height,
                    };
                }
                const latestTeacherPoint = activeTeacherStrokeRef.current?.points.at(-1);
                if (latestTeacherPoint) {
                    teacherLastPos.current = {
                        x: latestTeacherPoint.x * rect.width,
                        y: latestTeacherPoint.y * rect.height,
                    };
                }

                // Also resize the background canvas
                drawBackground();
                if (pendingBoardSnapshotRef.current) {
                    const snapshot = pendingBoardSnapshotRef.current;
                    pendingBoardSnapshotRef.current = null;
                    restoreBoardSnapshot(snapshot);
                }
            };

            handleResize();
            if (typeof ResizeObserver !== 'undefined') {
                resizeObserver = new ResizeObserver(handleResize);
                resizeObserver.observe(canvas);
            }
            window.addEventListener('resize', handleResize);
        }

        return () => {
            stopWatchingConnection();
            if (resizeObserver) resizeObserver.disconnect();
            if (handleResize) {
                window.removeEventListener('resize', handleResize);
            }
            socket.disconnect();
        };
    }, [joined, roomId, name, drawBackground, loadAndDrawImage, restoreBoardSnapshot]);

    const getCoordinates = useCallback((e) => {
        if (!canvasRef.current) return { x: 0, y: 0 };
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        // Use viewport coordinates against the canvas's current rect. offsetX/Y
        // are target-relative and can drift when the canvas is resized/reflowed.
        const pointer = e.touches?.[0] || e;
        const x = (Number.isFinite(pointer.clientX) ? pointer.clientX : rect.left) - rect.left;
        const y = (Number.isFinite(pointer.clientY) ? pointer.clientY : rect.top) - rect.top;

        return {
            x: x / rect.width,
            y: y / rect.height,
            rawX: x,
            rawY: y
        };
    }, []);

    const setupContextMode = useCallback((targetContext = contextRef.current) => {
        const ctx = targetContext;
        if (!ctx) return;

        if (activeToolRef.current === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = 20;
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = penColorRef.current;
            ctx.lineWidth = 3;
        }
    }, []);

    const emitDrawEvent = useCallback((state, point) => {
        if (socketRef.current && joinedRef.current) {
            socketRef.current.emit('draw', {
                x: point.x,
                y: point.y,
                state,
                color: penColorRef.current,
                size: activeToolRef.current === 'eraser' ? 10 : 1.5,
                isEraser: activeToolRef.current === 'eraser'
            });
        }
        if (state === 'end') publishBoardSnapshot();
    }, [publishBoardSnapshot]);

    const renderShapes = useCallback((preview = null) => {
        const canvas = shapeCanvasRef.current;
        const ctx = shapeContextRef.current;
        if (!canvas || !ctx) return;

        const rect = canvas.getBoundingClientRect();
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        shapeObjectsRef.current.forEach((item) => {
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = item.color;
            ctx.lineWidth = item.size * 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            drawShape(
                ctx,
                item.shape,
                item.startX * rect.width,
                item.startY * rect.height,
                item.endX * rect.width,
                item.endY * rect.height
            );
            ctx.restore();
        });

        const selected = shapeObjectsRef.current.find((item) => item.id === selectedShapeIdRef.current);
        if (selected) {
            ctx.save();
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            drawShape(
                ctx,
                selected.shape,
                selected.startX * rect.width,
                selected.startY * rect.height,
                selected.endX * rect.width,
                selected.endY * rect.height
            );
            ctx.restore();
        }

        if (preview) {
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = penColorRef.current;
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            drawShape(ctx, selectedShapeRef.current, preview.startX, preview.startY, preview.endX, preview.endY);
            ctx.restore();
        }
    }, []);
    renderShapesRef.current = renderShapes;

    const findShapeAtPoint = useCallback((point) => {
        const canvas = shapeCanvasRef.current;
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();
        for (let index = shapeObjectsRef.current.length - 1; index >= 0; index -= 1) {
            const item = shapeObjectsRef.current[index];
            if (shapeContainsPoint(
                item.shape,
                item.startX * rect.width,
                item.startY * rect.height,
                item.endX * rect.width,
                item.endY * rect.height,
                point.rawX,
                point.rawY
            )) {
                return item;
            }
        }
        return null;
    }, []);

    const updateDraggedShape = useCallback((point) => {
        const drag = shapeDragRef.current;
        const canvas = shapeCanvasRef.current;
        if (!drag || !canvas) return null;

        const rect = canvas.getBoundingClientRect();
        const deltaX = (point.rawX - drag.pointerStart.rawX) / rect.width;
        const deltaY = (point.rawY - drag.pointerStart.rawY) / rect.height;
        const item = shapeObjectsRef.current.find((shapeObject) => shapeObject.id === drag.id);
        if (!item) return null;

        item.startX = drag.original.startX + deltaX;
        item.startY = drag.original.startY + deltaY;
        item.endX = drag.original.endX + deltaX;
        item.endY = drag.original.endY + deltaY;
        return item;
    }, []);

    const drawShapePreview = useCallback((start, end) => {
        renderShapes({
            startX: start.rawX,
            startY: start.rawY,
            endX: end.rawX,
            endY: end.rawY,
        });
    }, [renderShapes]);

    const emitShapeEvent = useCallback((shapeObject) => {
        if (!socketRef.current || !joinedRef.current) return;

        socketRef.current.emit('draw', {
            state: 'shape',
            ...shapeObject,
            isEraser: false
        });
        publishBoardSnapshot();
    }, [publishBoardSnapshot]);

    const emitShapeMoveEvent = useCallback((shapeObject) => {
        if (!socketRef.current || !joinedRef.current) return;

        socketRef.current.emit('draw', {
            state: 'shape-move',
            ...shapeObject,
            isEraser: false
        });
        publishBoardSnapshot();
    }, [publishBoardSnapshot]);

    useEffect(() => {
        if (!buzzerLocked) return;

        if (isDrawing.current && !boardRestoringRef.current) {
            if (shapeDragRef.current) {
                const movedShape = shapeObjectsRef.current.find((shape) => shape.id === shapeDragRef.current.id);
                if (movedShape) emitShapeMoveEvent(movedShape);
            } else if (!shapeStartRef.current && canvasRef.current) {
                const rect = canvasRef.current.getBoundingClientRect();
                if (rect.width && rect.height) {
                    emitDrawEvent('end', {
                        x: studentLastPos.current.x / rect.width,
                        y: studentLastPos.current.y / rect.height,
                        rawX: studentLastPos.current.x,
                        rawY: studentLastPos.current.y,
                    });
                }
            }
        }

        isDrawing.current = false;
        activePointerId.current = null;
        activeStudentStrokeRef.current = null;
        shapeStartRef.current = null;
        shapeDragRef.current = null;
        renderShapesRef.current();
    }, [buzzerLocked, emitDrawEvent, emitShapeMoveEvent]);

    // Native event listeners for iPad pen reliability
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handlePointerDown = (e) => {
            if (e.cancelable) e.preventDefault();

            const isPen = e.pointerType === 'pen' || e.pointerType === 'stylus';

            if (isDrawing.current && activePointerId.current !== null && e.pointerId !== activePointerId.current) {
                if (!isPen) return;
                isDrawing.current = false;
                activePointerId.current = null;
            }

            activePointerId.current = e.pointerId;
            isDrawing.current = true;

            // Block drawing when locked
            if (locked || buzzerLocked || boardRestoringRef.current) {
                isDrawing.current = false;
                return;
            }

            const coords = getCoordinates(e);

            if (activeToolRef.current === 'shape') {
                const existingShape = findShapeAtPoint(coords);
                if (existingShape) {
                    selectedShapeIdRef.current = existingShape.id;
                    shapeDragRef.current = {
                        id: existingShape.id,
                        pointerStart: { rawX: coords.rawX, rawY: coords.rawY },
                        original: { ...existingShape },
                    };
                    renderShapes();
                    return;
                }

                selectedShapeIdRef.current = null;
                shapeStartRef.current = coords;
                drawShapePreview(coords, coords);
                return;
            }

            studentLastPos.current = { x: coords.rawX, y: coords.rawY };
            
            const ctx = contextRef.current;
            if (ctx) {
                setupContextMode();
                ctx.beginPath();
                ctx.moveTo(coords.rawX, coords.rawY);
                ctx.lineTo(coords.rawX, coords.rawY); // dot
                ctx.stroke();
            }

            const isEraser = activeToolRef.current === 'eraser';
            const stroke = {
                color: penColorRef.current,
                size: isEraser ? 20 : 3,
                isEraser,
                points: [{ x: coords.x, y: coords.y }],
            };
            drawingHistoryRef.current.push(stroke);
            activeStudentStrokeRef.current = stroke;

            emitDrawEvent('start', coords);
        };

        const handlePointerMove = (e) => {
            if (!isDrawing.current) return;
            if (e.pointerId !== undefined && activePointerId.current !== null && e.pointerId !== activePointerId.current) return;

            if (e.cancelable) e.preventDefault();

            const coords = getCoordinates(e);

            if (shapeDragRef.current) {
                updateDraggedShape(coords);
                renderShapes();
                return;
            }

            if (shapeStartRef.current) {
                drawShapePreview(shapeStartRef.current, coords);
                return;
            }

            const ctx = contextRef.current;
            if (ctx) {
                setupContextMode();
                ctx.beginPath();
                ctx.moveTo(studentLastPos.current.x, studentLastPos.current.y);
                ctx.lineTo(coords.rawX, coords.rawY);
                ctx.stroke();
                studentLastPos.current = { x: coords.rawX, y: coords.rawY };
            }
            const rect = canvas.getBoundingClientRect();
            appendStrokePoint(activeStudentStrokeRef.current, coords.x, coords.y, rect.width, rect.height);

            emitDrawEvent('move', coords);
        };

        const handlePointerUp = (e) => {
            if (!isDrawing.current) return;
            if (e.pointerId !== undefined && activePointerId.current !== null && e.pointerId !== activePointerId.current) return;

            if (e.cancelable) e.preventDefault();

            const coords = getCoordinates(e);

            if (shapeDragRef.current) {
                const movedShape = updateDraggedShape(coords);
                if (movedShape) emitShapeMoveEvent(movedShape);
                shapeDragRef.current = null;
                isDrawing.current = false;
                activePointerId.current = null;
                renderShapes();
                return;
            }

            if (shapeStartRef.current) {
                const start = shapeStartRef.current;
                drawShapePreview(start, coords);
                const rect = canvas.getBoundingClientRect();
                const shapeObject = {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    shape: selectedShapeRef.current,
                    startX: start.rawX / rect.width,
                    startY: start.rawY / rect.height,
                    endX: coords.rawX / rect.width,
                    endY: coords.rawY / rect.height,
                    color: penColorRef.current,
                    size: 1.5,
                };
                shapeObjectsRef.current.push(shapeObject);
                selectedShapeIdRef.current = shapeObject.id;
                shapeStartRef.current = null;
                isDrawing.current = false;
                activePointerId.current = null;
                renderShapes();
                emitShapeEvent(shapeObject);
                return;
            }

            isDrawing.current = false;
            activePointerId.current = null;

            const rect = canvas.getBoundingClientRect();
            appendStrokePoint(activeStudentStrokeRef.current, coords.x, coords.y, rect.width, rect.height);
            activeStudentStrokeRef.current = null;

            emitDrawEvent('end', coords);
        };

        const handleTouchStart = (e) => {
            if (e.touches.length === 1 && e.cancelable) {
                e.preventDefault();
            }
        };

        canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
        canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
        canvas.addEventListener('pointerup', handlePointerUp, { passive: false });
        canvas.addEventListener('pointerleave', handlePointerUp, { passive: false });
        canvas.addEventListener('pointercancel', handlePointerUp, { passive: false });
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });

        return () => {
            canvas.removeEventListener('pointerdown', handlePointerDown);
            canvas.removeEventListener('pointermove', handlePointerMove);
            canvas.removeEventListener('pointerup', handlePointerUp);
            canvas.removeEventListener('pointerleave', handlePointerUp);
            canvas.removeEventListener('pointercancel', handlePointerUp);
            canvas.removeEventListener('touchstart', handleTouchStart);
        };
        }, [joined, locked, buzzerLocked, getCoordinates, setupContextMode, emitDrawEvent, drawShapePreview, emitShapeEvent, emitShapeMoveEvent, findShapeAtPoint, renderShapes, updateDraggedShape]);


    const [clearProgress, setClearProgress] = useState(0);

    const clearCanvas = () => {
        const ctx = contextRef.current;
        const canvas = canvasRef.current;
        if (ctx && canvas) {
            const rect = canvas.getBoundingClientRect();
            ctx.globalCompositeOperation = 'source-over';
            ctx.clearRect(0, 0, rect.width, rect.height);
            // Only clear strokes — background canvas stays intact
        }
        baseDrawingImageDataRef.current = null;
        baseDrawingImageRef.current = null;
        drawingHistoryRef.current = [];
        activeStudentStrokeRef.current = null;
        activeTeacherStrokeRef.current = null;
        shapeObjectsRef.current = [];
        selectedShapeIdRef.current = null;
        const shapeCanvas = shapeCanvasRef.current;
        const shapeCtx = shapeContextRef.current;
        if (shapeCanvas && shapeCtx) {
            shapeCtx.save();
            shapeCtx.setTransform(1, 0, 0, 1, 0, 0);
            shapeCtx.clearRect(0, 0, shapeCanvas.width, shapeCanvas.height);
            shapeCtx.restore();
        }
        if (socketRef.current) {
            socketRef.current.emit('student-clear');
        }
        setClearProgress(0); // Reset slider
    };

    const handleClearSliderChange = (e) => {
        const val = parseInt(e.target.value);
        setClearProgress(val);
        if (val >= 100) {
            clearCanvas();
        }
    };

    const handleClearSliderRelease = () => {
        if (clearProgress < 100) {
            setClearProgress(0);
        }
    };

    const buzzerSecondsLeft = buzzerState?.active
        ? Math.max(0, Math.ceil((buzzerState.endsAt - (buzzerNow + buzzerClockOffset)) / 1000))
        : 0;

    const pressBuzzer = () => {
        if (!buzzerState?.active || buzzerPending || buzzerState.submitted || buzzerSecondsLeft <= 0) return;
        isDrawing.current = false;
        activePointerId.current = null;
        shapeStartRef.current = null;
        shapeDragRef.current = null;
        setBuzzerPending(true);
        setBuzzerNotice('');
        socketRef.current?.emit('buzzer-press');
    };

    if (!roomId) {
        return <div style={{ padding: '2rem', textAlign: 'center' }}>No Room ID provided. Please scan a valid QR code or enter via Home page.</div>;
    }

    if (!joined) {
        return (
            <div className={styles.joinContainer}>
                <div className={styles.joinCard}>
                    <div className={styles.roomBadgeWrapper}>
                        <span className={styles.roomBadge}>Room: {roomId}</span>
                    </div>
                    <h2 className={styles.modalTitle}>Join Class Module</h2>
                    <p className={styles.modalDesc}>
                        Enter your name to start working on the worksheet.
                    </p>

                    <form onSubmit={(e) => {
                        e.preventDefault();
                        if (name.trim()) setJoined(true);
                    }}>
                        <input
                            type="text"
                            className={styles.inputField}
                            placeholder="Your full name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={!!error}
                            autoFocus
                        />
                        {error && <p style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.875rem' }}>{error}</p>}
                        <button
                            type="submit"
                            className={styles.joinBtn}
                            disabled={!name.trim() || !!error}
                        >
                            Start Writing
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <ConnectionNotice status={connectionStatus} />
            {buzzerState?.roundId && (
                <div className={styles.buzzerRow} aria-live="polite">
                    <div className={styles.buzzerStatus}>
                        <strong>{buzzerState.active ? '⚡ 限時搶答' : '⚡ 搶答結果'}</strong>
                        <span>
                            {buzzerState.active
                                ? buzzerSubmitted ? `已提交 · 倒數 ${buzzerSecondsLeft} 秒` : `倒數 ${buzzerSecondsLeft} 秒`
                                : buzzerState.verdict === 'correct'
                                    ? `答對了！獲得 ${buzzerState.coins} 金幣`
                                    : buzzerState.verdict === 'wrong'
                                        ? '答案錯誤，未獲金幣'
                                        : buzzerLocked
                                            ? buzzerSubmitted ? '已提交，等待老師關閉結果' : '時間到，畫面已鎖定，等待老師關閉結果'
                                            : buzzerState.dismissed ? '結果已關閉，畫面已解鎖' : '等待搶答結果'}
                        </span>
                        {buzzerNotice && <small>{buzzerNotice}</small>}
                    </div>
                    {buzzerState.active && (
                        <button
                            type="button"
                            className={styles.buzzerPressBtn}
                            onClick={pressBuzzer}
                            disabled={buzzerSubmitted || buzzerSecondsLeft <= 0}
                        >
                            {buzzerPending ? '提交中…' : buzzerSubmitted ? '已提交' : '搶答'}
                        </button>
                    )}
                </div>
            )}
            {/* Toolbar - hidden when locked */}
            {!locked && (
            <div className={`${styles.toolbar} ${buzzerLocked ? styles.toolbarLocked : ''}`} aria-disabled={buzzerLocked}>
                <button
                    className={`${styles.toolBtn} ${activeTool === 'pen' ? styles.active : ''}`}
                    style={{ color: activeTool === 'pen' ? penColor : undefined }}
                    onClick={() => {
                        setActiveTool('pen');
                        setShowShapePicker(false);
                        setShowColorPicker((visible) => !visible);
                    }}
                    title="Pen"
                    aria-label="Pen and pen colors"
                    aria-expanded={showColorPicker}
                >
                    <Pen size={20} color={penColor} />
                </button>
                {showColorPicker && (
                    <div className={styles.colorPicker} role="group" aria-label="Pen colors">
                        {PEN_COLORS.map((color) => (
                            <button
                                key={color}
                                type="button"
                                className={`${styles.colorSwatch} ${penColor === color ? styles.selectedColor : ''}`}
                                style={{ backgroundColor: color }}
                                onClick={() => {
                                    setPenColor(color);
                                    setActiveTool('pen');
                                    setShowColorPicker(false);
                                }}
                                aria-label={`Choose ${color} pen`}
                                aria-pressed={penColor === color}
                            />
                        ))}
                    </div>
                )}
                <button
                    className={`${styles.toolBtn} ${activeTool === 'shape' ? styles.active : ''}`}
                    onClick={() => {
                        setActiveTool('shape');
                        setShowColorPicker(false);
                        setShowShapePicker((visible) => !visible);
                    }}
                    title="Shapes"
                    aria-label="Shapes"
                    aria-expanded={showShapePicker}
                >
                    <Shapes size={20} />
                </button>
                {showShapePicker && (
                    <div className={styles.shapePicker} role="group" aria-label="Shapes">
                        {SHAPE_OPTIONS.map(({ id, label, icon: ShapeIcon, glyph }) => (
                            <button
                                key={id}
                                type="button"
                                className={`${styles.shapeSwatch} ${selectedShape === id ? styles.selectedShape : ''}`}
                                onClick={() => {
                                    setSelectedShape(id);
                                    setActiveTool('shape');
                                    setShowShapePicker(false);
                                }}
                                title={label}
                                aria-label={label}
                                aria-pressed={selectedShape === id}
                            >
                                {ShapeIcon ? <ShapeIcon size={20} /> : <span className={styles.shapeGlyph}>{glyph}</span>}
                            </button>
                        ))}
                    </div>
                )}
                <button
                    className={`${styles.toolBtn} ${activeTool === 'eraser' ? styles.active : ''}`}
                    onClick={() => {
                        setActiveTool('eraser');
                        setShowColorPicker(false);
                        setShowShapePicker(false);
                    }}
                    title="Eraser"
                >
                    <Eraser size={20} />
                </button>

                <div className={styles.divider}></div>

                {/* Slide to Clear */}
                <div className={styles.sliderContainer} title="Slide to Clear All">
                    <div className={styles.sliderTrack}>
                        <div 
                            className={styles.sliderFill} 
                            style={{ width: `${clearProgress}%`, opacity: clearProgress / 100 }}
                        ></div>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={clearProgress}
                            onChange={handleClearSliderChange}
                            onMouseUp={handleClearSliderRelease}
                            onTouchEnd={handleClearSliderRelease}
                            className={styles.clearSlider}
                        />
                        <div className={styles.sliderLabel} style={{ opacity: 1 - (clearProgress / 50) }}>
                             Slide to Clear
                        </div>
                    </div>
                    <div className={styles.sliderIcon}>
                        <Trash2 size={16} color={clearProgress > 90 ? "#ef4444" : "#9ca3af"} />
                    </div>
                </div>
            </div>
            )}

            <div className={styles.boardArea}>
                {/* Background image canvas (bottom layer) */}
                <canvas
                    ref={bgCanvasRef}
                    className={styles.bgCanvas}
                />
                {/* Vector shape layer */}
                <canvas
                    ref={shapeCanvasRef}
                    className={styles.shapeCanvas}
                />
                {/* Drawing canvas (top layer, transparent) */}
                <canvas
                    ref={canvasRef}
                    className={styles.canvas}
                    style={locked || buzzerLocked ? { pointerEvents: 'none' } : {}}
                />
                {buzzerLocked && (
                    <div className={styles.buzzerBoardLock} aria-live="polite">
                        <span aria-hidden="true">🔒</span>
                        <strong>{buzzerSubmitted ? '已提交' : '搶答時間結束'}</strong>
                    </div>
                )}
            </div>

            {/* Lock Overlay */}
            {locked && (
                <div className={styles.lockOverlay}>
                    <div className={styles.lockContent}>
                        <Lock size={64} strokeWidth={1.5} />
                        <p>Board Locked by Teacher</p>
                    </div>
                </div>
            )}
        </div>
    );
}
