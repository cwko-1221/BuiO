/**
 * Dashboard Page Logic
 * 載入學生統計資料，渲染雷達圖、正確率條形圖、弱點分析、時間分析
 */

(function() {
    'use strict';

    // The shared runtime loads blocking in <head>, so the dictionary is ready.
    const t = window.BuiI18n.t;

    // ========================================
    // State
    // ========================================
    let currentStudentId = '';
    let currentUserRole = '';            // 'teacher' | 'student'
    let radarChartObjs = {};             // { bronze: Chart, silver: Chart, gold-1: Chart, ... }
    let timeChartObj = null;
    let tierOrder = [                    // fallback; refreshed from /api/stats/tiers
        { id: 'bronze',  name: t('m.tierBronze') },
        { id: 'silver',  name: t('m.tierSilver') },
        { id: 'gold',    name: t('m.tierGold') },
        { id: 'diamond', name: t('m.tierDiamond') },
        { id: 'fire',    name: t('m.tierFire') },
        { id: 'sun',     name: t('m.tierSun') },
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
        // "和<100" / "sum < 100" only repeats what the prefix already says.
        hints = hints.filter(h => !/^(和|結果|sum|result)\s*[<≤]/i.test(h));
        if (!hints.length) return prefix;
        const join = window.BuiI18n.lang === 'en-US' ? ', ' : '、';
        const paren = hints.length <= 2
            ? hints.join(join)
            : `${hints[0]}${join}${hints[hints.length - 1]}`;
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
                const topicListNav = document.getElementById('teacher-topics-nav');
                if (topicListNav) topicListNav.hidden = false;
                // Teacher: existing student-picker flow.
                initTierPolicyPanel();
                initQuestionTypePolicyPanel();
                await loadStudentList();
            } else {
                // Student: skip the picker, show own stats immediately.
                document.getElementById('student-loading').style.display = 'none';
                const label = document.querySelector('label[for="student-selector"]');
                if (label) label.style.display = 'none';
                const title = document.querySelector('.main-content h1');
                if (title) title.textContent = t('m.myProgressTitle');
                const subtitle = title?.nextElementSibling;
                if (subtitle && subtitle.tagName === 'P') {
                    subtitle.textContent = t('m.myProgressLead');
                }
                // Hide the teacher-only "📊 教師儀表板" nav link label so students
                // don't see a mismatched title in the top bar.
                const navActive = document.querySelector('.navbar a.active');
                if (navActive) navActive.textContent = t('m.navMyProgress');
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
                opt.textContent = t('m.studentOption', { id: s.id, name: s.name, count: s.totalQuestions, accuracy: s.overallAccuracy });
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

    // ========================================
    // Tier policy (teacher only)
    // ========================================
    // Teachers switch 銅/銀/金/鑽 on or off per grade, or per math group inside a
    // grade. A switched-off tier stops being generated AND stops appearing on
    // the child's radar, so the panel says so up front rather than letting a
    // teacher discover the second half later.
    let tierPolicyRows = [];

    function initTierPolicyPanel() {
        const panel = document.getElementById('tier-policy-panel');
        const toggle = document.getElementById('tier-policy-toggle');
        const body = document.getElementById('tier-policy-body');
        if (!panel || !toggle || !body) return;

        panel.hidden = false;
        toggle.addEventListener('click', () => {
            const opening = body.hidden;
            body.hidden = !opening;
            toggle.textContent = t(opening ? 'm.tierCollapse' : 'm.tierExpand');
            toggle.setAttribute('aria-expanded', String(opening));
            if (opening && !tierPolicyRows.length) loadTierPolicy();
        });
    }

    async function loadTierPolicy() {
        try {
            const res = await fetch('/api/stats/teacher/tier-policy', { credentials: 'include' });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || t('m.loadFailed'));
            tierPolicyRows = data.rows || [];
            renderTierPolicy();
        } catch (e) {
            const host = document.getElementById('tier-policy-rows');
            if (host) host.textContent = t('m.tierLoadFailed');
            console.error('載入題目級別設定失敗:', e);
        }
    }

    function tierPolicyMessage(text, kind) {
        const box = document.getElementById('tier-policy-message');
        if (!box) return;
        box.hidden = !text;
        box.textContent = text || '';
        box.className = 'tier-policy-message' + (kind ? ' ' + kind : '');
    }

    const TIER_EMOJI = { bronze: '🥉', silver: '🥈', gold: '🥇', diamond: '💎', fire: '🔥', sun: '☀️' };

    function renderTierPolicy() {
        const host = document.getElementById('tier-policy-rows');
        if (!host) return;
        host.innerHTML = '';

        for (const row of tierPolicyRows) {
            const off = new Set(row.disabled || []);
            const el = document.createElement('div');
            el.className = 'tier-policy-row' + (row.isGradeWide ? '' : ' group');

            const name = document.createElement('div');
            name.className = 'tier-policy-name';
            name.textContent = row.label;
            const count = document.createElement('small');
            count.textContent = t('m.studentCount', { count: row.studentCount });
            name.appendChild(count);
            el.appendChild(name);

            const switches = document.createElement('div');
            switches.className = 'tier-policy-switches';
            for (const tier of row.tiers) {
                const enabled = !off.has(tier.id);
                const label = document.createElement('label');
                label.className = 'tier-policy-switch' + (enabled ? '' : ' off');
                const box = document.createElement('input');
                box.type = 'checkbox';
                box.checked = enabled;
                box.dataset.tier = tier.id;
                box.addEventListener('change', () => saveTierPolicyRow(el, row));
                label.appendChild(box);
                label.appendChild(document.createTextNode(
                    (TIER_EMOJI[tier.id] || '') + ' ' + tier.name));
                switches.appendChild(label);
            }
            el.appendChild(switches);

            if (!row.isGradeWide) {
                const note = document.createElement('div');
                note.className = 'tier-policy-inherit';
                if (row.configured) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.textContent = t('m.followYear');
                    btn.addEventListener('click', () => saveTierPolicyRow(el, row, null));
                    note.appendChild(btn);
                } else {
                    note.textContent = t('m.followingYear');
                }
                el.appendChild(note);
            }

            host.appendChild(el);
        }
    }

    // Passing null for disabled clears a group's own rule so it follows its
    // grade again; otherwise the row's unchecked boxes become the disabled list.
    async function saveTierPolicyRow(el, row, disabled) {
        const payload = disabled === null
            ? null
            : [...el.querySelectorAll('input[type="checkbox"]')]
                .filter(box => !box.checked)
                .map(box => box.dataset.tier);

        el.dataset.busy = '1';
        tierPolicyMessage(t('m.saving'), '');
        try {
            const res = await fetch('/api/stats/teacher/tier-policy', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    className: row.className,
                    mathGroup: row.mathGroup,
                    disabledTiers: payload,
                }),
            });
            const data = await res.json();
            if (!data.success) {
                // The server refused — e.g. every tier switched off. Redraw from
                // the last known-good state so the checkbox stops claiming a
                // change that was never saved.
                renderTierPolicy();
                tierPolicyMessage(data.message || t('m.saveFailedDot'), 'error');
                return;
            }
            tierPolicyRows = data.rows || tierPolicyRows;
            renderTierPolicy();
            tierPolicyMessage(t('m.savedFor', { label: row.label }), 'ok');
            // The teacher may be looking at a student this rule just changed.
            if (currentStudentId) reloadAllStats();
        } catch (e) {
            renderTierPolicy();
            tierPolicyMessage(t('m.saveRetry'), 'error');
            console.error('儲存題目級別設定失敗:', e);
        } finally {
            el.dataset.busy = '';
        }
    }

    // ========================================
    // Question type policy (teacher only)
    // ========================================
    let questionTypePolicyRows = [];

    function initQuestionTypePolicyPanel() {
        const panel = document.getElementById('question-type-policy-panel');
        const toggle = document.getElementById('question-type-policy-toggle');
        const body = document.getElementById('question-type-policy-body');
        if (!panel || !toggle || !body) return;

        panel.hidden = false;
        toggle.addEventListener('click', () => {
            const opening = body.hidden;
            body.hidden = !opening;
            toggle.textContent = t(opening ? 'm.tierCollapse' : 'm.tierExpand');
            toggle.setAttribute('aria-expanded', String(opening));
            if (opening && !questionTypePolicyRows.length) loadQuestionTypePolicy();
        });
    }

    async function loadQuestionTypePolicy() {
        try {
            const res = await fetch('/api/stats/teacher/question-type-policy', { credentials: 'include' });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || t('m.loadFailed'));
            questionTypePolicyRows = data.rows || [];
            renderQuestionTypePolicy();
        } catch (e) {
            const host = document.getElementById('question-type-policy-rows');
            if (host) host.textContent = t('m.questionTypeLoadFailed');
            console.error('載入題目類型設定失敗:', e);
        }
    }

    function questionTypePolicyMessage(text, kind) {
        const box = document.getElementById('question-type-policy-message');
        if (!box) return;
        box.hidden = !text;
        box.textContent = text || '';
        box.className = 'tier-policy-message' + (kind ? ' ' + kind : '');
    }

    const QUESTION_TYPE_EMOJI = { add: '➕', sub: '➖', mul: '✖️', div: '➗', mix: '🔀', algebra: '🧮' };
    const QUESTION_TYPE_LABELS = {
        add: 'm.catAdd',
        sub: 'm.catSub',
        mul: 'm.catMul',
        div: 'm.catDiv',
        mix: 'm.catMix',
        algebra: 'm.catAlgebra',
        integer: 'm.catInteger',
        fraction: 'm.catFraction',
        decimal: 'm.catDecimal',
    };
    const QUESTION_TYPE_GROUPS = [
        { label: 'm.questionTypeOperations', ids: ['add', 'sub', 'mul', 'div', 'mix', 'algebra'] },
        { label: 'm.questionTypeNumberKinds', ids: ['integer', 'fraction', 'decimal'] },
    ];

    function renderQuestionTypePolicy() {
        const host = document.getElementById('question-type-policy-rows');
        if (!host) return;
        host.innerHTML = '';

        for (const row of questionTypePolicyRows) {
            const off = new Set(row.disabled || []);
            const el = document.createElement('div');
            el.className = 'tier-policy-row' + (row.isGradeWide ? '' : ' group');

            const name = document.createElement('div');
            name.className = 'tier-policy-name';
            name.textContent = row.label;
            const count = document.createElement('small');
            count.textContent = t('m.studentCount', { count: row.studentCount });
            name.appendChild(count);
            el.appendChild(name);

            const typeGroups = document.createElement('div');
            typeGroups.className = 'question-type-groups';
            const availableTypes = new Map((row.questionTypes || []).map(type => [type.id, type]));
            for (const group of QUESTION_TYPE_GROUPS) {
                const types = group.ids.map(id => availableTypes.get(id)).filter(Boolean);
                if (!types.length) continue;
                const section = document.createElement('div');
                section.className = 'question-type-group';
                const heading = document.createElement('div');
                heading.className = 'question-type-group-title';
                heading.textContent = t(group.label);
                section.appendChild(heading);
                const switches = document.createElement('div');
                switches.className = 'tier-policy-switches';
                for (const type of types) {
                    const enabled = !off.has(type.id);
                    const label = document.createElement('label');
                    label.className = 'tier-policy-switch' + (enabled ? '' : ' off');
                    const box = document.createElement('input');
                    box.type = 'checkbox';
                    box.checked = enabled;
                    box.dataset.questionType = type.id;
                    box.addEventListener('change', () => saveQuestionTypePolicyRow(el, row));
                    label.appendChild(box);
                    const labelKey = QUESTION_TYPE_LABELS[type.id];
                    label.appendChild(document.createTextNode(
                        (QUESTION_TYPE_EMOJI[type.id] || '') + ' ' +
                        (labelKey ? t(labelKey) : (type.name || type.id))));
                    switches.appendChild(label);
                }
                section.appendChild(switches);
                typeGroups.appendChild(section);
            }
            el.appendChild(typeGroups);

            if (!row.isGradeWide) {
                const note = document.createElement('div');
                note.className = 'tier-policy-inherit';
                if (row.configured) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.textContent = t('m.followYear');
                    btn.addEventListener('click', () => saveQuestionTypePolicyRow(el, row, null));
                    note.appendChild(btn);
                } else {
                    note.textContent = t('m.followingYear');
                }
                el.appendChild(note);
            }

            host.appendChild(el);
        }
    }

    async function saveQuestionTypePolicyRow(el, row, disabled) {
        const payload = disabled === null
            ? null
            : [...el.querySelectorAll('input[type="checkbox"]')]
                .filter(box => !box.checked)
                .map(box => box.dataset.questionType);

        el.dataset.busy = '1';
        questionTypePolicyMessage(t('m.saving'), '');
        try {
            const res = await fetch('/api/stats/teacher/question-type-policy', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    className: row.className,
                    mathGroup: row.mathGroup,
                    disabledQuestionTypes: payload,
                }),
            });
            const data = await res.json();
            if (!data.success) {
                renderQuestionTypePolicy();
                questionTypePolicyMessage(data.message || t('m.saveFailedDot'), 'error');
                return;
            }
            questionTypePolicyRows = data.rows || questionTypePolicyRows;
            renderQuestionTypePolicy();
            questionTypePolicyMessage(t('m.savedFor', { label: row.label }), 'ok');
            if (currentStudentId) reloadAllStats();
        } catch (e) {
            renderQuestionTypePolicy();
            questionTypePolicyMessage(t('m.saveRetry'), 'error');
            console.error('儲存題目類型設定失敗:', e);
        } finally {
            el.dataset.busy = '';
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
    // A P1 kid gets 銅 only; higher grades inherit each previous tier.
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

        const emojiFor = { bronze: '🥉', silver: '🥈', gold: '🥇', diamond: '💎', fire: '🔥', sun: '☀️' };

        for (const tier of tierOrder) {
            const list = byTier.get(tier.id) || [];
            if (!list.length) continue;                    // grade doesn't have this tier

            // Keep larger tiers readable by splitting any tier with more than
            // ten skills into two balanced charts. This currently affects
            // Gold and Diamond while leaving the smaller tiers unchanged.
            const lists = list.length > 10
                ? [list.slice(0, Math.ceil(list.length / 2)), list.slice(Math.ceil(list.length / 2))]
                : [list];

            lists.forEach((chartList, chartIndex) => {
                const chartKey = lists.length > 1 ? `${tier.id}-${chartIndex + 1}` : tier.id;
                const cell = document.createElement('div');
                cell.className = `radar-tier-cell ${tier.id}${lists.length > 1 ? ' radar-tier-part' : ''}`;
                const heading = lists.length > 1
                    ? t('m.tierHeadingPart', { tier: tier.name, part: chartIndex + 1, total: lists.length })
                    : t('m.tierHeading', { tier: tier.name });
                cell.innerHTML = `
                    <div class="radar-tier-head">
                        <span class="radar-tier-badge">${emojiFor[tier.id] || tier.name}</span>
                        <span>${heading}</span>
                        <span class="radar-tier-subtitle">${t('m.skillCount', { count: chartList.length })}</span>
                    </div>
                    <div class="radar-tier-canvas-wrap"><canvas></canvas></div>
                `;
                grid.appendChild(cell);
                const canvas = cell.querySelector('canvas');
                radarChartObjs[chartKey] = new Chart(canvas, radarConfigFor(chartList));
            });
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
                    label: t('m.accuracyAxis'),
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
                    if (confirm(t('m.confirmPractise', { name }))) {
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
                                return raw + (clickable ? t('m.clickToPractise') : '');
                            },
                            label: (ctx) => t('m.accuracyTip', { value: ctx.raw }),
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
            [t('m.catAdd')]: '➕', [t('m.catSub')]: '➖', [t('m.catMul')]: '✖️',
            [t('m.catDiv')]: '➗', [t('m.catAlgebra')]: '🧮'
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
                        <div class="empty-state-text">${t('m.noWeakness')}</div>
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
                        <div class="weakness-detail">${t('m.weaknessDetail', { suggestion: w.suggestion, count: w.totalAttempted })}</div>
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
                    <div class="empty-state-text">${t('m.noRecords')}</div>
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
                    label: t('m.avgSeconds'),
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
                            label: (ctx) => t('m.avgTip', { value: ctx.raw })
                        }
                    }
                },
                layout: { padding: { left: 4, right: 16, top: 8, bottom: 8 } },
                scales: {
                    x: {
                        beginAtZero: true,
                        title: { display: true, text: t('m.secondsAxis'), color: '#64748b' },
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
