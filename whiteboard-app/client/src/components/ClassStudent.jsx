import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Pen, Eraser, Trash2, Lock, Shapes, Triangle, Square, Circle, Diamond } from 'lucide-react';
import styles from './ClassStudent.module.css';
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

export default function ClassStudent() {
    const [searchParams] = useSearchParams();
    const roomId = searchParams.get('room');
    const urlName = searchParams.get('name') || '';

    const [name, setName] = useState(urlName);
    const [joined, setJoined] = useState(!!urlName);
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
    const latestTeacherSync = useRef(0);

    const bgCanvasRef = useRef(null);   // Background image layer (bottom)
    const shapeCanvasRef = useRef(null); // Vector shape layer
    const canvasRef = useRef(null);      // Drawing layer (top, transparent)
    const contextRef = useRef(null);
    const shapeContextRef = useRef(null);
    const renderShapesRef = useRef(() => {});
    const socketRef = useRef(null);
    const joinedRef = useRef(false);
    const bgImageRef = useRef(null);     // stored HTMLImageElement

    useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
    useEffect(() => { penColorRef.current = penColor; }, [penColor]);
    useEffect(() => { selectedShapeRef.current = selectedShape; }, [selectedShape]);
    useEffect(() => { joinedRef.current = joined; }, [joined]);

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

    // Initialize Socket and Canvas
    useEffect(() => {
        if (!joined || !roomId) return;

        const socket = io(SERVER_URL);
        socketRef.current = socket;

        socket.on('connect', () => {
            socket.emit('join-room', { roomId, name, isTeacher: false });
        });

        socket.on('error', (msg) => {
            setError(msg);
            setJoined(false);
        });

        // Receive background image from server
        socket.on('room-image', (imageData) => {
            loadAndDrawImage(imageData);
        });

        // Handle teacher clearing ALL boards — only clear the drawing layer
        socket.on('clear-board', () => {
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

                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.globalCompositeOperation = 'source-over';
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                ctx.restore();
            };

            image.src = imageData;
        });

        // Setup DRAWING Canvas (transparent — strokes only)
        const canvas = canvasRef.current;
        let handleResize;
        if (canvas) {
            handleResize = () => {
                const rect = canvas.getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;

                // Save existing drawing before resizing
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvas.width;
                tempCanvas.height = canvas.height;
                const tempCtx = tempCanvas.getContext('2d');
                if (canvas.width > 0 && canvas.height > 0) {
                    tempCtx.drawImage(canvas, 0, 0);
                }

                canvas.width = Math.round(rect.width * dpr);
                canvas.height = Math.round(rect.height * dpr);

                const ctx = canvas.getContext('2d');
                ctx.scale(dpr, dpr);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                contextRef.current = ctx;

                const shapeCanvas = shapeCanvasRef.current;
                if (shapeCanvas) {
                    shapeCanvas.width = Math.round(rect.width * dpr);
                    shapeCanvas.height = Math.round(rect.height * dpr);
                    const shapeCtx = shapeCanvas.getContext('2d');
                    shapeCtx.scale(dpr, dpr);
                    shapeCtx.lineCap = 'round';
                    shapeCtx.lineJoin = 'round';
                    shapeContextRef.current = shapeCtx;
                    renderShapesRef.current();
                }

                // Restore previous strokes (no background — canvas stays transparent)
                if (tempCanvas.width > 0 && tempCanvas.height > 0) {
                    ctx.drawImage(tempCanvas, 0, 0, rect.width, rect.height);
                }

                // Also resize the background canvas
                drawBackground();
            };

            handleResize();
            window.addEventListener('resize', handleResize);
        }

        return () => {
            if (handleResize) {
                window.removeEventListener('resize', handleResize);
            }
            socket.disconnect();
        };
    }, [joined, roomId, name, drawBackground, loadAndDrawImage]);

    const getCoordinates = useCallback((e) => {
        if (!canvasRef.current) return { x: 0, y: 0 };
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();

        let x, y;

        // Use offsetX/Y if available for pinpoint accuracy
        if (e.offsetX !== undefined && e.offsetY !== undefined) {
            x = e.offsetX;
            y = e.offsetY;
        } else {
            // Fallback for older devices/Safari
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
    }, [joined, locked, getCoordinates, setupContextMode, emitDrawEvent, drawShapePreview, emitShapeEvent, emitShapeMoveEvent, findShapeAtPoint, renderShapes, updateDraggedShape]);


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
