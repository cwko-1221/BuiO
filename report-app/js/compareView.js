/* ========================================
   compareView.js — 趨勢對比模組
   ======================================== */

const CompareView = {
    charts: {},

    init() {
        document.getElementById('compare-mode').addEventListener('change', () => this._onModeChange());
        document.getElementById('compare-student-select').addEventListener('change', () => this.render());
        document.getElementById('compare-subject-select').addEventListener('change', () => this.render());
    },

    refreshSelectors() {
        // Student multi-select
        const studentSel = document.getElementById('compare-student-select');
        const students = DataManager.getAllStudents();
        studentSel.innerHTML = '';
        for (const name of students) {
            studentSel.innerHTML += `<option value="${name}">${name}</option>`;
        }

        // Subject select
        const subjSel = document.getElementById('compare-subject-select');
        const subjects = DataManager.getAllSubjects();
        subjSel.innerHTML = '';
        for (const s of subjects) {
            subjSel.innerHTML += `<option value="${s}">${s}</option>`;
        }

        this._onModeChange();
    },

    _onModeChange() {
        const mode = document.getElementById('compare-mode').value;
        const studentsFilter = document.getElementById('compare-students-filters');
        const subjectFilter = document.getElementById('compare-subject-filter');

        if (mode === 'students') {
            studentsFilter.style.display = '';
            subjectFilter.querySelector('label').textContent = '比較科目';
        } else {
            studentsFilter.style.display = 'none';
            subjectFilter.querySelector('label').textContent = '選擇學生';
            // Replace subject select with student select for subject-vs-subject mode
            const subjSel = document.getElementById('compare-subject-select');
            const students = DataManager.getAllStudents();
            subjSel.innerHTML = '';
            for (const name of students) {
                subjSel.innerHTML += `<option value="${name}">${name}</option>`;
            }
        }

        this.render();
    },

    render() {
        const mode = document.getElementById('compare-mode').value;
        const content = document.getElementById('compare-content');

        if (mode === 'students') {
            this._renderStudentComparison();
        } else {
            this._renderSubjectComparison();
        }

        content.classList.remove('hidden');
    },

    _renderStudentComparison() {
        const ctx = document.getElementById('chart-compare');
        if (this.charts.compare) this.charts.compare.destroy();

        const studentSel = document.getElementById('compare-student-select');
        const selectedStudents = [...studentSel.selectedOptions].map(o => o.value);
        const subjSel = document.getElementById('compare-subject-select');

        // For student comparison, ensure subject select shows subjects
        const subjects = DataManager.getAllSubjects();
        if (subjSel.options.length > 0 && !subjects.includes(subjSel.options[0]?.value)) {
            subjSel.innerHTML = '';
            for (const s of subjects) {
                subjSel.innerHTML += `<option value="${s}">${s}</option>`;
            }
        }

        const subjectName = subjSel.value;
        if (selectedStudents.length === 0 || !subjectName) return;

        document.getElementById('compare-chart-title').textContent =
            `${subjectName} — 學生對比`;

        // Collect all time points
        const allRecords = DataManager.records
            .filter(r => r.subjects.some(s => s.name === subjectName))
            .sort((a, b) => a.gradeNum !== b.gradeNum ? a.gradeNum - b.gradeNum : a.termCode.localeCompare(b.termCode));

        const labels = allRecords.map(r => `${r.grade} ${r.termLabel}`);
        // Deduplicate labels
        const uniqueLabels = [...new Set(labels)];

        const datasets = selectedStudents.map((name, i) => {
            const color = CHART_COLORS[i % CHART_COLORS.length];
            const studentRecords = DataManager.getStudentRecords(name)
                .filter(r => r.subjects.some(s => s.name === subjectName));

            const data = uniqueLabels.map(label => {
                const rec = studentRecords.find(r => `${r.grade} ${r.termLabel}` === label);
                if (!rec) return null;
                const subj = rec.subjects.find(s => s.name === subjectName);
                const num = DataManager.getNumericScore(rec.student.scores[subjectName]?.total);
                return num !== null && subj?.maxScore ? (num / subj.maxScore * 100) : null;
            });

            return {
                label: name,
                data,
                borderColor: color,
                backgroundColor: color + '20',
                tension: 0.3,
                borderWidth: 2.5,
                pointRadius: 5,
                pointHoverRadius: 7,
                spanGaps: true,
            };
        });

        this.charts.compare = new Chart(ctx, {
            type: 'line',
            data: { labels: uniqueLabels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#94A3B8', font: { size: 12 } } },
                    tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)}%` } }
                },
                scales: {
                    x: { ticks: { color: '#64748B', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { min: 0, max: 100, ticks: { color: '#64748B', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });
    },

    _renderSubjectComparison() {
        const ctx = document.getElementById('chart-compare');
        if (this.charts.compare) this.charts.compare.destroy();

        const studentName = document.getElementById('compare-subject-select').value;
        if (!studentName) return;

        document.getElementById('compare-chart-title').textContent =
            `${studentName} — 科目對比`;

        const records = DataManager.getStudentRecords(studentName);
        if (!records.length) return;

        const labels = records.map(r => `${r.grade} ${r.termLabel}`);

        const subjectNames = [...new Set(records.flatMap(r => r.subjects.filter(s => !s.isGrade).map(s => s.name)))];

        const datasets = subjectNames.map((sn, i) => {
            const color = CHART_COLORS[i % CHART_COLORS.length];
            const data = records.map(r => {
                const subj = r.subjects.find(s => s.name === sn);
                const num = DataManager.getNumericScore(r.student.scores[sn]?.total);
                return num !== null && subj?.maxScore ? (num / subj.maxScore * 100) : null;
            });
            return {
                label: sn,
                data,
                borderColor: color,
                backgroundColor: color + '20',
                tension: 0.3,
                borderWidth: 2.5,
                pointRadius: 4,
                spanGaps: true,
            };
        });

        this.charts.compare = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#94A3B8', font: { size: 12 } } },
                    tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)}%` } }
                },
                scales: {
                    x: { ticks: { color: '#64748B', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { min: 0, max: 100, ticks: { color: '#64748B', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });
    }
};
