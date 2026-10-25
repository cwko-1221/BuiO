# 同班共享花圃

2026-10-25。三片花圃使用 `park-layout-v4.mjs` 的 `GARDEN_PLOTS`：陽光 `sun`、月光 `moon`、星光 `star`。這是免費、無金幣交易的共享場景活動；花束是當日全班共同成果，不是道具錢包。

同日更新：花圃木框與土壤、兩座橋已改為 ImageGen 透明美術；共享資料另加入橋邊花廊、睡蓮生態池和願望燈會，使用 `action:'contribute'`。新增規則、素材及最新驗證見 [樂園美術與同班共建](pet-park-community-v1.md)。以下種花規則維持適用。

## 真正可操作的循環

1. 走到花圃前的小徑，從向日葵、鬱金香、雛菊選一包種子。
2. 種下後需要兩次澆水；另一名同學可以立即幫忙，同一個人第二次澆水需要間隔 4 秒。
3. 水分足夠後，伺服器計時生長 20 秒。客戶端不能修改時間或提前採收。
4. 盛開後任一同班、附近的玩家可以採一束花；共享花束數 +1，花圃回到空地，可繼續種植。
5. 每片花顯示本次一起照顧的同學，採收後保留上一束的採收者。全班成員可在場景看見相同的種子／小芽／生長／盛開狀態。

單人也可以遊玩；兩個人輪流照顧能立即完成兩次澆水。關閉面板不會丟失植物。場景、頁面重載、伺服器重啟後仍可讀回植物及剩餘生長時間。每天香港時間午夜開始新的班級花圃及花束計數，介面明確說明此規則。

## 伺服器整合

```js
const garden = require('./park-garden')({
  players, now, current, allowed,
  isBusy: id => social.isBusy(id),
  emitRoom: (room, payload) => ns.to(room).emit('park:garden', payload),
});
// socket 既有 handle 包裝建立後：
garden.attach(socket, handle);
// 現有 tick 可每 100 ms 呼叫；模組本身只會每秒讀取一次活躍班級：
await garden.tick();
// dispose：
garden.dispose();
```

不必把花圃資料塞入個人 `park:state` 或錢包。介面在 ready／重連時會查詢 `park:garden:state`。若 join 要附加初始快照，可以 `await garden.snapshotFor(player)`；這是可選的加速方式。

請求：

- `park:garden:state`：回傳 `{state}`；只能讀取登入玩家當前所屬班級房間。
- `park:garden:act`：`{plotId, action:'plant'|'water'|'harvest', seed?, requestId, revision, day}`。

`requestId` 每次使用 `crypto.randomUUID()`，重送同一請求不會重複施加動作。伺服器忽略客戶端提供的房間、學生、時間、花束數或生長進度。`revision` 是該片花圃當前版次；同時澆水時，只有符合最新版本的一次被接受，另一位會收到更新提示，不會把舊命令作用到下一批植物。收據保留最近 160 個，過期收據仍受版次／日期檢查保護。

位置需距離對應 `plot.at` 170 世界單位以內，且兩點間可通行。操作開始及提交前再次檢查權限、當前 socket、活躍狀態、老師鎖定、單人／雙人遊戲及仍留在花圃前。存檔時短暫用 `p.pending` 標記，移動／離開／接入其他互動會令提交失敗，不會留下半次照顧。

模組 `tick()` 發送 `park:garden {state,at}` 給該班房間，包含跨越生長完成時間及午夜重置的更新；不同班級不會收到對方的狀態。沒有在線玩家的房間不會持續查詢。

## 場景及介面整合

`ParkClient` 新增 `socket.on('park:garden', detail => event('garden', detail))`。

```ts
const garden = new ParkGarden({
  host, client, language,
  onBusy: value => { /* 和 NPC、手帳、合奏等一起計算輸入封鎖 */ },
  onNotice: message => notice(message),
  onState: state => scene.setGardenState(state),
  onWalkToPlot: id => {
    const plot = GARDEN_PLOTS.find(p => p.id === id)!;
    scene.walk(plot.at.x, plot.at.y);
  },
});
// 玩家點選場景土壤：
garden.open(plotId);
// 進入其他活動、鎖定或銷毀 controller 時關閉／清理：
garden.close();
garden.destroy();
```

