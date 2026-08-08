/* global fetch */

const ReportAPI = {
    async request(url, options = {}) {
        const response = await fetch(url, { credentials: 'same-origin', ...options });
        const contentType = response.headers.get('content-type') || '';
        const body = contentType.includes('application/json') ? await response.json() : null;
        if (!response.ok) {
            if (response.status === 401) window.location.href = '/';
            throw new Error(body?.message || `伺服器錯誤 (${response.status})`);
        }
        return body;
    },

    loadData() {
        return this.request('/api/report/data');
    },

    async uploadFile(file, records) {
        const form = new FormData();
        form.append('file', file, file.name);
        form.append('records', JSON.stringify(records));
        return this.request('/api/report/imports', { method: 'POST', body: form });
    },

    migrateBrowserData(files) {
        return this.request('/api/report/migrate-browser-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files }),
        });
    },

    clearAll() {
        return this.request('/api/report/data', { method: 'DELETE' });
    },
};
