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
    let radarChartObj = null;
    let timeChartObj = null;

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
            
            // 權限檢查：只有老師可以看 dashboard
            if (data.student.role !== 'teacher') {
                window.location.href = '/quiz.html';
                return;
            }

            document.getElementById('student-name').textContent = data.student.name;
            document.getElementById('student-avatar').textContent = data.student.name[0];
            
            // 載入學生清單
            await loadStudentList();

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
                const deleteBtn = document.getElementById('btn-delete-student');
                if (e.target.value) {
                    currentStudentId = e.target.value;
                    if (deleteBtn) deleteBtn.style.display = 'inline-flex';
                    document.getElementById('dashboard-content').style.display = 'block';
                    await reloadAllStats();
                } else {
                    currentStudentId = '';
                    if (deleteBtn) deleteBtn.style.display = 'none';
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
            const res = await fetch(`/api/stats/tags?studentId=${currentStudentId}`, { credentials: 'include' });
            const data = await res.json();
            if (!data.success) return;

            renderRadarChart(data.stats);
            renderTagBars(data.stats);
        } catch (e) {
            console.error('載入標籤統計失敗:', e);
        }
    }

    function renderRadarChart(stats) {
        const ctx = document.getElementById('radar-chart');
        if (!ctx) return;

        const labels = stats.map(s => s.tagName.replace(/\(.*\)/, '').trim());
        const values = stats.map(s => s.accuracyRate);

        if (radarChartObj) {
            radarChartObj.destroy();
        }

        radarChartObj = new Chart(ctx, {
            type: 'radar',
            data: {
                labels,
                datasets: [{
                    label: '正確率 (%)',
                    data: values,
                    backgroundColor: 'rgba(139, 92, 246, 0.15)',
                    borderColor: 'rgba(139, 92, 246, 0.8)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgba(139, 92, 246, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
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
                            label: (ctx) => `正確率: ${ctx.raw}%`
                        }
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            stepSize: 20,
                            color: '#64748b',
                            backdropColor: 'transparent',
                            font: { size: 10 }
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.06)',
                        },
                        angleLines: {
                            color: 'rgba(255, 255, 255, 0.06)',
                        },
                        pointLabels: {
                            color: '#94a3b8',
                            font: { size: 11, weight: 500 }
                        }
                    }
                }
            }
        });
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

        // 重新建立 canvas 確保不會因為之前的空狀態而消失
        container.innerHTML = '<canvas id="time-chart"></canvas>';
        const ctx = document.getElementById('time-chart');

        const labels = timeData.map(t => t.tagName.replace(/\(.*\)/, '').trim());
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
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
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
                scales: {
                    x: {
                        beginAtZero: true,
                        title: { display: true, text: '秒', color: '#64748b' },
                        ticks: { color: '#64748b' },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    },
                    y: {
                        ticks: { color: '#94a3b8', font: { size: 11 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // ========================================
    // Add Student Modal Logic
    // ========================================
    const modal = document.getElementById('add-student-modal');
    const btnAddStudent = document.getElementById('btn-add-student');
    const btnCancelAdd = document.getElementById('btn-cancel-add');
    const addStudentForm = document.getElementById('add-student-form');
    const errorDiv = document.getElementById('add-student-error');

    if (btnAddStudent && modal) {
        btnAddStudent.addEventListener('click', () => {
            addStudentForm.reset();
            errorDiv.style.display = 'none';
            modal.classList.add('active');
        });

        btnCancelAdd.addEventListener('click', () => {
            modal.classList.remove('active');
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });

        addStudentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('btn-submit-add');
            submitBtn.disabled = true;
            submitBtn.textContent = '新增中...';
            errorDiv.style.display = 'none';

            const payload = {
                studentId: document.getElementById('new-student-id').value.trim(),
                name: document.getElementById('new-student-name').value.trim(),
                password: document.getElementById('new-student-password').value
            };

            try {
                const res = await fetch('/api/auth/register-student', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(payload)
                });
                
                const data = await res.json();
                
                if (data.success) {
                    modal.classList.remove('active');
                    alert('🎉 學生新增成功！');
                    
                    document.getElementById('student-selector').innerHTML = '<option value="">請選擇學生...</option>';
                    await loadStudentList();
                    
                    const selector = document.getElementById('student-selector');
                    selector.value = payload.studentId;
                    currentStudentId = payload.studentId;
                    await reloadAllStats();
                } else {
                    errorDiv.textContent = data.message || '新增失敗';
                    errorDiv.style.display = 'block';
                }
            } catch (err) {
                errorDiv.textContent = '網路連線錯誤，請重試。';
                errorDiv.style.display = 'block';
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = '確認新增';
            }
        });
    }

    // ========================================
    // Delete Student Logic
    // ========================================
    const btnDeleteStudent = document.getElementById('btn-delete-student');
    if (btnDeleteStudent) {
        btnDeleteStudent.addEventListener('click', async () => {
            if (!currentStudentId) return;
            
            // 彈出確認視窗
            const confirmed = confirm(`⚠️ 警告：確定要刪除學生 ${currentStudentId} 嗎？\n\n這將會【永久刪除】該學生的所有作答紀錄與統計報表，動作無法復原！`);
            if (!confirmed) return;

            // 執行刪除
            btnDeleteStudent.disabled = true;
            btnDeleteStudent.textContent = '刪除中...';

            try {
                const res = await fetch(`/api/auth/delete-student/${currentStudentId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                
                const data = await res.json();
                
                if (data.success) {
                    alert('✅ 學生已成功刪除');
                    currentStudentId = '';
                    btnDeleteStudent.style.display = 'none';
                    
                    // 重新載入列表並重置下拉選單
                    document.getElementById('student-selector').innerHTML = '<option value="">請選擇學生...</option>';
                    await loadStudentList();
                    
                    // 清空儀表板資料畫面 (可簡單隱藏)
                    document.getElementById('dashboard-content').style.display = 'none';
                } else {
                    alert('刪除失敗: ' + (data.message || '未知錯誤'));
                }
            } catch (err) {
                alert('網路連線錯誤，無法刪除學生');
            } finally {
                btnDeleteStudent.disabled = false;
                btnDeleteStudent.textContent = '🗑️ 刪除學生';
            }
        });
    }

    // ========================================
    // Logout
    // ========================================
    document.getElementById('logout-btn').addEventListener('click', async () => {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });
        } catch (e) {}
        window.location.href = '/';
    });
})();
