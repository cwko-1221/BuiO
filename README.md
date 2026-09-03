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
- 奇趣科學島 3D 模擬實驗室：`/science-lab`
- 寵物樂園養成與俯視冒險：`/pet`

Mario Kart／Quiz Kart 實驗模組已移除，`/kart/*` 不再是有效路由。

### 晶核守衛戰

完整單人塔防戰役包含三張可自由選擇的 ImageGen 原創科幻地圖、7 條分流路線與多個怪物入口、每章 15 波、9 種普通敵人與 3 名獨立 Boss、6 種可升至四級的高質素防禦塔、3 種主動技能、三種難度與最佳分數記錄。所有塔與敵人使用透明 3D 預渲染精靈，配合待機、懸浮、受擊、死亡、後座力及升級動畫；追蹤火箭、扇形噴火、雪花霜域、雷電、光束、爆炸和技能效果由 WebGL 粒子系統即時產生。每波有 30 秒整備倒數，玩家必須按難度答對指定數量的四選一題目取得知識鑰匙才可開戰；擊破敵人的少量殘骸晶幣不能取代答題。音樂、攻擊和介面音效均由 WebAudio 即時合成。

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

塔防模擬及平衡測試可執行 `npm run check:tower-defense`；伺服器啟動後，以 `npm run check:tower-defense-live` 驗證三張地圖、答題經濟、塔管理、技能、音效狀態、勝負結算及響應式畫面。

科學實驗室以 `npm run build:science-lab` 建立正式資源；`npm run check:science-lab` 驗證 5 個探究、科學安全、狀態保存及資源預算，`npm run check:science-lab-live` 驗證觸控版面、登入保護及非 WebGL 後備模式，`npm run check:science-lab-physics` 則以真實指標手勢回歸碰撞、浮力、摩擦、接線及其他科學狀態。

寵物樂園以 `npm run build:pet` 建立正式資源；`npm run check:pet` 驗證養成、經濟、素材及安全規則，`npm run check:pet-live` 則在桌面、iPad 橫向及手機尺寸驗收學生與老師完整流程。詳細內容見 `pet-app/README.md`。
