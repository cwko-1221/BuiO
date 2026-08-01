# 杯澳個人化學習平台 V2

杯澳學校的整合式教學平台。學生與教師可從同一入口使用數學、中文、英文、互動白板、學習報告及多人闖關遊戲。

## 現有模組

- 數學練習：`/math`
- 互動白板：`/whiteboard`
- 教師學習報告：`/report.html`
- 中文學習：`/chinese`
- 英文學習：`/english`
- 多人闖關遊戲：`/game`
- 晶核守衛塔防：`/tower-defense`

Mario Kart／Quiz Kart 實驗模組已移除，`/kart/*` 不再是有效路由。

## 本機啟動

需要 Node.js 及 npm。首次使用先安裝依賴：

```bash
npm install
npm run dev
```

然後開啟 <http://127.0.0.1:3000>。

## 設定

主要環境變數由 `config.js` 讀取：

- `PORT`：HTTP 連接埠，預設為 `3000`
- `NODE_ENV`：`development` 或 `production`
- `SESSION_SECRET`：正式環境必須設定的 session 密鑰
- `SUPABASE_DB_URL`：設定後使用 PostgreSQL；未設定時使用本機 JSON 資料庫
- `CORS_ORIGINS`：正式環境允許的來源，以逗號分隔
- `MOCK_AUTH`：只供非正式環境測試登入

## 驗證

執行完整靜態與遊戲回歸測試：

```bash
npm run check
```

檢查生產依賴安全性：

```bash
npm run check:security
```

服務狀態可由 `/health` 或 `/api/health` 查詢，回應包含版本、環境、運行時間及資料庫模式。

需要已啟動伺服器的整合測試，可分別執行 `check:network-live`、`check:session-live`、`check:settings-live`、`check:host-ui-live`、`check:launchers-live`、`check:lasers-live` 及 `check:checkpoint-live`。
