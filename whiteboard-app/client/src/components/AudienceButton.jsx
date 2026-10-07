import { useState } from 'react';
import { openAudienceDialog } from '../../../../shared/classroom-audience-dialog.mjs';
import '../../../../shared/classroom-audience.css';
import '../../../../shared/classroom-audience-dialog.css';
import { saveRoomAudience } from '../utils/roomAudience';
import styles from './AudienceButton.module.css';

export default function AudienceButton({ roomId, serverUrl }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const edit = async () => {
        setBusy(true);
        setError('');
        try {
            const url = `${serverUrl}/api/whiteboard/sessions/${encodeURIComponent(roomId)}/audience`;
            const response = await fetch(url, { credentials: 'include' });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || '未能讀取課堂設定，請重試。');
            await openAudienceDialog({
                title: '白板課堂可見範圍', rules: data.audienceRules, serverUrl,
                onConfirm: async audienceRules => {
                    const result = await fetch(url, {
                        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ audienceRules }),
                    });
                    const saved = await result.json();
                    if (!result.ok || !saved.success) throw new Error(saved.message || '未能儲存設定，請重試。');
                    saveRoomAudience(roomId, saved.audienceRules);
                },
            });
        } catch (error) { setError(error.message); }
        finally { setBusy(false); }
    };

    return <div className={styles.wrapper}>
        <button type="button" className={styles.button} onClick={edit} disabled={busy}>
            {busy ? '讀取設定…' : '班級／組別'}
        </button>
        {error && <span className={styles.error} role="alert">{error}</span>}
    </div>;
}
