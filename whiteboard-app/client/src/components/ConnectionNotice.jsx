import styles from './ConnectionNotice.module.css';

const MESSAGES = {
    connecting: '正在連接課堂…',
    reconnecting: '網絡暫時中斷，正在重新連線；請保留此頁面。',
    'teacher-reconnecting': '老師暫時斷線，正在重新連線；課堂和筆跡已保留。',
};

export default function ConnectionNotice({ status }) {
    const message = MESSAGES[status];
    if (!message) return null;
    return <div className={styles.notice} role="status" aria-live="polite">{message}</div>;
}
