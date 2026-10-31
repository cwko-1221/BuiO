import { createBoardTimeline } from '../utils/boardTimeline.mjs';
import { paintStrokes, paintStrokeSegment } from '../utils/paintBoard';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { io } from 'socket.io-client';
import styles from './ClassTeacher.module.css';
import { renderShapeLayer } from '../utils/drawing';
import { pngFromWire } from '../utils/pngWire';
import { watchRoomConnection } from '../utils/roomConnection';
import ConnectionNotice from './ConnectionNotice';
import AudienceButton from './AudienceButton';
import { initialRoomAudience, saveRoomAudience } from '../utils/roomAudience';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;
const STUDENTS_PER_PAGE = 12;
const OFFSCREEN_WIDTH = 800;
const OFFSCREEN_HEIGHT = 600;

export default function ClassTeacher() {
    const [searchParams] = useSearchParams();
    const roomId = searchParams.get('room');

    const socketRef = useRef(null);
    const fileInputRef = useRef(null);

    // students: [{ socketId, name }]
    const [students, setStudents] = useState([]);
    const [page, setPage] = useState(0);
    const [zoomedStudent, setZoomedStudent] = useState(null);
    const [showLargeQR, setShowLargeQR] = useState(false);
    const [uploadedImage, setUploadedImage] = useState(null); // base64 string
    const [uploading, setUploading] = useState(false);
    const [locked, setLocked] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('connecting');
    const [showBuzzerSetup, setShowBuzzerSetup] = useState(false);
    const [buzzerDisplayCount, setBuzzerDisplayCount] = useState(3);
    const [buzzerDurationSeconds, setBuzzerDurationSeconds] = useState(30);
    const [buzzerState, setBuzzerState] = useState(null);
    const [buzzerNow, setBuzzerNow] = useState(Date.now);
    const [buzzerClockOffset, setBuzzerClockOffset] = useState(0);
    const [buzzerResults, setBuzzerResults] = useState(null);
    const [buzzerError, setBuzzerError] = useState('');
    const [petStudents, setPetStudents] = useState([]);
    const [petRosterError, setPetRosterError] = useState('');
    const [rewardStudentId, setRewardStudentId] = useState(null);
    const [rewardAmounts, setRewardAmounts] = useState({});
    const [rewardAttemptedAmounts, setRewardAttemptedAmounts] = useState({});
    const [rewardErrors, setRewardErrors] = useState({});
    const [rewardBusy, setRewardBusy] = useState({});
    const [buzzerGrades, setBuzzerGrades] = useState({});

    // Teacher drawing state
    const [teacherActiveTool, setTeacherActiveTool] = useState('pen');
    const isTeacherDrawing = useRef(false);
    const teacherLastPos = useRef({ normX: 0, normY: 0 });
    const teacherGestureRef = useRef(null);

    // Special offscreen canvas for the Teacher Board
    const teacherOffscreenRef = useRef(null);

    // Offscreen canvases
    const offscreenCanvasesRef = useRef(new Map());
    const drawStateRef = useRef(new Map());
    const gridCanvasRefs = useRef(new Map());
    const buzzerRoundRef = useRef(null);
    const buzzerRoundIdRef = useRef(null);
    const zoomCanvasRef = useRef(null);
    const requestPaintRef = useRef(() => {});
    const markChanged = useCallback((studentId) => {
        const board = studentId === 'teacher' ? teacherOffscreenRef.current : offscreenCanvasesRef.current.get(studentId);
        if (board) board.revision = (board.revision || 0) + 1;
        requestPaintRef.current();
    }, []);
    const bgImageRef = useRef(null); // HTMLImageElement for the background

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
            // Canvas is transparent — strokes only, bg composited separately
            offscreenCanvasesRef.current.set(studentId, { canvas, ctx, shapeCanvas, shapeCtx, shapes: [], timeline: createBoardTimeline() });
        }
        return offscreenCanvasesRef.current.get(studentId);
    }, []);

    useEffect(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 900;
        const ctx = canvas.getContext('2d');
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        teacherOffscreenRef.current = { canvas, ctx };
    }, []);

    useEffect(() => {
        let disposed = false;
        fetch('/api/pet/teacher/roster', { credentials: 'include' })
            .then(async (response) => {
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.message || '無法讀取寵物樂園學生名單。');
                return data;
            })
            .then((data) => {
                if (!disposed) setPetStudents(Array.isArray(data.students) ? data.students : []);
            })
            .catch((error) => {
                if (!disposed) setPetRosterError(error.message || '無法讀取寵物樂園學生名單。');
            });
        return () => { disposed = true; };
    }, []);

    useEffect(() => {
        if (!buzzerState?.active) return undefined;
        const timer = window.setInterval(() => setBuzzerNow(Date.now()), 200);
        return () => window.clearInterval(timer);
    }, [buzzerState?.active, buzzerState?.roundId]);

    // Socket setup
    useEffect(() => {
        if (!roomId) return;

        socketRef.current = io(SERVER_URL);
        const stopWatchingConnection = watchRoomConnection(socketRef.current, setConnectionStatus);
        socketRef.current.on('lock-board', () => setLocked(true));
        socketRef.current.on('unlock-board', () => setLocked(false));

        socketRef.current.on('connect', () => {
            socketRef.current.emit('join-room', { roomId, name: 'Teacher', isTeacher: true, roomType: 'class', audienceRules: initialRoomAudience(roomId) });
        });
        socketRef.current.on('room-audience', data => saveRoomAudience(roomId, data.audienceRules));

        socketRef.current.on('student-list', (list) => {
            setStudents(list);
            const activeIds = new Set([
                ...list.map(s => s.socketId),
                ...(buzzerRoundRef.current?.responses || []).map(response => response.socketId),
            ]);
            for (const id of offscreenCanvasesRef.current.keys()) {
                if (!activeIds.has(id)) {
                    offscreenCanvasesRef.current.delete(id);
                    drawStateRef.current.delete(id);
                }
            }
        });

        const draw = (data, replaying = false) => {
            const { studentId, id, x, y, state, shape, startX, startY, endX, endY, color, size, isEraser } = data;
            if (!studentId) return;

            const offscreen = getOrCreateOffscreen(studentId);
            if (!replaying && !offscreen.timeline.record(data)) return;
            markChanged(studentId);
            if (offscreen.pendingDraws && !data.liveOrder) {
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


            if (state === 'start' || state === 'move' || state === 'end') {
                let positions=drawStateRef.current.get(studentId);
                if(!positions){positions=new Map();drawStateRef.current.set(studentId,positions);}
                const key=data.strokeId||(data.origin||'student')+':legacy';
                const point={x,y},previous=state==='start'?point:(positions.get(key)||point);
                paintStrokeSegment(ctx,previous,point,{color,size:isEraser?size*2:size,isEraser,
                    surfaceWidth:data.surfaceWidth||800,surfaceHeight:data.surfaceHeight||600},OFFSCREEN_WIDTH,OFFSCREEN_HEIGHT);
                positions.set(key,point);
            }
        };
        socketRef.current.on('draw', draw);

        socketRef.current.on('student-board-snapshot', ({ studentId, imageData, baseImageData, strokes, shapes, liveOrder, boardGeneration }) => {
            if (!studentId) return;
            const offscreen = getOrCreateOffscreen(studentId);
            offscreen.boardGeneration=boardGeneration;
            const version = (offscreen.snapshotVersion || 0) + 1;
            offscreen.snapshotVersion = version;
            const vector = Array.isArray(strokes);
            const source = pngFromWire(vector ? baseImageData : imageData);
            if (!vector && (typeof source !== 'string' || !source.startsWith('data:image/png;base64,'))) return;
            offscreen.pendingDraws = [];
            const replay = () => {
                const pending = offscreen.pendingDraws || [];
                offscreen.pendingDraws = null;
                for (const event of pending) draw(event,true);
                markChanged(studentId);
            };
            const apply = image => {
                if (offscreenCanvasesRef.current.get(studentId) !== offscreen || offscreen.snapshotVersion !== version) return;
                const newer=liveOrder?offscreen.timeline.confirm(liveOrder):[];
                if(newer===null){offscreen.pendingDraws=null;return;}
                offscreen.ctx.globalCompositeOperation = 'source-over';
                offscreen.ctx.clearRect(0, 0, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
                if (image) offscreen.ctx.drawImage(image, 0, 0, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
                if (vector) paintStrokes(offscreen.ctx, strokes, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
                offscreen.shapes = Array.isArray(shapes) ? shapes.map(shape => ({ ...shape })) : [];
                renderShapeLayer(offscreen.shapeCtx, offscreen.shapeCanvas, offscreen.shapes, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
                const positions=new Map();
                for(const stroke of strokes||[]){const n=stroke.pointData?stroke.pointData.length/2:stroke.points?.length;
                    if(n)positions.set(stroke.id||'student:legacy',stroke.pointData?{x:stroke.pointData[(n-1)*2],y:stroke.pointData[(n-1)*2+1]}:stroke.points[n-1]);}
                drawStateRef.current.set(studentId,positions);
                if(liveOrder){offscreen.pendingDraws=null;for(const event of newer)draw(event,true);markChanged(studentId);}
                else replay();
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
            if(teacherGestureRef.current?.studentId===studentId){isTeacherDrawing.current=false;teacherGestureRef.current=null;}
            if (offscreenCanvasesRef.current.has(studentId)) {
                const offscreen = offscreenCanvasesRef.current.get(studentId);
                const { ctx, shapeCanvas, shapeCtx, shapes } = offscreen;
                markChanged(studentId);
                offscreen.snapshotVersion = (offscreen.snapshotVersion || 0) + 1;
                offscreen.pendingDraws = null;
                offscreen.timeline.clear();drawStateRef.current.delete(studentId);
                ctx.clearRect(0, 0, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
                // Only clear strokes — bg image is composited separately in render loop
                shapes.length = 0;
                renderShapeLayer(shapeCtx, shapeCanvas, shapes, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
            }
        });

        socketRef.current.on('clear-board', (state = {}) => {
            isTeacherDrawing.current=false;teacherGestureRef.current=null;
            drawStateRef.current.clear();
            for (const [studentId, offscreen] of offscreenCanvasesRef.current) {
                if(state.boardGeneration)offscreen.boardGeneration=state.boardGeneration;
                markChanged(studentId);
                const { ctx, shapeCanvas, shapeCtx, shapes } = offscreen;
                offscreen.snapshotVersion = (offscreen.snapshotVersion || 0) + 1;
                offscreen.pendingDraws = null;
                offscreen.timeline.clear();drawStateRef.current.delete(studentId);
                ctx.clearRect(0, 0, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
                // Only clear strokes — bg image is composited separately in render loop
                shapes.length = 0;
                renderShapeLayer(shapeCtx, shapeCanvas, shapes, OFFSCREEN_WIDTH, OFFSCREEN_HEIGHT);
            }
        });

        socketRef.current.on('image-uploaded', () => {
            setUploading(false);
        });

        socketRef.current.on('room-image', (imageData) => {
            if (typeof imageData !== 'string' || !imageData.startsWith('data:image/')) return;

            setUploadedImage(imageData);
            setUploading(false);
            const img = new Image();
            img.onload = () => {
                bgImageRef.current = img;
                requestPaintRef.current(true);
            };
            img.src = imageData;
        });

        socketRef.current.on('buzzer-teacher-state', (state) => {
            if (state.serverNow) setBuzzerClockOffset(state.serverNow - Date.now());
            if (buzzerRoundIdRef.current !== state.roundId) {
                buzzerRoundIdRef.current = state.roundId;
                setBuzzerGrades({});
                setRewardAmounts({});
                setRewardAttemptedAmounts({});
                setRewardErrors({});
                setRewardStudentId(null);
            }
            buzzerRoundRef.current = state;
            setBuzzerState(state);
            setBuzzerResults(state.showResults ? state.responses : null);
            if (state.active) setShowBuzzerSetup(false);
            setBuzzerError('');
        });

        socketRef.current.on('buzzer-error', (message) => setBuzzerError(String(message || '搶答操作未能完成。')));

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
            if (bgImageRef.current) ctx.drawImage(bgImageRef.current, 0, 0, width, height);
            else { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); }
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
    }, [zoomedStudent, page, students, buzzerResults]);

    // Pagination
    const totalPages = Math.max(1, Math.ceil(students.length / STUDENTS_PER_PAGE));
    const visibleStudents = students.slice(page * STUDENTS_PER_PAGE, (page + 1) * STUDENTS_PER_PAGE);

    useEffect(() => {
        if (page >= totalPages) {
            setPage(Math.max(0, totalPages - 1));
        }
    }, [page, totalPages]);

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

    const emitTeacherDraw = useCallback((studentId,state,normX,normY) => {
        if(studentId==='teacher'||!socketRef.current)return;
        const offscreen=offscreenCanvasesRef.current.get(studentId),gesture=teacherGestureRef.current;
        const data={studentId,x:normX,y:normY,state,color:'#ef4444',size:gesture?.isEraser?10:3,isEraser:!!gesture?.isEraser,
            strokeId:gesture?.id,eventId:crypto.randomUUID(),origin:'teacher',surfaceWidth:800,surfaceHeight:600,boardGeneration:offscreen?.boardGeneration};
        offscreen?.timeline.record(data);socketRef.current.emit('teacher-draw',data);
    }, []);

    const getZoomNormCoords = (e) => {
        const canvas = zoomCanvasRef.current;
        const rect = canvas.getBoundingClientRect();
        
        const cssX = e.clientX - rect.left;
        const cssY = e.clientY - rect.top;
        
        const offscreen = zoomedStudent === 'teacher' 
            ? teacherOffscreenRef.current 
            : offscreenCanvasesRef.current.get(zoomedStudent);
            
        if (!offscreen) return null;
        
        // ClassTeacher stretches the offscreen canvas to fit the zoom canvas
        const normX = cssX / rect.width;
        const normY = cssY / rect.height;
        
        return { normX, normY, offscreen };
    };

    const handleZoomPointerDown = (e) => {
        if (!zoomedStudent) return;
        if (e.cancelable) e.preventDefault();
        
        const coords = getZoomNormCoords(e);
        if (!coords) return;
        
        teacherGestureRef.current={id:crypto.randomUUID(),studentId:zoomedStudent,isEraser:teacherActiveTool==='eraser'};
        isTeacherDrawing.current = true;
        teacherLastPos.current = { normX: coords.normX, normY: coords.normY };
        
        const { offscreen, normX, normY } = coords;
        const ctx = offscreen.ctx;
        const pxX = normX * offscreen.canvas.width;
        const pxY = normY * offscreen.canvas.height;
        
        ctx.beginPath();
        if (teacherGestureRef.current?.isEraser) {
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
        if (teacherGestureRef.current?.isEraser) {
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
        
        if(e.type!=='pointercancel')handleZoomPointerMove(e);
        isTeacherDrawing.current = false;
        
        const coords = e.type==='pointercancel' ? teacherLastPos.current : getZoomNormCoords(e);
        if (coords) {
            emitTeacherDraw(zoomedStudent, 'end', coords.normX, coords.normY);

        }
    };

    const buzzerSecondsLeft = buzzerState?.active
        ? Math.max(0, Math.ceil((buzzerState.endsAt - (buzzerNow + buzzerClockOffset)) / 1000))
        : 0;

    const startBuzzer = () => {
        const displayCount = Number(buzzerDisplayCount);
        const durationSeconds = Number(buzzerDurationSeconds);
        if (!Number.isInteger(displayCount) || displayCount < 1 || displayCount > 12) {
            setBuzzerError('顯示人數請設定為 1 至 12 人。');
            return;
        }
        if (!Number.isInteger(durationSeconds) || durationSeconds < 10 || durationSeconds > 300) {
            setBuzzerError('搶答時間請設定為 10 至 300 秒。');
            return;
        }
        setBuzzerError('');
        socketRef.current?.emit('buzzer-start', { displayCount, durationSeconds });
    };

    const markBuzzerWrong = (response) => {
        setBuzzerGrades((current) => ({ ...current, [response.socketId]: { verdict: 'wrong', coins: 0 } }));
        setRewardStudentId(null);
        socketRef.current?.emit('buzzer-judge', {
            roundId: buzzerState?.roundId,
            responseId: response.socketId,
            verdict: 'wrong',
            coins: 0,
        });
    };

    const awardBuzzerCoins = async (response) => {
        const amount = Number(rewardAmounts[response.socketId] ?? 200);
        if (!Number.isInteger(amount) || amount < 1 || amount > 10000) {
            setRewardErrors((current) => ({ ...current, [response.socketId]: '請輸入 1 至 10,000 的整數金幣。' }));
            return;
        }
        const previousAttempt = rewardAttemptedAmounts[response.socketId];
        if (previousAttempt !== undefined && Number(previousAttempt) !== amount) {
            setRewardErrors((current) => ({ ...current, [response.socketId]: '上次發放結果未能確認，請以相同金額重試，避免重複發放。' }));
            return;
        }
        if (!response.studentId || !petStudents.some(student => String(student.studentId) === String(response.studentId))) {
            setRewardErrors((current) => ({ ...current, [response.socketId]: '未能核對學生的寵物樂園帳戶，暫不能發放金幣。' }));
            return;
        }

        setRewardBusy((current) => ({ ...current, [response.socketId]: true }));
        setRewardAttemptedAmounts((current) => ({ ...current, [response.socketId]: amount }));
        setRewardErrors((current) => ({ ...current, [response.socketId]: '' }));
        try {
            const idempotencyKey = `whiteboard-buzzer:${buzzerState.roundId}:${response.socketId}`;
            const result = await fetch('/api/pet/teacher/grants/commit', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': idempotencyKey,
                },
                body: JSON.stringify({
                    studentIds: [response.studentId],
                    amount,
                    note: '白板搶答獎勵',
                }),
            });
            const data = await result.json().catch(() => ({}));
            if (!result.ok) throw new Error(data.message || '金幣發放失敗，請重試。');
            const grade = { verdict: 'correct', coins: amount };
            setBuzzerGrades((current) => ({ ...current, [response.socketId]: grade }));
            setRewardStudentId(null);
            socketRef.current?.emit('buzzer-judge', {
                roundId: buzzerState.roundId,
                responseId: response.socketId,
                verdict: 'correct',
                coins: amount,
            });
        } catch (error) {
            setRewardErrors((current) => ({ ...current, [response.socketId]: error.message || '金幣發放失敗，請重試。' }));
        } finally {
            setRewardBusy((current) => ({ ...current, [response.socketId]: false }));
        }
    };

    const dismissBuzzerResults = () => {
        setBuzzerResults(null);
        socketRef.current?.emit('buzzer-dismiss', { roundId: buzzerState?.roundId });
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file.');
            return;
        }

        setUploading(true);

        const reader = new FileReader();
        reader.onload = (event) => {
            const tempImg = new Image();
            tempImg.onload = () => {
                // Compress image to JPG (70% quality)
                const canvas = document.createElement('canvas');
                canvas.width = tempImg.width;
                canvas.height = tempImg.height;
                const ctx = canvas.getContext('2d');
                
                // Fill background with white in case of transparent PNG
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(tempImg, 0, 0);

                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                
                setUploadedImage(compressedBase64);

                // Create image element and cache it for the render loop
                const img = new Image();
                img.onload = () => {
                    bgImageRef.current = img;
                requestPaintRef.current(true);
                    // No need to repaint offscreen canvases — bg is composited in render loop
                };
                img.src = compressedBase64;

                // Send to server
                if (socketRef.current) {
                    socketRef.current.emit('upload-image', compressedBase64);
                }
            };
            tempImg.src = event.target.result;
        };
        reader.readAsDataURL(file);

        // Reset input so the same file can be re-selected
        e.target.value = '';
    };

    const joinUrl = `${window.location.origin}/class-student?room=${roomId}`;

    const zoomedStudentName = zoomedStudent === 'teacher' 
        ? '👨‍🏫 Teacher Board' 
        : (zoomedStudent ? (students.find(s => s.socketId === zoomedStudent)?.name || 'Unknown Student') : '');

    return (
        <div className={styles.container}>
            <ConnectionNotice status={connectionStatus} />
            {/* Header */}
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1>Class Module</h1>
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
                        className={`${styles.buzzerBtn} ${buzzerState?.active ? styles.buzzerBtnActive : ''}`}
                        onClick={() => !buzzerState?.active && setShowBuzzerSetup(true)}
                        disabled={!!buzzerState?.active}
                        title={buzzerState?.active ? '搶答進行中' : '設定限時搶答'}
                    >
                        {buzzerState?.active ? `⚡ 搶答中 ${buzzerSecondsLeft}s` : '⚡ 搶答'}
                    </button>
                    <button
                        className={styles.teachingBtn}
                        onClick={() => setZoomedStudent('teacher')}
                    >
                        👨‍🏫 Teaching
                    </button>
                    <button
                        className={styles.uploadBtn}
                        onClick={handleUploadClick}
                        disabled={uploading}
                    >
                        {uploading ? 'Uploading...' : uploadedImage ? '📄 Change Image' : '📤 Upload Image'}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                    />

                    <button
                        className={locked ? styles.unlockBtn : styles.lockBtn}
                        onClick={toggleLock}
                    >
                        {locked ? '🔓 Unlock' : '🔒 Lock'}
                    </button>

                    <button className={styles.clearBtn} onClick={clearAllBoards}>
                        Clear All
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
                {buzzerResults !== null ? (
                    <section className={styles.buzzerResults} aria-live="polite">
                        <div className={styles.buzzerResultsHeader}>
                            <div>
                                <h2>⚡ 搶答結果</h2>
                                <p>顯示最先搶答的 {buzzerState?.displayCount || 0} 位學生；共收到 {buzzerState?.responseCount || 0} 次搶答</p>
                            </div>
                            <button className={styles.buzzerCloseBtn} onClick={dismissBuzzerResults}>關閉結果</button>
                        </div>
                        {buzzerResults.length === 0 ? (
                            <div className={styles.buzzerNoResponses}>時間到，沒有學生搶答。</div>
                        ) : (
                            <div className={styles.buzzerResultsGrid}>
                                {buzzerResults.map((response) => {
                                    const grade = buzzerGrades[response.socketId] || (response.verdict ? { verdict: response.verdict, coins: response.coins } : null);
                                    const canMatchAccount = response.studentId
                                        && petStudents.some(student => String(student.studentId) === String(response.studentId));
                                    return (
                                        <article key={response.socketId} className={styles.buzzerResponseCard}>
                                            <div className={styles.buzzerResponseHeader}>
                                                <strong className={styles.buzzerStudentName}>{response.name}</strong>
                                            </div>
                                            <div className={styles.buzzerResponseCanvas}>
                                                <canvas
                                                    ref={(el) => {
                                                        if (el) {
                                                            gridCanvasRefs.current.set(response.socketId, el);
                                                            getOrCreateOffscreen(response.socketId);
                                                        } else {
                                                            gridCanvasRefs.current.delete(response.socketId);
                                                        }
                                                    }}
                                                    className={styles.miniCanvas}
                                                />
                                            </div>
                                            <div className={styles.buzzerGradeArea}>
                                                {grade ? (
                                                    <div className={grade.verdict === 'correct' ? styles.buzzerCorrectResult : styles.buzzerWrongResult}>
                                                        {grade.verdict === 'correct' ? `✓ 正確 · 已發 ${grade.coins} 金幣` : '✕ 錯誤'}
                                                    </div>
                                                ) : rewardStudentId === response.socketId ? (
                                                    <div className={styles.rewardEditor}>
                                                        <label>
                                                            獎勵金幣
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                max="10000"
                                                                step="1"
                                                                value={rewardAmounts[response.socketId] ?? 200}
                                                                onChange={(event) => setRewardAmounts(current => ({ ...current, [response.socketId]: event.target.value }))}
                                                            />
                                                        </label>
                                                        {!canMatchAccount && <small>未能核對寵物樂園帳戶，無法發放金幣。</small>}
                                                        {rewardErrors[response.socketId] && <small className={styles.rewardError}>{rewardErrors[response.socketId]}</small>}
                                                        <div className={styles.rewardActions}>
                                                            <button
                                                                className={styles.rewardConfirmBtn}
                                                                onClick={() => awardBuzzerCoins(response)}
                                                                disabled={!!rewardBusy[response.socketId] || !canMatchAccount}
                                                            >
                                                                {rewardBusy[response.socketId] ? '發放中…' : '確認發放'}
                                                            </button>
                                                            <button className={styles.rewardCancelBtn} onClick={() => setRewardStudentId(null)}>取消</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className={styles.buzzerGradeButtons}>
                                                        <button className={styles.correctBtn} onClick={() => { setRewardStudentId(response.socketId); setRewardErrors(current => ({ ...current, [response.socketId]: '' })); }}>✓ 正確</button>
                                                        <button className={styles.wrongBtn} onClick={() => markBuzzerWrong(response)}>✕ 錯誤</button>
                                                    </div>
                                                )}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                ) : students.length === 0 ? (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>{uploadedImage ? '📄' : '📤'}</div>
                        <h2>{uploadedImage ? 'Image uploaded! Waiting for students...' : 'Upload an image to start'}</h2>
                        <p>
                            {uploadedImage
                                ? 'Share the room code or QR code for students to join.'
                                : 'Click "Upload Image" to set a worksheet, then share the room code.'}
                        </p>
                    </div>
                ) : (
                    <div className={styles.grid}>
                        {visibleStudents.map((student) => {
                            return (
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
                                                    getOrCreateOffscreen(student.socketId);
                                                } else {
                                                    gridCanvasRefs.current.delete(student.socketId);
                                                }
                                            }}
                                            className={styles.miniCanvas}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* Pagination */}
            {buzzerResults === null && totalPages > 1 && (
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

            {showBuzzerSetup && (
                <div className={styles.buzzerSetupOverlay} onClick={() => setShowBuzzerSetup(false)}>
                    <section className={styles.buzzerSetupCard} onClick={event => event.stopPropagation()} aria-labelledby="buzzerSetupTitle">
                        <button className={styles.buzzerSetupClose} onClick={() => setShowBuzzerSetup(false)} aria-label="關閉">×</button>
                        <h2 id="buzzerSetupTitle">⚡ 設定搶答</h2>
                        <p>時間結束後，自動顯示最先搶答的學生。</p>
                        <label>
                            顯示人數
                            <input type="number" min="1" max="12" step="1" value={buzzerDisplayCount} onChange={event => setBuzzerDisplayCount(event.target.value)} />
                        </label>
                        <label>
                            搶答時間（秒）
                            <input type="number" min="10" max="300" step="1" value={buzzerDurationSeconds} onChange={event => setBuzzerDurationSeconds(event.target.value)} />
                        </label>
                        {petRosterError && <p className={styles.buzzerSetupWarning}>{petRosterError} 請確認老師帳戶已登入；名單未能載入時，金幣獎勵亦無法核對。</p>}
                        {buzzerError && <p className={styles.buzzerSetupError}>{buzzerError}</p>}
                        <button className={styles.buzzerStartBtn} onClick={startBuzzer}>開始倒數</button>
                    </section>
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
                                                markChanged('teacher');
                                            }
                                        }}
                                    >Clear</button>
                                )}
                            </div>
                            <button className={styles.closeZoomBtn} onClick={() => setZoomedStudent(null)}>×</button>
                        </div>
                        <div className={styles.zoomCanvasWrapper}>
                            {zoomedStudent === 'teacher' && uploadedImage && (
                                <img
                                    src={uploadedImage}
                                    alt="Uploaded lesson"
                                    className={styles.teacherBoardImage}
                                />
                            )}
                            <canvas 
                                ref={zoomCanvasRef} 
                                className={`${styles.zoomCanvas} ${zoomedStudent === 'teacher' ? styles.teacherBoardCanvas : ''}`}
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
                        <h2 className={styles.qrModalTitle}>Scan to Join Class Module</h2>
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
