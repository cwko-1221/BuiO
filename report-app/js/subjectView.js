/* ========================================
   subjectView.js — 按科目分析模組
   ======================================== */

const SubjectView = {
    charts: {},

    init() {
        document.getElementById('subject-select').addEventListener('change', () => this.render());
        document.getElementById('subject-grade-select').addEventListener('change', () => { this._updateYears(); this.render(); });
        document.getElementById('subject-year-select').addEventListener('change', () => this.render());
    },

    refreshSelectors() {
        const sel = document.getElementById('subject-select');
        const subjects = DataManager.getAllSubjects();
        const current = sel.value;
        sel.innerHTML = '<option value="">-- 選擇科目 --</option>';
        for (const s of subjects) sel.innerHTML += `<option value="${s}">${s}</option>`;
        if (current && subjects.includes(current)) sel.value = current;

        const gradeSel = document.getElementById('subject-grade-select');
        const grades = DataManager.getGrades();
        gradeSel.innerHTML = '<option value="">全部年級</option>';
        for (const g of grades) gradeSel.innerHTML += `<option value="${g}">${g}</option>`;

        this._updateYears();
    },

    _updateYears() {
        const grade = document.getElementById('subject-grade-select').value;
        const sel = document.getElementById('subject-year-select');
        const years = DataManager.getSchoolYears(grade);
        const currentYear = sel.value;

        sel.innerHTML = '';
        if (grade) {
            // Allow selecting all years ONLY if a specific grade is selected
            sel.innerHTML += '<option value="">全部學年</option>';
        }
        
        for (const y of years) sel.innerHTML += `<option value="${y}">${y}</option>`;

        // Restore previous selection if valid
        if (currentYear && years.includes(currentYear)) {
            sel.value = currentYear;
        } else {
            // Default: if class is specific, default to all years; else default to the latest year available
            if (grade) sel.value = '';
            else if (years.length > 0) sel.value = years[years.length - 1];
        }
    },

    render() {
        const subjectName = document.getElementById('subject-select').value;
        const content = document.getElementById('subject-content');
        if (!subjectName) { content.classList.add('hidden'); return; }
        content.classList.remove('hidden');

        const grade = document.getElementById('subject-grade-select').value;
        const year = document.getElementById('subject-year-select').value;

        const records = DataManager.getRecords({ grade: grade || undefined, schoolYear: year || undefined })
            .filter(r => r.subjects.some(s => s.name === subjectName));

        if (!records.length) { content.classList.add('hidden'); return; }

        records.sort((a, b) => {
            if (a.gradeNum !== b.gradeNum) return a.gradeNum - b.gradeNum;
            return a.termCode.localeCompare(b.termCode);
        });

        this._renderStats(records, subjectName);
        this._renderDistChart(records, subjectName);
        this._renderAvgTrendChart(records, subjectName);
    },

    _renderStats(records, subjectName) {
        const container = document.getElementById('subject-stats');

        let allScores = [];
        let maxScore = null;
        for (const rec of records) {
            const subj = rec.subjects.find(s => s.name === subjectName);
            if (subj) maxScore = subj.maxScore;
            for (const student of rec.students) {
                const num = DataManager.getNumericScore(student.scores[subjectName]?.total);
                if (num !== null) allScores.push(num);
            }
        }

        const avg = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;
        const max = allScores.length > 0 ? Math.max(...allScores) : 0;
        const min = allScores.length > 0 ? Math.min(...allScores) : 0;
        const stdDev = allScores.length > 0 ? Math.sqrt(allScores.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / allScores.length) : 0;

        const avgPct = maxScore ? (avg / maxScore * 100).toFixed(1) + '%' : avg.toFixed(1);
        const maxPct = maxScore ? (max / maxScore * 100).toFixed(1) + '%' : max.toFixed(1);
        const minPct = maxScore ? (min / maxScore * 100).toFixed(1) + '%' : min.toFixed(1);

        container.innerHTML = `
            <div class="stat-card green">
                <div class="stat-value">${maxPct}</div>
                <div class="stat-label">最高分</div>
                <div class="stat-sub">${max.toFixed(1)} / ${maxScore || '---'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${avgPct}</div>
                <div class="stat-label">平均分</div>
                <div class="stat-sub">${avg.toFixed(1)} / ${maxScore || '---'}</div>
            </div>
            <div class="stat-card red">
                <div class="stat-value">${minPct}</div>
                <div class="stat-label">最低分</div>
                <div class="stat-sub">${min.toFixed(1)} / ${maxScore || '---'}</div>
            </div>
            <div class="stat-card amber">
                <div class="stat-value">${stdDev.toFixed(1)}</div>
                <div class="stat-label">標準差</div>
                <div class="stat-sub">共 ${allScores.length} 筆記錄</div>
            </div>
        `;
    },

    _renderAllStudentsChart(records, subjectName) {
        const ctx = document.getElementById('chart-subject-all');
        if (this.charts.all) this.charts.all.destroy();

        const labels = records.map(r => `${r.grade} ${r.termLabel}`);

        // Collect unique students across these records
        const studentNames = new Set();
        for (const rec of records) {
            for (const s of rec.students) {
                if (s.hasScores && s.scores[subjectName]) studentNames.add(s.name);
            }
        }

        const datasets = [];
        let i = 0;
        for (const name of studentNames) {
            const color = CHART_COLORS[i % CHART_COLORS.length];
            const data = records.map(rec => {
                const student = rec.students.find(s => s.name === name);
                if (!student) return null;
                const num = DataManager.getNumericScore(student.scores[subjectName]?.total);
                const subj = rec.subjects.find(s => s.name === subjectName);
                return num !== null && subj?.maxScore ? (num / subj.maxScore * 100) : null;
            });

            datasets.push({
                label: name,
                data,
                borderColor: color + '90',
                backgroundColor: 'transparent',
                tension: 0.3,
                borderWidth: 1.5,
                pointRadius: 2,
                pointHoverRadius: 5,
                spanGaps: true,
            });
            i++;
        }

        this.charts.all = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: datasets.length <= 15,
                        labels: { color: '#94A3B8', font: { size: 10 }, boxWidth: 12 }
                    }
                },
                interaction: { mode: 'nearest', intersect: false },
                scales: {
                    x: { ticks: { color: '#64748B', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { min: 0, max: 100, ticks: { color: '#64748B', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });
    },

    _renderDistChart(records, subjectName) {
        const ctx = document.getElementById('chart-subject-dist');
        if (this.charts.dist) this.charts.dist.destroy();

        const gradeVal = document.getElementById('subject-grade-select').value;
        const isAllGrades = !gradeVal;

        const brackets = ['90-100%', '80-89%', '70-79%', '60-69%', '50-59%', '<50%'];
        const bracketRanges = [[90, 101], [80, 90], [70, 80], [60, 70], [50, 60], [0, 50]];
        const colors = [CHART_COLORS[4], CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[2], CHART_COLORS[7], CHART_COLORS[3]];

        const labels = records.map(r => `${r.grade} ${r.termLabel}`);
        const datasets = brackets.map((bracket, bi) => ({
            label: bracket,
            data: records.map(rec => {
                const subj = rec.subjects.find(s => s.name === subjectName);
                let count = 0;
                for (const student of rec.students) {
                    const num = DataManager.getNumericScore(student.scores[subjectName]?.total);
                    if (num === null || !subj?.maxScore) continue;
                    const pct = (num / subj.maxScore) * 100;
                    if (pct >= bracketRanges[bi][0] && pct < bracketRanges[bi][1]) count++;
                }
                return count;
            }),
            backgroundColor: colors[bi] + 'CC',
            borderColor: colors[bi],
            borderWidth: 1,
        }));

        this.charts.dist = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#94A3B8', font: { size: 10 } } },
                    datalabels: {
                        display: true,
                        color: '#F8FAFC',
                        font: { weight: 'bold', size: 13 },
                        formatter: val => val > 0 ? val : ''
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        ticks: { color: '#64748B', font: { size: 10 }, maxRotation: isAllGrades ? 90 : undefined, minRotation: isAllGrades ? 90 : undefined },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: { stacked: true, ticks: { color: '#64748B' }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: '人數', color: '#64748B' } }
                }
            }
        });
    },

    _renderAvgTrendChart(records, subjectName) {
        const ctx = document.getElementById('chart-subject-avg');
        if (this.charts.avgTrend) this.charts.avgTrend.destroy();

        const gradeVal = document.getElementById('subject-grade-select').value;
        const isAllGrades = !gradeVal;

        const labels = records.map(r => `${r.grade} ${r.termLabel}`);
        const avgData = records.map(rec => {
            const subj = rec.subjects.find(s => s.name === subjectName);
            const avg = DataManager.getNumericScore(rec.classAverage[subjectName]);
            return avg !== null && subj?.maxScore ? (avg / subj.maxScore * 100) : null;
        });
        const maxData = records.map(rec => {
            const subj = rec.subjects.find(s => s.name === subjectName);
            const max = DataManager.getNumericScore(rec.classMax[subjectName]);
            return max !== null && subj?.maxScore ? (max / subj.maxScore * 100) : null;
        });
        const minData = records.map(rec => {
            const subj = rec.subjects.find(s => s.name === subjectName);
            const min = DataManager.getNumericScore(rec.classMin[subjectName]);
            return min !== null && subj?.maxScore ? (min / subj.maxScore * 100) : null;
        });

        this.charts.avgTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: '最高分',
                        data: maxData,
                        borderColor: CHART_COLORS[4],
                        backgroundColor: CHART_COLORS[4] + '15',
                        borderWidth: 1.5,
                        borderDash: [4, 4],
                        pointRadius: 3,
                        tension: 0.3,
                        fill: false,
                        spanGaps: true,
                    },
                    {
                        label: '平均分',
                        data: avgData,
                        borderColor: CHART_COLORS[0],
                        backgroundColor: CHART_COLORS[0] + '20',
                        borderWidth: 2.5,
                        pointRadius: 4,
                        tension: 0.3,
                        fill: true,
                        spanGaps: true,
                    },
                    {
                        label: '最低分',
                        data: minData,
                        borderColor: CHART_COLORS[3],
                        backgroundColor: CHART_COLORS[3] + '15',
                        borderWidth: 1.5,
                        borderDash: [4, 4],
                        pointRadius: 3,
                        tension: 0.3,
                        fill: false,
                        spanGaps: true,
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#94A3B8', font: { size: 11 } } } },
                scales: {
                    x: {
                        ticks: { color: '#64748B', font: { size: 10 }, maxRotation: isAllGrades ? 90 : undefined, minRotation: isAllGrades ? 90 : undefined },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: { min: 0, max: 100, ticks: { color: '#64748B', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });
    }
};
