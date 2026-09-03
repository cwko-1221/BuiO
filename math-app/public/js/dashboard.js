/**
 * Dashboard Page Logic
 * 載入學生統計資料，渲染雷達圖、正確率條形圖、弱點分析、時間分析
 */

(function() {
    'use strict';

    // ========================================
    // State
    // ========================================
    let currentStudentId = '';
    let currentUserRole = '';            // 'teacher' | 'student'
    let radarChartObjs = {};             // { bronze: Chart, silver: Chart, ... }
    let timeChartObj = null;
    let tierOrder = [                    // fallback; refreshed from /api/stats/tiers
        { id: 'bronze',  name: '銅' },
        { id: 'silver',  name: '銀' },
        { id: 'gold',    name: '金' },
        { id: 'diamond', name: '鑽' },
    ];

    // Build a compact tag label for radar / time-analysis charts.
    // The full tag name is like "2個數加法 (2位數、有進位、和<100)". Stripping
    // parens completely made 3 tags all show as "2個數加法" (collision).
    // Keep both the category prefix and the distinguishing hint(s) inside
    // the parens, cap the total length so the label still fits.
    // Chart.js radar accepts an array of strings for multi-line labels —
    // return [prefix, "(hints)"] so nothing is truncated. In `compact`
    // mode (used when a tier has many tags and 2-line labels would collide
    // between neighbours) we squash to a single line and drop redundant
    // hints, still keeping the pair that makes sibling tags distinct.
    function shortLabel(name, opts = {}) {
        if (!name) return '';
        const m = name.match(/^([^(（]+)\s*[（(]([^）)]+)[）)]/);
        if (!m) return name;
        const prefix = m[1].trim();
        let hints = m[2].split(/[、,]/).map(h => h.trim()).filter(Boolean);
        hints = hints.filter(h => !/^(和|結果)\s*[<≤]/.test(h));
        if (!hints.length) return prefix;
        const paren = hints.length <= 2
            ? hints.join('、')
            : `${hints[0]}、${hints[hints.length - 1]}`;
        if (opts.compact) return `${prefix}(${paren})`;
        return [prefix, `(${paren})`];
    }

    // ========================================
    // Initialize
    // ========================================
    init();

    async function init() {
        try {
            const res = await fetch('/api/auth/me', { credentials: 'include' });
            if (!res.ok) {
                window.location.href = '/';
                return;
            }
            const data = await res.json();

            document.getElementById('student-name').textContent = data.student.name;
            document.getElementById('student-avatar').textContent = data.student.name[0];
            currentUserRole = data.student.role;

            // Teachers don't have the math hub — return them straight to the
            // BuiO learning-hub portal instead of bouncing them to /math
            // (which just serves this dashboard back to them).
            if (data.student.role === 'teacher') {
                const backLink = document.getElementById('back-home-link');
                if (backLink) backLink.href = '/';
            }

            if (data.student.role === 'teacher') {
                // Teacher: existing student-picker flow.
                await loadStudentList();
            } else {
                // Student: skip the picker, show own stats immediately.
                document.getElementById('student-loading').style.display = 'none';
                const label = document.querySelector('label[for="student-selector"]');
                if (label) label.style.display = 'none';
                const title = document.querySelector('.main-content h1');
                if (title) title.textContent = '📊 我的學習進度';
                const subtitle = title?.nextElementSibling;
                if (subtitle && subtitle.tagName === 'P') {
                    subtitle.textContent = '查看你自己每個題型的正確率和弱點分析。';
                }
                // Hide the teacher-only "📊 教師儀表板" nav link label so students
                // don't see a mismatched title in the top bar.
                const navActive = document.querySelector('.navbar a.active');
                if (navActive) navActive.textContent = '📊 我的學習';
                currentStudentId = data.student.id;
                await reloadAllStats();
            }

        } catch {
            window.location.href = '/';
            return;
        }

        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('dashboard-content').style.display = 'block';
    }

    // ========================================
    // Load Student List (Teacher)
    // ========================================
    async function loadStudentList() {
        try {
            const res = await fetch('/api/stats/teacher/students', { credentials: 'include' });
            const data = await res.json();
            if (!data.success) return;

            const selector = document.getElementById('student-selector');
            const loading = document.getElementById('student-loading');
            
            loading.style.display = 'none';
            selector.style.display = 'inline-block';

            data.students.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = `${s.id} - ${s.name} (答題:${s.totalQuestions}, 正確率:${s.overallAccuracy}%)`;
                selector.appendChild(opt);
            });

            selector.addEventListener('change', async (e) => {
                if (e.target.value) {
                    currentStudentId = e.target.value;
                    document.getElementById('dashboard-content').style.display = 'block';
                    await reloadAllStats();
                } else {
                    currentStudentId = '';
                    document.getElementById('dashboard-content').style.display = 'none';
                }
            });

        } catch (e) {
            console.error('載入學生清單失敗:', e);
        }
    }

    async function reloadAllStats() {
        document.getElementById('dashboard-content').style.opacity = '0.5';
        await Promise.all([
            loadOverview(),
            loadTagStats(),
            loadWeaknesses(),
            loadTimeAnalysis()
        ]);
        document.getElementById('dashboard-content').style.opacity = '1';
    }

    // ========================================
    // Overview
    // ========================================
    async function loadOverview() {
        if (!currentStudentId) return;
        try {
            const res = await fetch(`/api/stats/overview?studentId=${currentStudentId}`, { credentials: 'include' });
            const data = await res.json();
            if (!data.success) return;

            const o = data.overview;
            document.getElementById('total-questions').textContent = o.totalQuestions;
            document.getElementById('overall-accuracy').textContent = o.overallAccuracy + '%';
            document.getElementById('total-correct').textContent = o.totalCorrect;
            document.getElementById('avg-time').textContent = o.today.avgTime + 's';
        } catch (e) {
            console.error('載入概覽失敗:', e);
        }
    }

    // ========================================
    // Tag Stats (Radar + Bars)
    // ========================================
    async function loadTagStats() {
        if (!currentStudentId) return;
        try {
            // Refresh tier metadata once per dashboard load (cached after).
            if (!loadTagStats._tiersFetched) {
                try {
                    const r = await fetch('/api/stats/tiers', { credentials: 'include' });
                    const d = await r.json();
                    if (d.success && Array.isArray(d.tiers) && d.tiers.length) tierOrder = d.tiers;
                } catch {}
                loadTagStats._tiersFetched = true;
            }
            const res = await fetch(`/api/stats/tags?studentId=${currentStudentId}`, { credentials: 'include' });
            const data = await res.json();
            if (!data.success) return;

            renderTierRadars(data.stats);
            renderTagBars(data.stats);
        } catch (e) {
            console.error('載入標籤統計失敗:', e);
        }
    }

    // Render one small radar per tier the student actually has tags in.
    // A P1 kid gets 銅 only; a P4 kid gets 銅/銀/金/鑽.
    function renderTierRadars(stats) {
        const grid = document.getElementById('radar-tier-grid');
        if (!grid) return;
        grid.innerHTML = '';
        // Kill any old chart instances first.
        for (const key of Object.keys(radarChartObjs)) {
            try { radarChartObjs[key].destroy(); } catch {}
        }
        radarChartObjs = {};

        // Group stats by tier.
        const byTier = new Map();
        for (const s of stats) {
            const t = s.tier || 'other';
            if (!byTier.has(t)) byTier.set(t, []);
            byTier.get(t).push(s);
        }

        const emojiFor = { bronze: '🥉', silver: '🥈', gold: '🥇', diamond: '💎' };

        for (const tier of tierOrder) {
            const list = byTier.get(tier.id) || [];
            if (!list.length) continue;                    // grade doesn't have this tier

            const cell = document.createElement('div');
            cell.className = `radar-tier-cell ${tier.id}`;
            cell.innerHTML = `
                <div class="radar-tier-head">
                    <span class="radar-tier-badge">${emojiFor[tier.id] || tier.name}</span>
                    <span>${tier.name} 等級</span>
                    <span class="radar-tier-subtitle">${list.length} 個能力</span>
                </div>
                <div class="radar-tier-canvas-wrap"><canvas></canvas></div>
            `;
            grid.appendChild(cell);
            const canvas = cell.querySelector('canvas');
            radarChartObjs[tier.id] = new Chart(canvas, radarConfigFor(list));
        }
    }

    function radarConfigFor(list) {
        // Always keep 2-line labels; just shrink the font when the tier
        // gets crowded so neighbours don't overlap.
        //   ≤8 tags   → 10 px    (bronze)
        //   9–11 tags → 9  px    (silver / diamond)
        //   12+ tags  → 8  px    (gold)
        const n = list.length;
        const compact = false;
        const fontSize = n >= 12 ? 8 : n >= 9 ? 9 : 10;
        // Students can click a label to practice that specific tag (3 questions).
        // Teachers viewing a student's dashboard shouldn't trigger navigation.
        const clickable = currentUserRole === 'student';

        function findLabelHit(chart, evt) {
            const scale = chart.scales?.r;
            if (!scale) return -1;
            // Chart.js v4 ChartEvent exposes x/y; fall back to native.offset*
            // for older builds.
            const x = evt.x ?? evt.native?.offsetX;
            const y = evt.y ?? evt.native?.offsetY;
            if (x == null || y == null) return -1;
            // Chart.js draws pointLabels at ~drawingArea + a small pad; try
            // a range of radii so we tolerate the exact padding number.
            const radii = [
                scale.drawingArea + 8,
                scale.drawingArea + 22,
                scale.drawingArea + 36,
                scale.drawingArea + 50,
            ];
            let best = -1, bestD = 55;   // 55 px hit tolerance
            for (let i = 0; i < list.length; i++) {
                for (const r of radii) {
                    const p = scale.getPointPosition(i, r);
                    const dx = x - p.x, dy = y - p.y;
                    const d = Math.hypot(dx, dy);
                    if (d < bestD) { bestD = d; best = i; }
                }
            }
            return best;
        }

        return {
            type: 'radar',
            data: {
                labels: list.map(s => shortLabel(s.tagName, { compact })),
                datasets: [{
                    label: '正確率 (%)',
                    data: list.map(s => s.accuracyRate),
                    backgroundColor: 'rgba(139, 92, 246, 0.15)',
                    borderColor: 'rgba(139, 92, 246, 0.8)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgba(139, 92, 246, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                layout: { padding: 40 },
                onHover: !clickable ? undefined : (evt, _els, chart) => {
                    const i = findLabelHit(chart, evt);
                    chart.canvas.style.cursor = i >= 0 ? 'pointer' : 'default';
                },
                onClick: !clickable ? undefined : (evt, _els, chart) => {
                    const i = findLabelHit(chart, evt);
                    if (i < 0) return;
                    const tag = list[i].tag;
                    const name = list[i].tagName || tag;
                    if (confirm(`練習「${name}」（3 條題目）？`)) {
                        location.href = `/quiz.html?tag=${encodeURIComponent(tag)}&count=3`;
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: {
                            title: (items) => {
                                const raw = list[items[0].dataIndex]?.tagName || '';
                                return raw + (clickable ? '（點選標籤練習 3 題）' : '');
                            },
                            label: (ctx) => `正確率: ${ctx.raw}%`,
                        },
                    },
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            stepSize: 20,
                            color: '#64748b',
                            backdropColor: 'transparent',
                            font: { size: 10 },
                        },
                        grid:       { color: 'rgba(255, 255, 255, 0.06)' },
                        angleLines: { color: 'rgba(255, 255, 255, 0.06)' },
                        pointLabels: {
                            color: '#cbd5e1',
                            font: { size: fontSize, weight: 500 },
                        },
                    },
                },
            },
        };
    }

    function renderTagBars(stats) {
        const container = document.getElementById('tag-bars');
        if (!container) return;
        container.innerHTML = '';

        // Category icons
        const icons = {
            '加法': '➕', '減法': '➖', '乘法': '✖️', '除法': '➗'
        };

        for (const s of stats) {
            const rate = s.accuracyRate;
            let barClass = 'high';
            if (rate < 50) barClass = 'low';
            else if (rate < 70) barClass = 'medium';

            const icon = icons[s.category] || '📐';
            const label = s.tagName.length > 16 ? s.tagName.substring(0, 16) + '…' : s.tagName;

            const item = document.createElement('div');
            item.className = 'tag-bar-item';
            item.innerHTML = `
                <div class="tag-bar-label" title="${s.tagName}">${icon} ${label}</div>
                <div class="tag-bar-track">
                    <div class="tag-bar-fill ${barClass}" style="width: 0%;" data-width="${rate}%"></div>
                </div>
                <div class="tag-bar-value">${rate}%</div>
            `;
            container.appendChild(item);
        }

        // Animate bars
        setTimeout(() => {
            container.querySelectorAll('.tag-bar-fill').forEach(bar => {
                bar.style.width = bar.dataset.width;
            });
        }, 100);
    }

    // ========================================
    // Weaknesses
    // ========================================
    async function loadWeaknesses() {
        if (!currentStudentId) return;
        try {
            const res = await fetch(`/api/stats/weaknesses?studentId=${currentStudentId}`, { credentials: 'include' });
            const data = await res.json();
            if (!data.success) return;

            const container = document.getElementById('weakness-list');
            container.innerHTML = '';

            if (data.weaknesses.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🏆</div>
                        <div class="empty-state-text">太棒了！目前沒有弱點標籤。<br>所有題型正確率都在 70% 以上！</div>
                    </div>
                `;
                return;
            }

            for (const w of data.weaknesses) {
                const item = document.createElement('div');
                item.className = 'weakness-item';
                item.innerHTML = `
                    <div class="weakness-icon">⚠️</div>
                    <div class="weakness-info">
                        <div class="weakness-name">${w.tagName}</div>
                        <div class="weakness-detail">${w.suggestion} · 共作答 ${w.totalAttempted} 題</div>
                    </div>
                    <div class="weakness-rate">${w.accuracyRate}%</div>
                `;
                container.appendChild(item);
            }
        } catch (e) {
            console.error('載入弱點分析失敗:', e);
        }
    }

    // ========================================
    // Time Analysis
    // ========================================
    async function loadTimeAnalysis() {
        if (!currentStudentId) return;
        try {
            const res = await fetch(`/api/stats/time-analysis?studentId=${currentStudentId}`, { credentials: 'include' });
            const data = await res.json();
            if (!data.success) return;

            renderTimeChart(data.timeAnalysis);
        } catch (e) {
            console.error('載入時間分析失敗:', e);
        }
    }

    function renderTimeChart(timeData) {
        let container = document.getElementById('time-chart-container');
        if (!container) return;

        if (timeChartObj) {
            timeChartObj.destroy();
            timeChartObj = null;
        }

        if (timeData.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📊</div>
                    <div class="empty-state-text">還沒有作答紀錄<br>開始練習後就會顯示時間分析</div>
                </div>
            `;
            return;
        }

        // 重新建立 canvas 確保不會因為之前的空狀態而消失。
        // 高度 = 每列 46 px（含間距），最少 320 px；讓 bar 與標籤有呼吸空間。
        const rowHeight = 46;
        const canvasHeight = Math.max(320, timeData.length * rowHeight + 60);
        container.innerHTML = `<canvas id="time-chart" style="height:${canvasHeight}px"></canvas>`;
        container.style.height = canvasHeight + 'px';
        const ctx = document.getElementById('time-chart');

        const labels = timeData.map(t => shortLabel(t.tagName));
        const values = timeData.map(t => t.avgTime);

        // Color gradient based on time
        const colors = values.map(v => {
            if (v <= 10) return 'rgba(16, 185, 129, 0.7)';
            if (v <= 20) return 'rgba(245, 158, 11, 0.7)';
            return 'rgba(239, 68, 68, 0.7)';
        });

        timeChartObj = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: '平均秒數',
                    data: values,
                    backgroundColor: colors,
                    borderColor: colors.map(c => c.replace('0.7', '1')),
                    borderWidth: 1,
                    borderRadius: 6,
                    barThickness: 22,
                    maxBarThickness: 26,
                    categoryPercentage: 0.85,
                    barPercentage: 0.9,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: (ctx) => `平均: ${ctx.raw} 秒`
                        }
                    }
                },
                layout: { padding: { left: 4, right: 16, top: 8, bottom: 8 } },
                scales: {
                    x: {
                        beginAtZero: true,
                        title: { display: true, text: '秒', color: '#64748b' },
                        ticks: { color: '#64748b' },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    },
                    y: {
                        // Reserve a fixed-width column for the tick labels so
                        // multi-line tag names line up neatly on the right edge.
                        afterFit: (scale) => { scale.width = 220; },
                        ticks: {
                            color: '#cbd5e1',
                            font: { size: 11 },
                            padding: 12,
                            autoSkip: false,
                            align: 'end',
                        },
                        grid: { display: false },
                    },
                }
            }
        });
    }

})();
