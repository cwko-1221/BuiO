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
                }
            } else {
                // Fallback for initial state or if hidden
                const rect = canvas.parentElement.getBoundingClientRect();
                canvas.width = rect.width || 800;
                canvas.height = 350; // Use the fixed height from CSS as default
                
                if (ctx) {
                    ctx.lineJoin = 'round';
                    ctx.lineCap = 'round';
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = '#f1f5f9';
                }
            }
        };
        
        window.addEventListener('resize', window.resizeCanvas);
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
    }

    function clearCanvas() {
        if (ctx && canvas) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    async function loadQuestions() {
        showState('loading');

        try {
            const res = await fetch('/api/quiz/questions?count=5', { credentials: 'include' });
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

        // Clear canvas for new question
        clearCanvas();

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
