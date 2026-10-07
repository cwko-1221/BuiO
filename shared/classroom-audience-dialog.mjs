import { mountAudienceEditor, countMatchedStudents } from './classroom-audience-editor.mjs';

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export async function openAudienceDialog({ title = '課堂可見範圍', confirmLabel = '儲存設定', rules = [], language = 'zh-HK', onConfirm, serverUrl = '' } = {}) {
    const en = language === 'en-US';
    const tr = (zh, english) => en ? english : zh;
    const response = await fetch(`${serverUrl}/api/classroom-audience/options`, { credentials: 'include' });
    const roster = await response.json();
    if (!response.ok || !roster.success) throw new Error(roster.message || tr('未能讀取班級及組別，請重試。', 'Could not load classes and groups. Please try again.'));
    for (const name of ['classroom-audience.css', 'classroom-audience-dialog.css']) {
        if (document.querySelector(`link[data-classroom-style="${name}"]`)) continue;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `${serverUrl}/shared/${name}`;
        link.dataset.classroomStyle = name;
        document.head.append(link);
    }

    return new Promise(resolve => {
        const dialog = document.createElement('dialog');
        dialog.className = 'classroom-audience-dialog';
        dialog.setAttribute('aria-label', title);
        dialog.innerHTML = `<form><h2>${escape(title)}</h2><div data-audience-editor></div><p class="classroom-audience-dialog-error" role="alert" hidden></p><div class="classroom-audience-dialog-actions"><button type="button" data-cancel>${tr('取消', 'Cancel')}</button><button type="submit" data-save>${escape(confirmLabel)}</button></div></form>`;
        document.body.append(dialog);
        const save = dialog.querySelector('[data-save]');
        const cancel = dialog.querySelector('[data-cancel]');
        let pending = false;
        const updateSave = (nextRules, count) => {
            const restricted = nextRules.length > 0 && !nextRules.some(rule => !rule.classNames.length && !rule.groupNames.length);
            save.disabled = pending || (restricted && count === 0);
        };
        const editor = mountAudienceEditor(dialog.querySelector('[data-audience-editor]'), {
            roster, rules, language,
            onChange: updateSave,
        });
        updateSave(editor.getRules(), countMatchedStudents(roster, editor.getRules()));
        const close = value => { editor.destroy(); dialog.remove(); resolve(value); };
        cancel.addEventListener('click', () => close(null));
        dialog.addEventListener('cancel', event => { event.preventDefault(); if (!pending) close(null); });
        dialog.querySelector('form').addEventListener('submit', async event => {
            event.preventDefault();
            if (save.disabled) return;
            pending = true;
            save.disabled = true;
            cancel.disabled = true;
            const errorNode = dialog.querySelector('[role="alert"]');
            errorNode.hidden = true;
            const audienceRules = editor.getRules();
            try {
                if (onConfirm) await onConfirm(audienceRules);
                close(audienceRules);
            } catch (error) {
                errorNode.textContent = error.message;
                errorNode.hidden = false;
                pending = false;
                cancel.disabled = false;
                updateSave(editor.getRules(), countMatchedStudents(roster, editor.getRules()));
            }
        });
        dialog.showModal();
    });
}
