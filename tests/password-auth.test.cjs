const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), net = require('node:net');
const { spawn } = require('node:child_process');
const bcrypt = require('bcryptjs');
test('real login, teacher registration and batch password changes keep existing bcrypt semantics', async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-password-http-')), file = path.join(temp, 'db.json');
    await fs.writeFile(file, JSON.stringify({ users: [{ studentid: 'T001', name: 'Fixture teacher', passwordhash: bcrypt.hashSync('fixture', 4), role: 'teacher', language: 'zh-HK' }], studentStats: [], questionLogs: [], _logId: 0 }));
    const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
    const server = spawn(process.execPath, ['server.js'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: String(port), NODE_ENV: 'development', MOCK_AUTH: '0', SUPABASE_DB_URL: '', BUIO_JSON_DB_FILE: file }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let logs = '';
    server.stdout.on('data', d => logs += d);
    server.stderr.on('data', d => logs += d);
    const base = `http://127.0.0.1:${port}`, post = (route, body, cookie = '') => fetch(base + '/api/auth/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) });
    try {
        for (let i = 0;; i++) {
            try {
                if ((await fetch(base + '/health/live')).ok)
                    break;
            }
            catch { }
            if (i > 200)
                throw new Error(logs);
            await new Promise(r => setTimeout(r, 100));
        }
        const login = await post('login', { studentId: 'T001', password: 'fixture' });
        assert.equal(login.status, 200);
        const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
        assert.equal((await post('login', { studentId: 'T001', password: 'incorrect' })).status, 401);
        const registered = await post('register-student', { studentId: 'S901', name: 'First fixture', password: 'oldpass', className: '5A' }, cookie);
        assert.equal(registered.status, 200, await registered.text());
        const batch = await post('register-students-batch', { students: [{ studentId: 'S901', name: 'Updated fixture', password: 'newpass', className: '5A' },
                { studentId: 'S902', name: 'New fixture', className: '5A' }] }, cookie);
        assert.equal(batch.status, 200, await batch.text());
        assert.equal((await post('login', { studentId: 'S901', password: 'oldpass' })).status, 401);
        assert.equal((await post('login', { studentId: 'S901', password: 'newpass' })).status, 200);
        assert.equal((await post('login', { studentId: 'S902', password: '123456' })).status, 200);
        const db = JSON.parse(await fs.readFile(file, 'utf8'));
        for (const id of ['S901', 'S902'])
            assert.equal(bcrypt.getRounds(db.users.find(u => u.studentid === id).passwordhash), 10);
    }
    finally {
        server.kill();
        await new Promise(r => server.exitCode !== null ? r() : server.once('exit', r));
        await fs.rm(temp, { recursive: true, force: true });
    }
});
