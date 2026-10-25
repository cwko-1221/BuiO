# 樂園同學互動與星光合奏

2026-10-24。所有互動均透過現有 `/pet-park` 登入連線，沒有新增公開聊天、陌生人配對或客戶端金幣派發。

## 遊玩

同學面板顯示附近的真實在線同班玩家；可以走近同學、揮手、邀請擊掌，或邀請雙人「星光合奏」。收到邀請的同學可接受或稍後，發出者可取消。邀請 15 秒自動失效，發邀請有 8 秒冷卻，對方拒絕後該組合 30 秒內不再打擾。

合奏約 24 秒，共 8 拍。每人會見到自己的陽光／樹葉／水滴／花朵圖案，等移動光點進入亮色區後按一次正確圖案。兩人同一拍都正確才共同得分，時機更準有額外分數。每個人每拍只能提交一次，不能替對方作答；單人無法完成合奏。兩位玩家每局都會遇到全部四種圖案。支持觸控、滑鼠及 1–4 鍵，結果顯示共同得分、最長連擊、成功拍數及星星，隨時可離開或再邀一局。

這是免費同樂模式，分數只屬於當次合奏。沒有假裝已保存紀錄，也沒有變更現有任務與遊戲的每日金幣上限。

## 伺服器整合

```js
const social = require('./park-social')({
  players, now, current, allowed,
  emitRoom: (room, payload) => ns.to(room).emit('park:social', payload),
});
// 每次 socket 建立既有 handle 包裝後：
social.attach(socket, handle);
// 現有 100ms tick：
await social.tick();
// 斷線、換分頁、權限鎖定、離開畫面：
social.cancelPlayer(id, 'unavailable');
// 移動、NPC 操作、單人遊戲：
if (social.isBusy(p.id)) fail('請先結束雙人合奏。');
// dispose：
social.dispose();
```

邀請和接受時驗證同班、有效玩家物件及 socket、在線狀態、未鎖定、沒有其他遊戲／活動、相距 360 世界單位內，以及兩個站位之間的可通行直線。不能隔溪或隔牆互動。接受時再驗證一次，最後一個 `await` 之後同步消耗邀請，防止並行接受建立多局。`tick()` 會在斷線、暫離、鎖定、班別改變、換分頁或相距超過 420 單位時中斷兩方的會話。

### 協議

請求事件：

- `park:social:invite`：`{peerId, kind:'duet'|'highfive'}`。
- `park:social:reply`：`{invitationId, action:'accept'|'decline'|'cancel'}`。
- `park:social:input`：`{sessionId, round, pad}`，pad 0–3；沒有可提交的 score、role 或位置欄位。
- `park:social:control`：`{sessionId, action:'leave'}`。
- `park:social:state`：回傳目前自己的邀請及合奏，供介面恢復同步。

伺服器推送 `park:social`：`invitation`、`invitation-ended`、`session`、`ended` 只送給當事人；`effect` 擊掌效果送給同班房間。每個 session 推送各自的 role，僅揭露當前一拍圖案；時間、是否答對、合奏成功、分數和結果皆由伺服器決定。

## 介面整合

`ParkClient` 將 socket 的 `park:social` 轉為同名義的 `social` CustomEvent。

```ts
const social = new ParkSocial({
  host, client, language,
  onBusy: busy => { /* 關閉其他面板、停止移動並封鎖場景輸入 */ },
  onNotice: message => notice(message),
  onEffect: effect => { /* 畫兩個寵物之間的短暫擊掌效果 */ },
  onWalkToPeer: id => walkToPeer(id),
  portrait: id => petArtForPeer(id),
});
social.openNearby();
social.invite(peerId, 'duet');
social.invite(peerId, 'highfive');
// 關閉 controller：social.destroy()
```

`social.isOpen` 表示同學面板或合奏正佔用輸入；邀請提示不會把正在走路的同學強制拉入遊戲。親手接受後才開始。場景和 controller 應在任何解封輸入的判斷中納入 `social.isOpen`，避免失焦回復、面板關閉或重連時又開啟移動。

可透過 `window.__petPark.social.session.game` 讀取目前介面所收到的權威狀態作 QA；操作仍應點擊實際按鈕，不能偽造本地分數。

## 驗證

`node --test pet-app/tests/park-social.test.cjs`：6 項通過，涵蓋真實雙方輸入、時間判定、錯誤／重複輸入、無法單人得分、班別隔離、同意流程、冷卻／拒絕／取消／逾時、偽造會話、8 份並行接受、斷線、鎖定、暫離、換分頁、分班改變及結果逾時清理。

`node pet-app/node_modules/typescript/bin/tsc --noEmit --project pet-app/tsconfig.json`：新增介面與既有專案型別檢查通過。

整合後仍必須用兩個真實登入瀏覽器驗證邀請及完整 8 拍遊戲、手機觸控、拒絕、逾時、斷線及老師鎖定。這份單元證據不取代整合驗收。

整合瀏覽器測試：`PET_APP_TEST_DIST=<已編譯的隔離 build> node pet-app/tests/park-social-live.mjs`，輸出 `artifacts/pet-playtest/park-social/`。使用隔離臨時學生資料及 Chrome，通過真正的按鈕完成兩人輸入，故意漏掉其中一人的一拍，確認不能單人得分；另外驗證 15 秒邀請逾時、接受擊掌、跨班隔離、整局分數、關閉另一個瀏覽器、老師中途鎖定及拒絕冷卻。

### 2026-10-25 整合驗收證據

以 `artifacts/pet-park-release-build` 執行上述測試通過。證據位於 `artifacts/pet-playtest/release-v4-social/`：`report.json` 及 10 張實際畫面。Chrome 的三個獨立登入學生情境驗證班別隔離，兩名同班學生使用桌面與 390 × 844 手機模擬介面操作。

兩人完整操作 8 拍，刻意漏掉其中一位的第 4 拍後，兩邊都收到 7/8 成功、1050 分及 3 顆星；沒有替另一位玩家自動作答。直接點擊世界中的同學寵物可開啟互動；結果的「再邀請一局」按鈕會建立新會話並要求對方重新同意。15 秒邀請逾時、接受擊掌、跨班不收到效果、合奏中無法移動、關閉另一瀏覽器、老師鎖定／解除、拒絕及再次邀請冷卻全部通過，沒有瀏覽器錯誤或缺圖。

已逐張檢視桌面邀請、手機收到邀請、遊戲中及手機結果畫面：寵物頭像、圖案、亮色時機區與操作按鈕均完整顯示，沒有頁面橫向溢出。此項社交玩法通過功能及畫面驗收；並未代表其他地圖、美術、效能或整體發行條件已通過，也未宣稱實體手機測試。

### Candidate 5 的最終重跑

[最終報告](../artifacts/pet-playtest/release-v4-social-5/report.json) 綁定 Candidate 5 及其 HTML SHA-256；七項整合檢查再次通過。手機同伴在八拍遊戲中切至 844×390 橫向並繼續實際作答，四個按鈕保持在視窗內且至少 44px；結果回復直向。三顆星結果已改為「已獲三星」，測試驗證該文案。整體美術與發行範圍見 [v4 紀錄](pet-park-v4.md)。
