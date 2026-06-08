/* ========================================
   classView.js — 全班分析模組
   ======================================== */

const ClassView = {
    charts: {},

    init() {
        const gradeSelect = document.getElementById('class-grade-select');
        const yearSelect = document.getElementById('class-year-select');
        const termSelect = document.getElementById('class-term-select');
        const distSelect = document.getElementById('class-dist-subject-select');
        gradeSelect.addEventListener('change', () => { this._updateYears(); this.render(); });
        yearSelect.addEventListener('change', () => { this._updateTerms(); this.render(); });
        termSelect.addEventListener('change', () => this.render());
        if (distSelect) {
            distSelect.addEventListener('change', () => {
                if (this.currentRecord) this._renderDistChart(this.currentRecord);
            });
        }
    },

    refreshSelectors() {
        const sel = document.getElementById('class-grade-select');
        const grades = DataManager.getGrades();
        const current = sel.value;
        sel.innerHTML = '<option value="">-- 選擇年級 --</option>';
        for (const g of grades) {
            sel.innerHTML += `<option value="${g}">${g}</option>`;
        }
        if (current && grades.includes(current)) sel.value = current;
        this._updateYears();
    },

    _updateYears() {
        const grade = document.getElementById('class-grade-select').value;
        const sel = document.getElementById('class-year-select');
        const years = DataManager.getSchoolYears(grade);
        sel.innerHTML = '<option value="">-- 學年 --</option>';
        for (const y of years) sel.innerHTML += `<option value="${y}">${y}</option>`;
        if (years.length === 1) sel.value = years[0];
        this._updateTerms();
    },

    _updateTerms() {
        const grade = document.getElementById('class-grade-select').value;
        const year = document.getElementById('class-year-select').value;
        const sel = document.getElementById('class-term-select');
        const terms = DataManager.getTerms(grade, year);
        sel.innerHTML = '<option value="">-- 考績期 --</option>';
        for (const t of terms) sel.innerHTML += `<option value="${t}">${t}</option>`;
        if (terms.length === 1) sel.value = terms[0];
    },

    render() {
        const grade = document.getElementById('class-grade-select').value;
        const year = document.getElementById('class-year-select').value;
        const term = document.getElementById('class-term-select').value;
        const content = document.getElementById('class-content');

        if (!grade || !year || !term) { content.classList.add('hidden'); return; }

        const rec = DataManager.getRecord(grade, year, term);
        if (!rec) { content.classList.add('hidden'); return; }
        content.classList.remove('hidden');

        this.currentRecord = rec;

        this._renderStats(rec);
        this._renderAvgChart(rec);
        this._renderDistChart(rec);
        this._renderPassChart(rec);
        this._renderRankingTable(rec);
    },

    _renderStats(rec) {
        const container = document.getElementById('class-stats');
        const numSubjects = rec.subjects.filter(s => !s.isGrade);

        // Overall class average (as weighted percentage)
        let totalWeightedPct = 0, totalWeight = 0;
        for (const student of rec.students) {
            let sSum = 0, sWeight = 0;
            for (const subj of numSubjects) {
                const w = DataManager.getSubjectWeight(subj.name);
                if (w === 0) continue;
                const num = DataManager.getNumericScore(student.scores[subj.name]?.total);
                if (num !== null && subj.maxScore) {
                    sSum += (num / subj.maxScore) * 100 * w;
                    sWeight += w;
                }
            }
            if (sWeight > 0) {
                totalWeightedPct += (sSum / sWeight);
                totalWeight++;
            }
        }
        const overallPct = totalWeight > 0 ? (totalWeightedPct / totalWeight).toFixed(1) : '---';

        // Best student (overall average highest)
        let topStudent = '', topScore = 0;
        for (const student of rec.students) {
            let sum = 0, cWeight = 0;
            for (const subj of numSubjects) {
                const w = DataManager.getSubjectWeight(subj.name);
                if (w === 0) continue;
                const num = DataManager.getNumericScore(student.scores[subj.name]?.total);
                if (num !== null && subj.maxScore) { sum += (num / subj.maxScore * 100) * w; cWeight += w; }
            }
            const avg = cWeight > 0 ? sum / cWeight : 0;
            if (avg > topScore) { topScore = avg; topStudent = student.name; }
        }

        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${rec.students.length}</div>
                <div class="stat-label">學生人數</div>
                <div class="stat-sub">${rec.grade} ${rec.className}</div>
            </div>
            <div class="stat-card green">
                <div class="stat-value">${overallPct}%</div>
                <div class="stat-label">全班平均（百分比）</div>
            </div>
            <div class="stat-card amber">
                <div class="stat-value">${topStudent}</div>
                <div class="stat-label">最高分學生</div>
                <div class="stat-sub">平均 ${topScore.toFixed(1)}%</div>
            </div>
            <div class="stat-card violet">
                <div class="stat-value">${numSubjects.length}</div>
                <div class="stat-label">主科數目</div>
            </div>
        `;
    },

    _renderAvgChart(rec) {
        const ctx = document.getElementById('chart-class-avg');
        if (this.charts.avg) this.charts.avg.destroy();

        const numSubjects = rec.subjects.filter(s => !s.isGrade);
        const labels = numSubjects.map(s => s.name);
        const avgData = numSubjects.map(s => {
            const avg = DataManager.getNumericScore(rec.classAverage[s.name]);
            return avg !== null && s.maxScore ? (avg / s.maxScore * 100) : 0;
        });
        const maxData = numSubjects.map(s => {
            const max = DataManager.getNumericScore(rec.classMax[s.name]);
            return max !== null && s.maxScore ? (max / s.maxScore * 100) : 0;
        });
        const minData = numSubjects.map(s => {
            const min = DataManager.getNumericScore(rec.classMin[s.name]);
            return min !== null && s.maxScore ? (min / s.maxScore * 100) : 0;
        });

        this.charts.avg = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: '最高分', data: maxData, backgroundColor: CHART_COLORS[4] + '60', borderColor: CHART_COLORS[4], borderWidth: 1 },
                    { label: '平均分', data: avgData, backgroundColor: CHART_COLORS[0] + '80', borderColor: CHART_COLORS[0], borderWidth: 1 },
                    { label: '最低分', data: minData, backgroundColor: CHART_COLORS[3] + '60', borderColor: CHART_COLORS[3], borderWidth: 1 },
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#94A3B8', font: { size: 11 } } },
                    datalabels: {
                        display: true,
                        color: '#F8FAFC',
                        font: { weight: 'bold', size: 13 },
                        formatter: val => val > 0 ? val.toFixed(1) + '%' : '',
                        anchor: 'end',
                        align: 'start',
                        offset: 4
                    }
                },
                scales: {
                    x: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { min: 0, max: 100, ticks: { color: '#64748B', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });
    },

    _renderDistChart(rec) {
        const ctx = document.getElementById('chart-class-dist');
        if (this.charts.dist) this.charts.dist.destroy();

        // Get all numeric subjects
        const numSubjects = rec.subjects.filter(s => !s.isGrade && s.maxScore);
        if (numSubjects.length === 0) return;

        const select = document.getElementById('class-dist-subject-select');
        let subjName = select ? select.value : '';

        // If current selection is invalid or empty, default to 中文 or first available
        if (!subjName || !numSubjects.find(s => s.name === subjName)) {
            subjName = numSubjects.find(s => s.name === '中文')?.name || numSubjects[0].name;
        }

        // Update dropdown HTML
        if (select) {
            select.innerHTML = numSubjects.map(s => 
                `<option value="${s.name}" ${s.name === subjName ? 'selected' : ''}>${s.name}</option>`
            ).join('');
        }

        const subj = numSubjects.find(s => s.name === subjName);
        if (!subj) return;

        const brackets = [
            { label: '90-100%', min: 90, max: 101, color: CHART_COLORS[4] },
            { label: '80-89%', min: 80, max: 90, color: CHART_COLORS[0] },
            { label: '70-79%', min: 70, max: 80, color: CHART_COLORS[1] },
            { label: '60-69%', min: 60, max: 70, color: CHART_COLORS[2] },
            { label: '50-59%', min: 50, max: 60, color: CHART_COLORS[7] },
            { label: '<50%', min: 0, max: 50, color: CHART_COLORS[3] },
        ];

        const counts = brackets.map(() => 0);
        for (const student of rec.students) {
            const score = student.scores[subj.name];
            const num = DataManager.getNumericScore(score?.total);
            if (num === null || !subj.maxScore) continue;
            const pct = (num / subj.maxScore) * 100;
            for (let i = 0; i < brackets.length; i++) {
                if (pct >= brackets[i].min && pct < brackets[i].max) { counts[i]++; break; }
            }
        }

        this.charts.dist = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: brackets.map(b => b.label),
                datasets: [{
                    data: counts,
                    backgroundColor: brackets.map(b => b.color + 'CC'),
                    borderColor: brackets.map(b => b.color),
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: '#94A3B8', font: { size: 11 }, padding: 12 } },
                    title: { display: true, text: `${subj.name} 分數分佈`, color: '#94A3B8', font: { size: 13 } },
                    datalabels: {
                        display: true,
                        color: '#F8FAFC',
                        font: { weight: 'bold', size: 14 },
                        formatter: (val, ctx) => val > 0 ? val : ''
                    }
                },
                cutout: '55%',
            }
        });
    },

    _renderPassChart(rec) {
        const ctx = document.getElementById('chart-class-pass');
        if (this.charts.pass) this.charts.pass.destroy();

        const numSubjects = rec.subjects.filter(s => !s.isGrade && s.maxScore);
        const labels = numSubjects.map(s => s.name);
        const passRates = numSubjects.map(subj => {
            let pass = 0, total = 0;
            for (const student of rec.students) {
                const num = DataManager.getNumericScore(student.scores[subj.name]?.total);
                if (num === null) continue;
                total++;
                if (subj.maxScore && (num / subj.maxScore) >= 0.6) pass++;
            }
            return total > 0 ? (pass / total * 100) : 0;
        });

        this.charts.pass = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: '及格率 (≥60%)',
                    data: passRates,
                    backgroundColor: passRates.map(r => r >= 80 ? CHART_COLORS[4] + 'AA' : r >= 60 ? CHART_COLORS[2] + 'AA' : CHART_COLORS[3] + 'AA'),
                    borderColor: passRates.map(r => r >= 80 ? CHART_COLORS[4] : r >= 60 ? CHART_COLORS[2] : CHART_COLORS[3]),
                    borderWidth: 1,
                    borderRadius: 6,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => `${ctx.parsed.x.toFixed(1)}%` } },
                    datalabels: {
                        display: true,
                        color: '#F8FAFC',
                        font: { weight: 'bold', size: 13 },
                        formatter: val => val > 0 ? val.toFixed(1) + '%' : '',
                        anchor: 'end',
                        align: 'start',
                        offset: 4
                    }
                },
                scales: {
                    x: { min: 0, max: 100, ticks: { color: '#64748B', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { ticks: { color: '#94A3B8' }, grid: { display: false } }
                }
            }
        });
    },

    _renderRankingTable(rec) {
        const table = document.getElementById('class-ranking-table');
        const numSubjects = rec.subjects.filter(s => !s.isGrade);

        // Calculate each student's overall weighted percentage
        const rankings = rec.students
            .filter(s => s.hasScores)
            .map(student => {
                let sum = 0, totalWeight = 0;
                const subjScores = {};
                for (const subj of numSubjects) {
                    const num = DataManager.getNumericScore(student.scores[subj.name]?.total);
                    if (num !== null && subj.maxScore) {
                        const pct = (num / subj.maxScore) * 100;
                        subjScores[subj.name] = pct;
                        
                        const w = DataManager.getSubjectWeight(subj.name);
                        if (w > 0) {
                            sum += pct * w;
                            totalWeight += w;
                        }
                    }
                }
                return {
                    classNo: student.classNo,
                    name: student.name,
                    overall: totalWeight > 0 ? sum / totalWeight : 0,
                    subjScores
                };
            })
            .sort((a, b) => b.overall - a.overall);

        let html = '<thead><tr><th>排名</th><th>班號</th><th>姓名</th>';
        for (const subj of numSubjects) html += `<th>${subj.name}</th>`;
        html += '<th>總平均</th></tr></thead><tbody>';

        rankings.forEach((r, i) => {
            html += `<tr><td>${i + 1}</td><td>${r.classNo}</td><td>${r.name}</td>`;
            for (const subj of numSubjects) {
                const v = r.subjScores[subj.name];
                const cls = v >= 80 ? 'high' : v < 60 ? 'low' : '';
                html += `<td class="num ${cls}">${v !== undefined ? v.toFixed(1) + '%' : '---'}</td>`;
            }
            html += `<td class="num highlight">${r.overall.toFixed(1)}%</td></tr>`;
        });

        html += '</tbody>';
        table.innerHTML = html;
    }
};
