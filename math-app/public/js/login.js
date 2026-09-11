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
            showError(BuiI18n.t('m.loginNeedBoth'));
            return;
        }

        // 顯示載入狀態
        loginBtn.disabled = true;
        loginBtn.textContent = BuiI18n.t('m.loggingIn');
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
                loginBtn.textContent = BuiI18n.t('m.loginOk');
                loginBtn.style.background = 'var(--gradient-success)';
                
                setTimeout(() => {
                    if (data.student.role === 'teacher') {
                        window.location.href = '/dashboard.html';
                    } else {
                        window.location.href = '/quiz.html';
                    }
                }, 500);
            } else {
                showError(data.message || BuiI18n.t('m.loginFailed'));
                loginBtn.disabled = false;
                loginBtn.textContent = BuiI18n.t('m.startLearning');
            }
        } catch (error) {
            showError(BuiI18n.t('m.connectFailed'));
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