`garden.state` 是最新權威快照；`garden.isOpen` 表示面板正佔用輸入。`onState` 每次都會收到資料，場景應依 `state.plots[id].stage` 與 `seed` 畫空地、小芽、生長或盛開的獨立圖像。成熟花圃不能只顯示在面板文字裏。`GARDEN_SEEDS` 的 id 與現有花圃美術鍵相同，可直接對應 `sunflowers`、`tulips`、`daisies`。

自己的澆水冷卻會在按鈕顯示倒數，其他同學的澆水不會錯誤封鎖自己的幫忙。快照包含房間 scope，且拒收同一房間的過期版次／時間，避免延遲封包把盛開狀態倒退或讓轉班後的花圃沿用上一班資料。

手機面板靠底部、可捲動；支援 Escape 及 Tab 焦點循環。遠處打開時顯示走近花圃按鈕，不會繞過位置驗證。所有玩家名稱經 HTML escaping。

## 儲存與驗證

`park-garden.repo.js` 使用與既有專案相同的 JSON store 或 PostgreSQL `getPool/withTransaction`。JSON 修改採單一序列佇列及寫入失敗回復；PostgreSQL 以 `(RoomKey,ParkDay)` 主鍵、`FOR UPDATE` 鎖定單一班級日資料並在同一交易中修改。沒有建立或改動錢包／貨幣帳目。

已通過 6 項規則／JSON／伺服器／PostgreSQL 測試：

```powershell
$env:NODE_PATH = (Resolve-Path -LiteralPath artifacts\park-test-runtime\node_modules).Path
node --test pet-app/tests/park-garden.test.cjs pet-app/tests/park-garden-postgres.test.cjs
node pet-app/node_modules/typescript/bin/tsc --noEmit --project pet-app/tsconfig.json
```

涵蓋同班兩位玩家輪流種花澆水、單人冷卻、真實生長時間、提前採收拒絕、共享計數、跨班／跨日隔離、重複請求、替換命令、過期版次、同時操作、老師提交中途鎖定、離線／換分頁／忙碌／距離／遮擋限制、JSON 寫檔故障、PostgreSQL 交易故障及真正新 Node 行程讀回植物。

仍需整合後以兩個真實登入瀏覽器在新地圖上操作並檢查成長美術與同步。以上單元結果不代表已通過遊戲整體發行驗收。

整合瀏覽器命令：`PET_APP_TEST_DIST=<隔離 build 路徑> node pet-app/tests/park-garden-live.mjs`。測試使用隔離帳戶，真正點選場景花圃及按鈕，涵蓋手機幫忙澆水、20 秒生長、採收重送、跨班隔離、重載保留植物及老師鎖定；輸出在 `artifacts/pet-playtest/park-garden/`。

### v4 首次整合結果

`artifacts/pet-park-release-build` 已通過真實雙瀏覽器功能驗證，報告及畫面在 `artifacts/pet-playtest/release-v4-garden/`。一位同學點擊場景種下鬱金香，另一位在手機版幫忙澆水，等待伺服器計時後採收；兩人共同計數一致，另一班保持空花圃。重送採收沒有增加第二束花；重新載入保留未完成植物與上次採收者；老師鎖定關閉面板，解鎖保留狀態。瀏覽器及缺圖錯誤均為零。

**美術仍未驗收。** 當前場景把整個成熟石邊花圃縮成不同大小，當小芽／成長圖示使用，造成「泥土格子內放著小花盆」的雙重邊框感，未形成可信的幼苗至盛開變化。成熟花朵應植入土壤，幼苗應有自己的葉片／芽造型。畫面 `03b-growing-in-world.png` 與 `05-bloom-ready.png` 也顯示玩家名牌與花圃狀態標籤互相擠近；狀態字應移到花圃上方或在附近互動時收合。功能測試通過不等於整個遊戲達到發行品質。

### Candidate 5 修正及重新驗證

原生透明幼苗及三種成熟花叢已取代縮小花盆；每床九株種在泥土裏。床緣改為木板、角柱及釘子，狀態移到床上方，兩人使用分開的安全站位。[最終雙瀏覽器園藝報告](../artifacts/pet-playtest/release-v4-garden-5/report.json) 的四項真實操作檢查通過，包含同班／跨班、重送、保存、老師鎖定及手機。幼苗與盛開的新畫面已交獨立美術覆核，整體結論見 [批評者紀錄](pet-park-release-art-review.md)。
