/**
 * Quiz Page Logic
 * 處理出題、計時、作答、提交、結果顯示
 */

(function() {
    'use strict';

    // ========================================
    // State
    // ========================================
    let questions = [];
    let currentIndex = 0;
    let answers = []; // { index, userAnswer, timeTaken }
    let timer = null;
    let questionStartTime = 0;
    let totalQuizTime = 0;
    let studentInfo = null;

    // ========================================
    // DOM Elements  
    // ========================================
    const loadingState = document.getElementById('loading-state');
    const quizState = document.getElementById('quiz-state');
    const resultsState = document.getElementById('results-state');

    const studentNameEl = document.getElementById('student-name');
    const studentAvatarEl = document.getElementById('student-avatar');
    const progressText = document.getElementById('progress-text');
    const progressBar = document.getElementById('progress-bar');
    const timerValue = document.getElementById('timer-value');

    const quizDotsEl = document.getElementById('quiz-dots');
    const questionNumber = document.getElementById('question-number');
    const questionTag = document.getElementById('question-tag-text');
    const questionCategory = document.getElementById('question-category');
    const questionText = document.getElementById('question-text');
    const answerInput = document.getElementById('answer-input');
    const submitBtn = document.getElementById('submit-answer-btn');

    // Canvas Element
    const canvas = document.getElementById('scratchpad');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const clearCanvasBtn = document.getElementById('clear-canvas-btn');

    // The grid and the 直式 hint are printed on a layer of their own beneath the
    // ink, so 清除草稿 takes away the child's working without taking away the paper.
    const guideCanvas = document.getElementById('scratchpad-guide');
    const guideCtx = guideCanvas ? guideCanvas.getContext('2d') : null;
    const gridToggleBtn = document.getElementById('grid-toggle-btn');
    const hintBtn = document.getElementById('hint-btn');
    let gridOn = false;
    let hintPlan = null;
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    const feedbackOverlay = document.getElementById('feedback-overlay');
    const feedbackIcon = document.getElementById('feedback-icon');

    // Results
    const resultsScore = document.getElementById('results-score');
    const resultsLabel = document.getElementById('results-label');
    const statCorrect = document.getElementById('stat-correct');
    const statIncorrect = document.getElementById('stat-incorrect');
    const statTime = document.getElementById('stat-time');
    const resultsDetail = document.getElementById('results-detail');
    const retryBtn = document.getElementById('retry-btn');

    // Category icons
    const categoryIcons = {
        '加法': '➕',
        '減法': '➖',
        '乘法': '✖️',
        '除法': '➗'
    };

    // ========================================
    // Initialize
    // ========================================
    init();

    async function init() {
        // 檢查登入
        try {
            const res = await fetch('/api/auth/me', { credentials: 'include' });
            if (!res.ok) {
                window.location.href = '/';
                return;
            }
            const data = await res.json();
            studentInfo = data.student;
            studentNameEl.textContent = studentInfo.name;
            studentAvatarEl.textContent = studentInfo.name[0];
        } catch {
            window.location.href = '/';
            return;
        }

        // Initialize Canvas
        if (canvas) {
            initCanvas();
        }

        // 載入題目
        await loadQuestions();
    }

    // ========================================
    // Canvas Logic
    // ========================================
    function initCanvas() {
        // Resize canvas to match display size
        window.resizeCanvas = function() {
            if (!canvas) return;
            
            // Get the actual display size from CSS
            const displayWidth = canvas.clientWidth;
            const displayHeight = canvas.clientHeight;
            
            // Only resize if the internal resolution doesn't match the display size
            // This also handles the fallback if clientWidth/Height is 0
            if (displayWidth > 0 && displayHeight > 0) {
                if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
                    canvas.width = displayWidth;
                    canvas.height = displayHeight;
                    
                    // Reset drawing styles as resizing clears the context
                    if (ctx) {
                        ctx.lineJoin = 'round';
                        ctx.lineCap = 'round';
                        ctx.lineWidth = 3;
                        ctx.strokeStyle = '#f1f5f9';
                    }
                    resizeGuide(displayWidth, displayHeight);
                }
            } else {
                // Fallback for initial state or if hidden
                const rect = canvas.parentElement.getBoundingClientRect();
                canvas.width = rect.width || 800;
                canvas.height = 600; // Fallback until the responsive CSS height can be measured
                
                if (ctx) {
                    ctx.lineJoin = 'round';
                    ctx.lineCap = 'round';
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = '#f1f5f9';
                }
                resizeGuide(canvas.width, canvas.height);
            }
        };
        
        window.addEventListener('resize', window.resizeCanvas);
        window.addEventListener('resize', () => redrawGuide());
        window.resizeCanvas();

        function startDrawing(e) {
            isDrawing = true;
            const pos = getPos(e);
            [lastX, lastY] = [pos.x, pos.y];
            e.preventDefault();
        }

        function draw(e) {
            if (!isDrawing) return;
            const pos = getPos(e);
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
            [lastX, lastY] = [pos.x, pos.y];
            e.preventDefault();
        }

        function stopDrawing() {
            isDrawing = false;
        }

        function getPos(e) {
            const rect = canvas.getBoundingClientRect();
            
            // Map the client coordinates to canvas internal coordinates
            // This accounts for any CSS scaling applied to the canvas element
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            
            let clientX, clientY;
            
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }
            
            return {
                x: (clientX - rect.left) * scaleX,
                y: (clientY - rect.top) * scaleY
            };
        }

        // Mouse events
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);

        // Touch events
        canvas.addEventListener('touchstart', startDrawing, { passive: false });
        canvas.addEventListener('touchmove', draw, { passive: false });
        canvas.addEventListener('touchend', stopDrawing);
        canvas.addEventListener('touchcancel', stopDrawing);

        // Clear button
        if (clearCanvasBtn) {
            clearCanvasBtn.addEventListener('click', clearCanvas);
        }

        if (gridToggleBtn) {
            gridToggleBtn.addEventListener('click', () => setGrid(!gridOn));
        }
        if (hintBtn) {
            hintBtn.addEventListener('click', toggleHint);
        }
    }

    // ========================================
    // Guide layer: squared paper + 直式 hint
    // ========================================
    // Roomy enough to write a digit into with a finger without aiming. The floor
    // is what a phone can still fit a division form into: divisor, bar and a
    // three-digit dividend need six columns of a 341px sketchpad.
    function cellSize() {
        const min = 56;
        const max = 88;
        const columns = 10;
        if (!guideCanvas) return min;
        return Math.max(min, Math.min(max, Math.round(guideCanvas.width / columns)));
    }

    // The column a form this wide starts in to sit across the middle of the paper,
    // snapped to the ruling so every digit still lands inside a square.
    function centreColumn(cols, cell) {
        const across = Math.floor(guideCanvas.width / cell);
        return Math.max(0, Math.floor((across - cols) / 2));
    }

    // Vertically the form is not centred: the working goes underneath it — the
    // subtractions of a long division, a second row of partial products — and
    // there is never enough of the page left if the form starts halfway down. It
    // sits one row from the top instead, that row being where the carries go.
    const HINT_TOP_ROW = 1;

    function resizeGuide(width, height) {
        if (!guideCanvas) return;
        if (guideCanvas.width !== width || guideCanvas.height !== height) {
            guideCanvas.width = width;
            guideCanvas.height = height;
        }
        redrawGuide();
    }

    // A square only looks square when the bitmap matches the box it is painted
    // into. resizeCanvas can leave the two apart — the sketchpad is laid out only
    // once the quiz state is shown, and the single frame that switch schedules can
    // still measure a hidden, zero-sized box and fall back to 800x600 — so the guide
    // measures itself every time it is drawn.
    function syncGuideToBox() {
        const width = guideCanvas.clientWidth;
        const height = guideCanvas.clientHeight;
        if (width > 0 && height > 0 && (guideCanvas.width !== width || guideCanvas.height !== height)) {
            guideCanvas.width = width;
            guideCanvas.height = height;
        }
    }

    function redrawGuide(retriesLeft) {
        if (!guideCtx || !guideCanvas) return;
        // The sketchpad can be measured mid-layout, before it has been given a
        // width; drawing then would stretch every square. Come back on a later
        // frame, but only a few times — on the results screen the pad is hidden
        // for good and there is nothing to wait for.
        if (guideCanvas.clientWidth === 0) {
            const left = retriesLeft === undefined ? 5 : retriesLeft;
            if (left > 0) requestAnimationFrame(() => redrawGuide(left - 1));
            return;
        }
        syncGuideToBox();
        guideCtx.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
        const cell = cellSize();
        if (gridOn) drawGrid(cell);
        if (hintPlan) drawHint(hintPlan, cell);
    }

    function drawGrid(cell) {
        const g = guideCtx;
        g.save();
        g.lineWidth = 1;
        g.strokeStyle = 'rgba(148, 163, 184, 0.28)';
        g.beginPath();
        // Half-pixel offsets keep the 1px rules crisp instead of blurring across two rows.
        for (let x = cell; x < guideCanvas.width; x += cell) {
            g.moveTo(Math.round(x) + 0.5, 0);
            g.lineTo(Math.round(x) + 0.5, guideCanvas.height);
        }
        for (let y = cell; y < guideCanvas.height; y += cell) {
            g.moveTo(0, Math.round(y) + 0.5);
            g.lineTo(guideCanvas.width, Math.round(y) + 0.5);
        }
        g.stroke();
        g.restore();
    }

    function setGrid(on) {
        gridOn = on;
        if (gridToggleBtn) gridToggleBtn.setAttribute('aria-pressed', String(on));
        redrawGuide();
    }

    // ---- Reading the question back as a 直式 ----
    // Question text is plain infix — "23 + 45", "(5 + 3) × 4", "247 ÷ 3 (只寫商)".
    function tokenizeQuestion(text) {
        const cleaned = String(text || '')
            .replace(/[（(]\s*只寫商\s*[)）]/g, ' ')
            .replace(/×/g, '*')
            .replace(/÷/g, '/')
            .replace(/[−－]/g, '-')
            .replace(/[（]/g, '(')
            .replace(/[）]/g, ')');
        const tokens = [];
        const re = /\s*(\d+|[+\-*/()])/g;
        let m;
        let consumed = 0;
        while ((m = re.exec(cleaned)) !== null) {
            if (m.index !== consumed) return null;   // something we don't understand
            tokens.push(m[1]);
            consumed = re.lastIndex;
        }
        if (cleaned.slice(consumed).trim() !== '') return null;
        return tokens.length ? tokens : null;
    }

    // The one operation a child performs first, given a flat run of numbers.
    // A chain of additions stays whole because that is how column addition is
    // taught; everything else collapses to the leftmost highest-precedence pair.
    function firstStepOfRun(tokens) {
        const nums = [];
        const ops = [];
        for (let i = 0; i < tokens.length; i++) {
            if (i % 2 === 0) {
                if (!/^\d+$/.test(tokens[i])) return null;
                nums.push(tokens[i]);
            } else {
                if (!/^[+\-*/]$/.test(tokens[i])) return null;
                ops.push(tokens[i]);
            }
        }
        if (nums.length < 2 || nums.length !== ops.length + 1) return null;
        if (ops.every(op => op === '+')) return { op: '+', operands: nums, coversRun: true };
        let at = ops.findIndex(op => op === '*' || op === '/');
        if (at < 0) at = 0;
        return { op: ops[at], operands: [nums[at], nums[at + 1]], coversRun: ops.length === 1 };
    }

    function firstStep(tokens) {
        // Innermost bracket first — that is the part the child has to reach for.
        let open = -1;
        for (let i = 0; i < tokens.length; i++) {
            if (tokens[i] === '(') open = i;
            else if (tokens[i] === ')' && open >= 0) {
                const step = firstStepOfRun(tokens.slice(open + 1, i));
                return step && Object.assign(step, { coversRun: false });
            }
        }
        return firstStepOfRun(tokens);
    }

    const OP_GLYPH = { '+': '+', '-': '−', '*': '×', '/': '÷' };

    function planVerticalForm(text) {
        const tokens = tokenizeQuestion(text);
        const step = tokens && firstStep(tokens);
        if (!step) return null;
        const glyph = OP_GLYPH[step.op];
        const caption = step.coversRun ? '' : '先算 ' + step.operands.join(' ' + glyph + ' ');
        if (step.op === '/') {
            return { kind: 'division', dividend: step.operands[0], divisor: step.operands[1], caption };
        }
        return { kind: 'column', operands: step.operands, glyph, caption };
    }

    // ---- Printing the 直式 into the squares ----
    const HINT_INK = '#fbbf24';

    function hintFont(cell) { return `700 ${Math.round(cell * 0.6)}px "Segoe UI", system-ui, sans-serif`; }

    function digitAt(g, ch, col, row, cell) {
        g.fillText(ch, col * cell + cell / 2, row * cell + cell / 2);
    }

    function drawCaption(g, caption, cell, col, row, cols) {
        if (!caption) return;
        g.save();
        g.font = `600 ${Math.round(cell * 0.32)}px "Segoe UI", system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(caption, (col + cols / 2) * cell, row * cell + cell / 2);
        g.restore();
    }

    function drawHint(plan, cell) {
        const g = guideCtx;
        g.save();
        g.fillStyle = HINT_INK;
        g.strokeStyle = HINT_INK;
        g.lineWidth = 2;
        g.font = hintFont(cell);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        if (plan.kind === 'division') drawDivisionForm(g, plan, cell);
        else drawColumnForm(g, plan, cell);
        g.restore();
    }

    function drawColumnForm(g, plan, cell) {
        const widest = Math.max.apply(null, plan.operands.map(n => n.length));
        const cols = widest + 1;                                  // one column for the operator
        const startCol = centreColumn(cols, cell);
        const firstRow = HINT_TOP_ROW + (plan.caption ? 1 : 0);
        const digitCol = startCol + 1;

        drawCaption(g, plan.caption, cell, startCol, 0, cols);

        plan.operands.forEach((n, i) => {
            const row = firstRow + i;
            const offset = digitCol + widest - n.length;
            for (let d = 0; d < n.length; d++) digitAt(g, n[d], offset + d, row, cell);
            if (i === plan.operands.length - 1) digitAt(g, plan.glyph, startCol, row, cell);
        });

        const ruleY = (firstRow + plan.operands.length) * cell;
        g.beginPath();
        g.moveTo(startCol * cell, ruleY);
        g.lineTo((digitCol + widest) * cell, ruleY);
        g.stroke();
    }

    function drawDivisionForm(g, plan, cell) {
        const cols = plan.divisor.length + plan.dividend.length;
        const startCol = centreColumn(cols, cell);
        // The row above the bar carries the quotient, so the top row is spent here
        // rather than on carries. Everything below is the child's working.
        const row = HINT_TOP_ROW + (plan.caption ? 1 : 0);
        const barCol = startCol + plan.divisor.length;

        drawCaption(g, plan.caption, cell, startCol, 0, cols);

        for (let d = 0; d < plan.divisor.length; d++) {
            digitAt(g, plan.divisor[d], startCol + d, row, cell);
        }
        for (let d = 0; d < plan.dividend.length; d++) {
            digitAt(g, plan.dividend[d], barCol + d, row, cell);
        }

        g.beginPath();
        g.moveTo(barCol * cell, row * cell);
        g.lineTo(barCol * cell, (row + 1) * cell);
        g.moveTo(barCol * cell, row * cell);
        g.lineTo((barCol + plan.dividend.length) * cell, row * cell);
        g.stroke();
    }

    function toggleHint() {
        if (hintPlan) { clearHint(); return; }
        const q = questions[currentIndex];
        const plan = q && planVerticalForm(q.questionText);
        if (!plan) {
            if (hintBtn) {
                const was = hintBtn.textContent;
                hintBtn.textContent = '這題不用直式';
                setTimeout(() => { hintBtn.textContent = was; }, 1600);
            }
            return;
        }
        hintPlan = plan;
        if (hintBtn) hintBtn.setAttribute('aria-pressed', 'true');
        // The hint is written in squares, so bring the squares out with it.
        if (!gridOn) setGrid(true);
        else redrawGuide();
    }

    function clearHint() {
        hintPlan = null;
        if (hintBtn) hintBtn.setAttribute('aria-pressed', 'false');
        redrawGuide();
    }

    function clearCanvas() {
        if (ctx && canvas) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    async function loadQuestions() {
        showState('loading');

        try {
            const params = new URLSearchParams(location.search);
            const tag = params.get('tag');
            const paramCount = parseInt(params.get('count'), 10);
            const count = Number.isFinite(paramCount) && paramCount > 0
                ? Math.min(paramCount, 20) : 10;
            const url = tag
                ? `/api/quiz/questions?count=${count}&tag=${encodeURIComponent(tag)}`
                : `/api/quiz/questions?count=${count}`;
            const res = await fetch(url, { credentials: 'include' });
            const data = await res.json();

            if (!data.success) {
                alert('載入題目失敗: ' + data.message);
                return;
            }

            questions = data.questions;
            answers = new Array(questions.length).fill(null);
            currentIndex = 0;
            totalQuizTime = 0;

            buildDots();
            showQuestion(0);
            showState('quiz');
            startTimer();

        } catch (error) {
            alert('連線失敗: ' + error.message);
        }
    }

    // ========================================
    // State Management
    // ========================================
    function showState(state) {
        loadingState.style.display = state === 'loading' ? 'block' : 'none';
        quizState.style.display = state === 'quiz' ? 'block' : 'none';
        resultsState.style.display = state === 'results' ? 'block' : 'none';

        // 當 quiz-state 顯示時，重新計算 Canvas 尺寸
        // （因為 display:none 時 getBoundingClientRect() 會回傳 0）
        if (state === 'quiz' && canvas) {
            requestAnimationFrame(() => {
                if (window.resizeCanvas) {
                    window.resizeCanvas();
                }
            });
        }
    }

    // ========================================
    // Quiz Dots
    // ========================================
    function buildDots() {
        quizDotsEl.innerHTML = '';
        questions.forEach((_, i) => {
            const dot = document.createElement('div');
            dot.className = 'quiz-dot' + (i === 0 ? ' current' : '');
            dot.title = `第 ${i + 1} 題`;
            quizDotsEl.appendChild(dot);
        });
    }

    function updateDots() {
        const dots = quizDotsEl.children;
        for (let i = 0; i < dots.length; i++) {
            dots[i].className = 'quiz-dot';
            if (i === currentIndex) dots[i].classList.add('current');
            if (answers[i] !== null) {
                dots[i].classList.add(answers[i].isCorrect ? 'correct' : 'incorrect');
            }
        }
    }

    // ========================================
    // Timer
    // ========================================
    function startTimer() {
        questionStartTime = Date.now();
        clearInterval(timer);
        timer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - questionStartTime) / 1000);
            timerValue.textContent = elapsed;
        }, 100);
    }

    function stopTimer() {
        clearInterval(timer);
        return (Date.now() - questionStartTime) / 1000;
    }

    // ========================================
    // Show Question
    // ========================================
    function showQuestion(idx) {
        const q = questions[idx];
        currentIndex = idx;

        // Update progress
        const answeredCount = answers.filter(a => a !== null).length;
        progressText.textContent = `第 ${answeredCount + 1} / ${questions.length} 題`;
        progressBar.style.width = `${(answeredCount / questions.length) * 100}%`;

        // Update question display
        questionNumber.textContent = `第 ${idx + 1} 題`;
        questionTag.textContent = q.category;
        questionCategory.textContent = q.tagName;
        questionText.textContent = q.questionText;

        // Update tag icon
        const tagEl = document.getElementById('question-tag');
        tagEl.querySelector('span:first-child').textContent = categoryIcons[q.category] || '📐';

        // Clear input
        answerInput.value = '';
        answerInput.className = 'answer-input';
        answerInput.disabled = false;
        submitBtn.disabled = false;
        submitBtn.textContent = '確認';

        // Focus input
        setTimeout(() => answerInput.focus(), 100);

        // Clear canvas for new question. The grid is a preference and stays put;
        // the hint belongs to the question that has just gone.
        clearCanvas();
        clearHint();

        // Restart timer
        startTimer();
        updateDots();
    }

    // ========================================
    // Submit Answer
    // ========================================
    async function submitAnswer() {
        const userAnswer = answerInput.value.trim();
        if (userAnswer === '') {
            answerInput.style.borderColor = 'var(--accent-amber)';
            answerInput.focus();
            return;
        }

        const timeTaken = stopTimer();
        const q = questions[currentIndex];

        submitBtn.disabled = true;
        submitBtn.textContent = '⏳';

        try {
            const res = await fetch('/api/quiz/answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    index: q.index,
                    userAnswer: parseFloat(userAnswer),
                    timeTaken: Math.round(timeTaken * 10) / 10
                })
            });

            const data = await res.json();

            if (!data.success) {
                alert(data.message);
                submitBtn.disabled = false;
                submitBtn.textContent = '確認';
                startTimer();
                return;
            }

            const result = data.result;

            // Store answer
            answers[currentIndex] = {
                index: q.index,
                userAnswer: parseFloat(userAnswer),
                timeTaken: Math.round(timeTaken * 10) / 10,
                isCorrect: result.isCorrect,
                correctAnswer: result.correctAnswer,
                questionText: result.questionText,
                tag: result.tag
            };

            totalQuizTime += timeTaken;

            // Visual feedback
            answerInput.disabled = true;
            if (result.isCorrect) {
                answerInput.classList.add('correct');
                showFeedback('✅');
            } else {
                answerInput.classList.add('incorrect');
                showFeedback('❌');
            }

            // Move to next question after delay
            updateDots();

            setTimeout(() => {
                const nextUnanswered = findNextUnanswered();
                if (nextUnanswered !== -1) {
                    showQuestion(nextUnanswered);
                } else {
                    showResults();
                }
            }, 800);

        } catch (error) {
            alert('提交失敗: ' + error.message);
            submitBtn.disabled = false;
            submitBtn.textContent = '確認';
            startTimer();
        }
    }

    function findNextUnanswered() {
        // 先找當前之後的
        for (let i = currentIndex + 1; i < questions.length; i++) {
            if (answers[i] === null) return i;
        }
        // 再從頭找
        for (let i = 0; i < currentIndex; i++) {
            if (answers[i] === null) return i;
        }
        return -1;
    }

    // Skip Question Logic (Removed for Phase 6 enforcement)

    // ========================================
    // Feedback Overlay
    // ========================================
    function showFeedback(icon) {
        feedbackIcon.textContent = icon;
        feedbackOverlay.classList.add('visible');
        setTimeout(() => {
            feedbackOverlay.classList.remove('visible');
        }, 500);
    }

    // ========================================
    // Show Results
    // ========================================
    function showResults() {
        stopTimer();
        showState('results');

        const validAnswers = answers.filter(a => a !== null);
        const correctCount = validAnswers.filter(a => a.isCorrect).length;
        const incorrectCount = validAnswers.length - correctCount;
        const accuracy = validAnswers.length > 0 
            ? Math.round(correctCount / validAnswers.length * 100) 
            : 0;
        const avgTime = validAnswers.length > 0
            ? (totalQuizTime / validAnswers.length).toFixed(1)
            : 0;

        // Animate score
        animateNumber(resultsScore, accuracy, '%');
        
        if (accuracy >= 80) {
            resultsLabel.textContent = '🌟 太厲害了！繼續保持！';
        } else if (accuracy >= 60) {
            resultsLabel.textContent = '👍 不錯喔！還可以更好！';
        } else {
            resultsLabel.textContent = '💪 加油！多練習就會進步！';
        }

        statCorrect.textContent = correctCount;
        statIncorrect.textContent = incorrectCount;
        statTime.textContent = avgTime + 's';

        // Build result details
        resultsDetail.innerHTML = '';
        for (const ans of validAnswers) {
            const item = document.createElement('div');
            item.className = 'result-item';
            
            const icon = ans.isCorrect ? '✅' : '❌';
            const iconClass = ans.isCorrect ? 'correct' : 'incorrect';
            const userAnsText = ans.skipped ? '跳過' : ans.userAnswer;
            const correctAnsText = ans.correctAnswer !== null ? ans.correctAnswer : '?';

            item.innerHTML = `
                <div class="result-item-left">
                    <div class="result-item-icon ${iconClass}">${icon}</div>
                    <div class="result-item-question">${ans.questionText}</div>
                </div>
                <div class="result-item-answer">
                    ${ans.isCorrect 
                        ? `<span class="correct-answer">${userAnsText}</span>` 
                        : `<span class="your-answer">${userAnsText}</span> → <span class="correct-answer">${correctAnsText}</span>`
                    }
                </div>
            `;
            resultsDetail.appendChild(item);
        }
    }

    function animateNumber(el, target, suffix = '') {
        let current = 0;
        const step = Math.ceil(target / 30);
        const interval = setInterval(() => {
            current += step;
            if (current >= target) {
                current = target;
                clearInterval(interval);
            }
            el.textContent = current + suffix;
        }, 30);
    }

    // ========================================
    // Event Listeners
    // ========================================
    submitBtn.addEventListener('click', submitAnswer);

    answerInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitAnswer();
        }
    });



    retryBtn.addEventListener('click', () => {
        loadQuestions();
    });

    window.logout = async function() {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/';
        } catch (e) {
            console.error('Logout failed', e);
        }
    };
})();
