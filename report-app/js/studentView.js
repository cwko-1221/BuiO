/* ========================================
   studentView.js — 個別學生分析模組
   ======================================== */

const StudentView = {
    charts: {},

    init() {
        const select = document.getElementById('student-select');
        const termSelect = document.getElementById('student-term-select');
        const vsSelect = document.getElementById('student-vs-subject-select');
        select.addEventListener('change', () => this.render());
        termSelect.addEventListener('change', () => this.render());
        if (vsSelect) {
            vsSelect.addEventListener('change', () => {
                if (this.currentRecords && this.currentName) {
                    this._renderVsClassChart(this.currentRecords, this.currentName);
                }
            });
        }
    },

    refreshSelectors() {
        const select = document.getElementById('student-select');
        const students = DataManager.getAllStudents();
        const current = select.value;
        select.innerHTML = '<option value="">-- 選擇學生 --</option>';
        for (const name of students) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        }
        if (current && students.includes(current)) select.value = current;
    },

    render() {
        const name = document.getElementById('student-select').value;
        const content = document.getElementById('student-content');
        if (!name) { content.classList.add('hidden'); return; }
        content.classList.remove('hidden');

        const records = DataManager.getStudentRecords(name);
        if (records.length === 0) { content.classList.add('hidden'); return; }

        const termFilter = document.getElementById('student-term-select').value;
        const filtered = termFilter === 'all' ? records : records.filter(r => r.termLabel === termFilter);

        this.currentRecords = filtered;
        this.currentName = name;

        // Update term selector
        this._updateTermSelector(records);

        // Render stats
        this._renderStats(filtered, name);

        // Render charts
        this._renderTrendChart(filtered, name);
        this._renderRadarChart(filtered, name);
        this._renderVsClassChart(filtered, name);

        // Render detail table
        this._renderDetailTable(filtered, name);
    },

    _updateTermSelector(records) {
        const sel = document.getElementById('student-term-select');
        const terms = [...new Set(records.map(r => r.termLabel))];
        const current = sel.value;
        sel.innerHTML = '<option value="all">全部</option>';
        for (const t of terms) {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            sel.appendChild(opt);
        }
        if (current && (current === 'all' || terms.includes(current))) sel.value = current;
    },

    _renderStats(records, name) {
        const container = document.getElementById('student-stats');
        if (!records.length) { container.innerHTML = ''; return; }

        // Collect all subject scores
        const subjectScores = {};
        for (const rec of records) {
            for (const subj of rec.subjects) {
                const score = rec.student.scores[subj.name];
                if (!score) continue;
                const num = DataManager.getNumericScore(score.total);
                if (num === null) continue;
                if (!subjectScores[subj.name]) subjectScores[subj.name] = { scores: [], max: subj.maxScore };
                subjectScores[subj.name].scores.push(num);
            }
        }

        // Calculate averages per subject (as percentage of max for fair comparison)
        let bestSubject = '', worstSubject = '', bestPct = 0, worstPct = 100;
        let totalSum = 0, totalCount = 0;

        for (const [name, data] of Object.entries(subjectScores)) {
            const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
            const pct = data.max ? (avg / data.max * 100) : avg;
            if (pct > bestPct) { bestPct = pct; bestSubject = name; }
            if (pct < worstPct) { worstPct = pct; worstSubject = name; }
            totalSum += avg;
            totalCount++;
        }

        // Trend: compare first and last valid record
        let trendText = '---';
        const validRecords = records.filter(r => r.student.hasScores);
        if (validRecords.length >= 2) {
            const first = validRecords[0];
            const last = validRecords[validRecords.length - 1];
            const commonSubjects = first.subjects.filter(s => last.subjects.some(ls => ls.name === s.name));
            let changeSum = 0, weightCount = 0;
            for (const subj of commonSubjects) {
                const w = DataManager.getSubjectWeight(subj.name);
                if (w === 0) continue;
                const s1 = DataManager.getNumericScore(first.student.scores[subj.name]?.total);
                const s2 = DataManager.getNumericScore(last.student.scores[subj.name]?.total);
                if (s1 !== null && s2 !== null && subj.maxScore) {
                    changeSum += (((s2 - s1) / subj.maxScore) * 100) * w;
                    weightCount += w;
                }
            }
            if (weightCount > 0) {
                const avgChange = changeSum / weightCount;
                const sign = avgChange > 0 ? '↑ +' : (avgChange < 0 ? '↓ ' : '');
                trendText = sign + Math.abs(avgChange).toFixed(1) + '%';
            }
        }

        container.innerHTML = `
            <div class="stat-card green">
                <div class="stat-value">${bestSubject}</div>
                <div class="stat-label">最強科目</div>
                <div class="stat-sub">平均 ${bestPct.toFixed(1)}%</div>
            </div>
            <div class="stat-card red">
                <div class="stat-value">${worstSubject}</div>
                <div class="stat-label">最弱科目</div>
                <div class="stat-sub">平均 ${worstPct.toFixed(1)}%</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${records.length}</div>
                <div class="stat-label">考績記錄數</div>
                <div class="stat-sub">${records[0].grade} ~ ${records[records.length-1].grade}</div>
            </div>
            <div class="stat-card amber">
                <div class="stat-value">${trendText}</div>
                <div class="stat-label">整體趨勢</div>
                <div class="stat-sub">首尾對比</div>
            </div>
        `;
    },

    _renderTrendChart(records, name) {
        const ctx = document.getElementById('chart-student-trend');
        if (this.charts.trend) this.charts.trend.destroy();

        // Labels: P1 Term1, P1 Term2, ...
        const labels = records.map(r => `${r.grade} ${r.termLabel}`);

        // Collect all subjects (use percentage of max for comparable display)
        const subjectNames = [...new Set(records.flatMap(r => r.subjects.map(s => s.name)))];
        // Filter out grade-based subjects
        const numericSubjects = subjectNames.filter(sn => {
            return !records.some(r => {
                const subj = r.subjects.find(s => s.name === sn);
                return subj && subj.isGrade;
            });
        });

        const datasets = numericSubjects.map((sn, i) => {
            const color = CHART_COLORS[i % CHART_COLORS.length];
            const data = records.map(r => {
                const subj = r.subjects.find(s => s.name === sn);
                const score = r.student.scores[sn];
                if (!subj || !score) return null;
                const num = DataManager.getNumericScore(score.total);
                return num !== null && subj.maxScore ? (num / subj.maxScore * 100) : null;
            });
            return {
                label: sn,
                data,
                borderColor: color,
                backgroundColor: color + '20',
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6,
                borderWidth: 2.5,
                spanGaps: true,
            };
        });

        this.charts.trend = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#94A3B8', font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)}%`
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#64748B', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { min: 0, max: 100, ticks: { color: '#64748B', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });
    },

    _renderRadarChart(records, name) {
        const ctx = document.getElementById('chart-student-radar');
        if (this.charts.radar) this.charts.radar.destroy();

        // Use the latest record that has scores for radar
        const validRecords = records.filter(r => r.student.hasScores);
        const rec = validRecords.length > 0 ? validRecords[validRecords.length - 1] : null;
        if (!rec) return;

        const numericSubjects = rec.subjects.filter(s => !s.isGrade && s.maxScore);
        const labels = numericSubjects.map(s => s.name);
        const data = numericSubjects.map(s => {
            const score = rec.student.scores[s.name];
            const num = DataManager.getNumericScore(score?.total);
            return num !== null ? (num / s.maxScore * 100) : 0;
        });

        // Class average for comparison
        const classAvgData = numericSubjects.map(s => {
            const avg = DataManager.getNumericScore(rec.classAverage[s.name]);
            return avg !== null && s.maxScore ? (avg / s.maxScore * 100) : 0;
        });

        this.charts.radar = new Chart(ctx, {
            type: 'radar',
            data: {
                labels,
                datasets: [
                    {
                        label: name,
                        data,
                        borderColor: CHART_COLORS[0],
                        backgroundColor: CHART_COLORS[0] + '30',
                        borderWidth: 2,
                        pointBackgroundColor: CHART_COLORS[0],
                    },
                    {
                        label: '全班平均',
                        data: classAvgData,
                        borderColor: '#64748B',
                        backgroundColor: 'rgba(100,116,139,0.1)',
                        borderWidth: 1.5,
                        borderDash: [4, 4],
                        pointBackgroundColor: '#64748B',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#94A3B8', font: { size: 11 } } } },
                scales: {
                    r: {
                        min: 0, max: 100,
                        ticks: { color: '#64748B', backdropColor: 'transparent', font: { size: 9 } },
                        grid: { color: 'rgba(255,255,255,0.08)' },
                        pointLabels: { color: '#94A3B8', font: { size: 11 } },
                        angleLines: { color: 'rgba(255,255,255,0.08)' }
                    }
                }
            }
        });
    },

    _renderVsClassChart(records, name) {
        const ctx = document.getElementById('chart-student-vs-class');
        if (this.charts.vsClass) this.charts.vsClass.destroy();

        if (!records || records.length === 0) return;

        // Get all available subjects for these records
        const allSubjects = [...new Set(records.flatMap(r => r.subjects.map(s => s.name)))];
        const select = document.getElementById('student-vs-subject-select');

        // Pick a main subject to compare
        let sn = select.value;
        if (!sn || !allSubjects.includes(sn)) {
            sn = allSubjects.includes('中文') ? '中文' : allSubjects[0];
        }

        // Update dropdown options
        if (select) {
            select.innerHTML = allSubjects.map(s => `<option value="${s}" ${s === sn ? 'selected' : ''}>${s}</option>`).join('');
        }

        if (!sn) return;

        const labels = records.map(r => `${r.grade} ${r.termLabel}`);
        const studentData = records.map(r => {
            const score = r.student.scores[sn];
            const num = DataManager.getNumericScore(score?.total);
            const subj = r.subjects.find(s => s.name === sn);
            return num !== null && subj?.maxScore ? (num / subj.maxScore * 100) : null;
        });
        const classAvgData = records.map(r => {
            const avg = DataManager.getNumericScore(r.classAverage[sn]);
            const subj = r.subjects.find(s => s.name === sn);
            return avg !== null && subj?.maxScore ? (avg / subj.maxScore * 100) : null;
        });

        this.charts.vsClass = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: `${name} (${sn})`,
                        data: studentData,
                        borderColor: CHART_COLORS[0],
                        backgroundColor: CHART_COLORS[0] + '20',
                        tension: 0.3,
                        borderWidth: 2.5,
                        pointRadius: 4,
                        fill: false,
                        spanGaps: true,
                    },
                    {
                        label: `全班平均 (${sn})`,
                        data: classAvgData,
                        borderColor: '#64748B',
                        backgroundColor: 'rgba(100,116,139,0.1)',
                        tension: 0.3,
                        borderWidth: 2,
                        borderDash: [6, 3],
                        pointRadius: 3,
                        fill: true,
                        spanGaps: true,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#94A3B8', font: { size: 11 } } } },
                scales: {
                    x: { ticks: { color: '#64748B', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { min: 0, max: 100, ticks: { color: '#64748B', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });
    },

    _renderDetailTable(records, name) {
        const table = document.getElementById('student-detail-table');
        if (!records.length) { table.innerHTML = ''; return; }

        // Build a comprehensive table: rows = subjects, columns = grade+term
        const allSubjects = [...new Set(records.flatMap(r => r.subjects.map(s => s.name)))];

        let html = '<thead><tr><th>科目</th>';
        for (const rec of records) {
            html += `<th>${rec.grade} ${rec.termLabel}</th>`;
        }
        html += '</tr></thead><tbody>';

        for (const sn of allSubjects) {
            html += `<tr><td class="highlight">${sn}</td>`;
            for (const rec of records) {
                const score = rec.student.scores[sn];
                const val = score ? DataManager.formatScore(score.total) : '---';
                const subj = rec.subjects.find(s => s.name === sn);
                const max = subj?.maxScore;
                const display = max ? `${val} / ${max}` : val;
                html += `<td class="num">${display}</td>`;
            }
            html += '</tr>';
        }

        html += '</tbody>';
        table.innerHTML = html;
    }
};
