import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Pen, Eraser, Trash2, Lock, Shapes, Triangle, Square, Circle, Diamond } from 'lucide-react';
import styles from './Student.module.css';
import { drawShape, shapeContainsPoint } from '../utils/drawing';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;
const PEN_COLORS = ['#111827', '#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#2563eb', '#7c3aed', '#ec4899'];
const SHAPE_OPTIONS = [
    { id: 'triangle', label: 'Triangle', icon: Triangle },
    { id: 'square', label: 'Square', icon: Square },
    { id: 'circle', label: 'Circle', icon: Circle },
    { id: 'parallelogram', label: 'Parallelogram', glyph: '▱' },
    { id: 'diamond', label: 'Diamond', icon: Diamond },
];

export default function Student() {
    const [searchParams] = useSearchParams();
    const roomId = searchParams.get('room');
    const paramName = searchParams.get('name');

    const [name, setName] = useState(paramName || '');
    const [joined, setJoined] = useState(!!paramName);
    const [error, setError] = useState('');
    const [locked, setLocked] = useState(false);

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
    const selectedShapeIdRef = useRef(null);
    const studentLastPos = useRef({ x: 0, y: 0 });
    const teacherLastPos = useRef({ x: 0, y: 0 });

    const canvasRef = useRef(null);
    const shapeCanvasRef = useRef(null);
    const contextRef = useRef(null);
    const shapeContextRef = useRef(null);
    const renderShapesRef = useRef(() => {});
    const socketRef = useRef(null);
    const joinedRef = useRef(false);

    // Keep refs in sync with state
    useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
    useEffect(() => { penColorRef.current = penColor; }, [penColor]);
    useEffect(() => { selectedShapeRef.current = selectedShape; }, [selectedShape]);
    useEffect(() => { joinedRef.current = joined; }, [joined]);

    // Initialize Socket and Canvas context when joined
    useEffect(() => {
        if (!joined || !roomId) return;

        socketRef.current = io(SERVER_URL);

        socketRef.current.on('connect', () => {
            socketRef.current.emit('join-room', { roomId, name, isTeacher: false });
        });

        socketRef.current.on('error', (msg) => {
            setError(msg);
            setJoined(false);
        });

        // Listen for teacher clearing all boards
        socketRef.current.on('clear-board', () => {
            const ctx = contextRef.current;
            const canvas = canvasRef.current;
            if (ctx && canvas) {
                const rect = canvas.getBoundingClientRect();
                ctx.clearRect(0, 0, rect.width, rect.height);
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
        socketRef.current.on('lock-board', () => {
            setLocked(true);
        });

        // Handle teacher unlocking boards
        socketRef.current.on('unlock-board', () => {
            setLocked(false);
        });

        // Handle teacher drawing on this student's board
        socketRef.current.on('teacher-draw', (data) => {
            const ctx = contextRef.current;
            const canvas = canvasRef.current;
            if (!ctx || !canvas) return;

            ctx.save();
            const { x, y, state, color, size, isEraser } = data;
            const rect = canvas.getBoundingClientRect();
            const cssX = x * rect.width;
            const cssY = y * rect.height;

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
            } else if (state === 'move') {
                ctx.beginPath();
                ctx.moveTo(teacherLastPos.current.x, teacherLastPos.current.y);
                ctx.lineTo(cssX, cssY);
                ctx.stroke();
                teacherLastPos.current = { x: cssX, y: cssY };
            }
            
            ctx.restore();
        });

        // Setup Canvas
        const canvas = canvasRef.current;
        if (canvas) {
            const handleResize = () => {
                const rect = canvas.getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;
                canvas.width = rect.width * dpr;
                canvas.height = rect.height * dpr;

                const ctx = canvas.getContext('2d');
                ctx.scale(dpr, dpr);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                contextRef.current = ctx;

                const shapeCanvas = shapeCanvasRef.current;
                if (shapeCanvas) {
                    shapeCanvas.width = rect.width * dpr;
                    shapeCanvas.height = rect.height * dpr;
                    const shapeCtx = shapeCanvas.getContext('2d');
                    shapeCtx.scale(dpr, dpr);
                    shapeCtx.lineCap = 'round';
                    shapeCtx.lineJoin = 'round';
                    shapeContextRef.current = shapeCtx;
                    renderShapesRef.current();
                }
            };

            handleResize();
            window.addEventListener('resize', handleResize);
            return () => {
                window.removeEventListener('resize', handleResize);
                if (socketRef.current) socketRef.current.disconnect();
            };
        }
    }, [joined, roomId, name]);

    const getCoordinates = useCallback((e) => {
        if (!canvasRef.current) return { x: 0, y: 0 };
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();

        // Use offsetX/Y if available (most reliable for direct element relative coords)
        // Some older browsers/devices might not provide these in pointer events consistently
        let x, y;

        if (e.offsetX !== undefined && e.offsetY !== undefined) {
            x = e.offsetX;
            y = e.offsetY;
        } else {
            // Fallback for older iOS Safari
            const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
            const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
            x = clientX - rect.left;
            y = clientY - rect.top;
        }

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
    }, []);

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
    }, []);

    const emitShapeMoveEvent = useCallback((shapeObject) => {
        if (!socketRef.current || !joinedRef.current) return;

        socketRef.current.emit('draw', {
            state: 'shape-move',
            ...shapeObject,
            isEraser: false
        });
    }, []);

    // ── Native event listeners for reliable iPad pen input ──
    // React's synthetic events can delay preventDefault(), causing iPadOS Safari
    // to claim the gesture (scroll/zoom) before our handler runs.
    // Using addEventListener with { passive: false } ensures we block the
    // browser's gesture recognizer immediately on the first pointerdown.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handlePointerDown = (e) => {
            // Always prevent default immediately to stop Safari gesture recognition
            if (e.cancelable) e.preventDefault();

            const isPen = e.pointerType === 'pen' || e.pointerType === 'stylus';

            // If already drawing with another pointer, only let a pen take over
            if (isDrawing.current && activePointerId.current !== null && e.pointerId !== activePointerId.current) {
                if (!isPen) return;
                isDrawing.current = false;
                activePointerId.current = null;
            }

            activePointerId.current = e.pointerId;
            isDrawing.current = true;

            // Block drawing when locked
            if (locked) {
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

            emitDrawEvent('end', coords);
        };

        // Block Safari's gesture recognizer at the touch level too
        const handleTouchStart = (e) => {
            // Only prevent default if a single touch (pen or finger drawing),
            // don't block multi-touch (pinch zoom if needed later)
            if (e.touches.length === 1 && e.cancelable) {
                e.preventDefault();
            }
        };

        // All listeners MUST be { passive: false } so preventDefault() works on iOS
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
    }, [joined, locked, getCoordinates, setupContextMode, emitDrawEvent, drawShapePreview, emitShapeEvent, emitShapeMoveEvent, findShapeAtPoint, renderShapes, updateDraggedShape]);

    const [clearProgress, setClearProgress] = useState(0);

    const clearCanvas = () => {
        const ctx = contextRef.current;
        const canvas = canvasRef.current;
        if (ctx && canvas) {
            const rect = canvas.getBoundingClientRect();
            ctx.clearRect(0, 0, rect.width, rect.height);
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
        // Notify server so teacher's view of this student is cleared
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
                    <h2 className={styles.modalTitle}>Join Whiteboard</h2>
                    <p className={styles.modalDesc}>
                        Enter your name to start drawing with your class.
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
                            Start Drawing
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* Toolbar - hidden when locked */}
            {!locked && (
            <div className={styles.toolbar}>
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
                {/* Canvas — event listeners attached natively via useEffect above */}
                <canvas
                    ref={shapeCanvasRef}
                    className={styles.shapeCanvas}
                />
                <canvas
                    ref={canvasRef}
                    className={styles.canvas}
                    style={locked ? { pointerEvents: 'none' } : {}}
                />
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
