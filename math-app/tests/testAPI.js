/**
 * Phase 3 驗證腳本 - 後端 API 測試
 * 
 * 使用 Node.js 內建的 http 模組測試所有 API 端點
 * 測試流程: 登入 → 取題 → 作答 → 查統計 → 弱點 → 登出
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
let sessionCookie = '';
let passed = 0;
let failed = 0;

function test(description, fn) {
    return fn().then(() => {
        console.log(`  ✅ ${description}`);
        passed++;
    }).catch(error => {
        console.log(`  ❌ ${description}`);
        console.log(`     → ${error.message}`);
        failed++;
    });
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

/**
 * HTTP 請求工具
 */
function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        // 帶上 session cookie
        if (sessionCookie) {
            options.headers['Cookie'] = sessionCookie;
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                // 儲存 session cookie
                const setCookie = res.headers['set-cookie'];
                if (setCookie) {
                    sessionCookie = setCookie[0].split(';')[0];
                }

                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, body: json });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTests() {
    console.log('');
    console.log('🧪 ========================================');
    console.log('🧪  Phase 3: 後端 API 驗證測試');
    console.log('🧪 ========================================');

    // ========================================
    // 1. 認證 API 測試
    // ========================================
    console.log('');
    console.log('📋 測試 1: 認證 API (/api/auth)');

    await test('未登入時取得 /me 應回 401', async () => {
        const res = await request('GET', '/api/auth/me');
        assert(res.status === 401, `預期 401, 得到 ${res.status}`);
    });

    await test('缺少密碼應回 400', async () => {
        const res = await request('POST', '/api/auth/login', { studentId: 'S001' });
        assert(res.status === 400, `預期 400, 得到 ${res.status}`);
    });

    await test('錯誤學號應回 401', async () => {
        const res = await request('POST', '/api/auth/login', { studentId: 'XXXX', password: '123456' });
        assert(res.status === 401, `預期 401, 得到 ${res.status}`);
    });

    await test('錯誤密碼應回 401', async () => {
        const res = await request('POST', '/api/auth/login', { studentId: 'S001', password: 'wrong' });
        assert(res.status === 401, `預期 401, 得到 ${res.status}`);
    });

    await test('正確帳密應登入成功 (S001/123456)', async () => {
        const res = await request('POST', '/api/auth/login', { studentId: 'S001', password: '123456' });
        assert(res.status === 200, `預期 200, 得到 ${res.status}`);
        assert(res.body.success === true, '登入應成功');
        assert(res.body.student.id === 'S001', `學號應為 S001`);
        assert(res.body.student.name === '王小明', `名字應為 王小明`);
    });

    await test('登入後 /me 應回正確資訊', async () => {
        const res = await request('GET', '/api/auth/me');
        assert(res.status === 200, `預期 200, 得到 ${res.status}`);
        assert(res.body.student.id === 'S001', '學號不符');
    });

    // ========================================
    // 2. 出題 API 測試
    // ========================================
    console.log('');
    console.log('📋 測試 2: 出題 API (/api/quiz)');

    await test('取得 10 題測驗', async () => {
        const res = await request('GET', '/api/quiz/questions?count=10');
        assert(res.status === 200, `預期 200, 得到 ${res.status}`);
        assert(res.body.success === true, '應成功');
        assert(res.body.questions.length === 10, `應有 10 題, 得到 ${res.body.questions.length}`);
    });

    await test('題目不包含答案', async () => {
        const res = await request('GET', '/api/quiz/questions?count=5');
        assert(res.body.questions.every(q => q.answer === undefined), '題目不應包含答案');
    });

    await test('每道題目有完整欄位 (index, tag, category, questionText)', async () => {
        const res = await request('GET', '/api/quiz/questions?count=5');
        for (const q of res.body.questions) {
            assert(q.index !== undefined, '缺少 index');
            assert(q.tag, '缺少 tag');
            assert(q.category, '缺少 category');
            assert(q.questionText, '缺少 questionText');
        }
    });

    // ========================================
    // 3. 作答提交 API 測試
    // ========================================
    console.log('');
    console.log('📋 測試 3: 作答提交 API (/api/quiz/submit)');

    // 先取得題目
    await test('取得題目後批量提交答案', async () => {
        const qRes = await request('GET', '/api/quiz/questions?count=5');
        assert(qRes.body.success, '取題失敗');

        // 隨便填答案（測試流程是否正確）
        const answers = qRes.body.questions.map(q => ({
            index: q.index,
            userAnswer: 0, // 故意填錯以測試
            timeTaken: 5.0
        }));

        const submitRes = await request('POST', '/api/quiz/submit', { answers });
        assert(submitRes.status === 200, `預期 200, 得到 ${submitRes.status}`);
        assert(submitRes.body.success === true, '提交應成功');
        assert(submitRes.body.summary, '應包含 summary');
        assert(submitRes.body.summary.totalQuestions === 5, `應有 5 題結果`);
        assert(submitRes.body.results.length === 5, '應回傳 5 筆結果');
    });

    await test('提交結果包含正確答案', async () => {
        // 重新取題再提交以獲取結果
        const qRes = await request('GET', '/api/quiz/questions?count=3');
        const answers = qRes.body.questions.map(q => ({
            index: q.index,
            userAnswer: 999,
            timeTaken: 3.0
        }));
        const submitRes = await request('POST', '/api/quiz/submit', { answers });
        for (const r of submitRes.body.results) {
            assert(r.correctAnswer !== undefined, '結果應包含 correctAnswer');
            assert(r.userAnswer !== undefined, '結果應包含 userAnswer');
            assert(r.isCorrect !== undefined, '結果應包含 isCorrect');
            assert(r.questionText, '結果應包含 questionText');
        }
    });

    await test('沒有測驗時提交應回 400', async () => {
        const res = await request('POST', '/api/quiz/submit', { answers: [] });
        // 已經提交過了，session 中沒有測驗
        assert(res.status === 400, `預期 400, 得到 ${res.status}`);
    });

    // ========================================
    // 4. 單題即時作答 API 測試
    // ========================================
    console.log('');
    console.log('📋 測試 4: 單題即時作答 API (/api/quiz/answer)');

    await test('單題作答並即時回饋', async () => {
        const qRes = await request('GET', '/api/quiz/questions?count=3');
        const firstQ = qRes.body.questions[0];

        const ansRes = await request('POST', '/api/quiz/answer', {
            index: firstQ.index,
            userAnswer: 0,
            timeTaken: 4.5
        });

        assert(ansRes.status === 200, `預期 200, 得到 ${ansRes.status}`);
        assert(ansRes.body.result, '應包含 result');
        assert(ansRes.body.remaining === 2, `剩餘應為 2, 得到 ${ansRes.body.remaining}`);
    });

    // ========================================
    // 5. 統計 API 測試
    // ========================================
    console.log('');
    console.log('📋 測試 5: 統計 API (/api/stats)');

    await test('取得整體概覽 (/overview)', async () => {
        const res = await request('GET', '/api/stats/overview');
        assert(res.status === 200, `預期 200, 得到 ${res.status}`);
        assert(res.body.overview, '應包含 overview');
        assert(res.body.overview.totalQuestions > 0, '應有作答記錄');
        assert(res.body.overview.overallAccuracy !== undefined, '應包含正確率');
    });

    await test('取得各標籤統計 (/tags)', async () => {
        const res = await request('GET', '/api/stats/tags');
        assert(res.status === 200, `預期 200, 得到 ${res.status}`);
        assert(res.body.stats.length === 8, `應有 8 個標籤, 得到 ${res.body.stats.length}`);
        for (const s of res.body.stats) {
            assert(s.tag, '缺少 tag');
            assert(s.tagName, '缺少 tagName');
            assert(s.category, '缺少 category');
        }
    });

    await test('取得作答歷史 (/history)', async () => {
        const res = await request('GET', '/api/stats/history?limit=10');
        assert(res.status === 200, `預期 200, 得到 ${res.status}`);
        assert(res.body.history.length > 0, '應有歷史記錄');
        assert(res.body.total > 0, '應有總數');
    });

    await test('取得弱點分析 (/weaknesses)', async () => {
        const res = await request('GET', '/api/stats/weaknesses');
        assert(res.status === 200, `預期 200, 得到 ${res.status}`);
        assert(Array.isArray(res.body.weaknesses), '應回傳陣列');
    });

    await test('取得時間分析 (/time-analysis)', async () => {
        const res = await request('GET', '/api/stats/time-analysis');
        assert(res.status === 200, `預期 200, 得到 ${res.status}`);
        assert(Array.isArray(res.body.timeAnalysis), '應回傳陣列');
    });

    // ========================================
    // 6. 登出測試
    // ========================================
    console.log('');
    console.log('📋 測試 6: 登出');

    await test('登出成功', async () => {
        const res = await request('POST', '/api/auth/logout');
        assert(res.status === 200, `預期 200, 得到 ${res.status}`);
        assert(res.body.success === true, '登出應成功');
    });

    await test('登出後 /me 應回 401', async () => {
        const res = await request('GET', '/api/auth/me');
        assert(res.status === 401, `預期 401, 得到 ${res.status}`);
    });

    await test('登出後取題應回 401', async () => {
        const res = await request('GET', '/api/quiz/questions');
        assert(res.status === 401, `預期 401, 得到 ${res.status}`);
    });

    // ========================================
    // 測試結果摘要
    // ========================================
    console.log('');
    console.log('📊 ========================================');
    console.log(`📊  測試結果: ${passed} 通過, ${failed} 失敗`);
    console.log('📊 ========================================');

    if (failed === 0) {
        console.log('');
        console.log('🎉 Phase 3 驗證全部通過！後端 API 運作正確！');
        console.log('');
    } else {
        console.log('');
        console.log('⚠️  部分測試失敗，請檢查上方錯誤訊息。');
        console.log('');
    }

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('測試執行錯誤:', err);
    process.exit(1);
});
