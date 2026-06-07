/**
 * Login Page Logic
 * 處理學生登入表單提交
 */

(function() {
    'use strict';

    const form = document.getElementById('login-form');
    const studentIdInput = document.getElementById('student-id');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('login-btn');
    const errorDiv = document.getElementById('login-error');

    // 檢查是否已登入
    checkAuth();

    async function checkAuth() {
        try {
            const res = await fetch('/api/auth/me', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                if (data.student.role === 'teacher') {
                    window.location.href = '/dashboard.html';
                } else {
                    window.location.href = '/quiz.html';
                }
            }
        } catch (e) {
            // 未登入，留在登入頁
        }
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const studentId = studentIdInput.value.trim();
        const password = passwordInput.value;

        if (!studentId || !password) {
            showError('請輸入學號和密碼');
            return;
        }

        // 顯示載入狀態
        loginBtn.disabled = true;
        loginBtn.textContent = '⏳ 登入中...';
        hideError();

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ studentId, password })
            });

            const data = await res.json();

            if (data.success) {
                // 登入成功，跳轉
                loginBtn.textContent = '✅ 登入成功！';
                loginBtn.style.background = 'var(--gradient-success)';
                
                setTimeout(() => {
                    if (data.student.role === 'teacher') {
                        window.location.href = '/dashboard.html';
                    } else {
                        window.location.href = '/quiz.html';
                    }
                }, 500);
            } else {
                showError(data.message || '登入失敗');
                loginBtn.disabled = false;
                loginBtn.textContent = '🚀 開始學習';
            }
        } catch (error) {
            showError('連線失敗，請稍後再試');
            loginBtn.disabled = false;
            loginBtn.textContent = '🚀 開始學習';
        }
    });

    function showError(msg) {
        errorDiv.textContent = msg;
        errorDiv.style.display = 'block';
    }

    function hideError() {
        errorDiv.style.display = 'none';
    }

    // Enter key 支援
    passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            form.dispatchEvent(new Event('submit'));
        }
    });

    // 自動聚焦學號欄位
    studentIdInput.focus();
})();
