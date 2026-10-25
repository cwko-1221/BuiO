# 寵物小鎮：四區完整美術

2026-10-20 的 [冒險版本](pet-park-adventure-v2.md) 已將背景道路改為統一環路及支路，增加獨立遊戲攤位；下文為 v1 美術來源紀錄。

2026-10-19，依已確認的中央廣場樣板完成家園小徑、四季花園與微光森林。四區採用同一套溫暖童話 2.5D 美術，沿用現有精細寵物、穿戴、多人同步與伺服器任務規則。這份方向取代戶外地圖原本的程序幾何美術限制。

## 完成範圍

| 地區 | 場景與物件 |
| --- | --- |
| 家園小徑 | 石路、花草、小屋、郵差兔、紅信箱、長椅與路牌 |
| 星願廣場 | 保留已確認的建築與廣場，搭配熊園長、獨立噴泉、委託板、長椅、三款樂器與新路牌 |
| 四季花園 | 環形花徑、鹿園丁、三款可分辨的花圃、蘋果樹、睡蓮池、花蔭長椅 |
| 微光森林 | 林間石徑、松鼠探險員、橡樹與針葉樹、樹洞、發光蘑菇、橡果、清理任務物件與原木座椅 |

全圖維持 5120 × 3584 世界座標，32 個互動物件皆使用完整美術，92 個環境物件沿共用配置繪製。地面、景物、人物、物件與特效分層；寵物能在樹木及噴泉前後正確遮擋。NPC 前方保留視線，避免樹冠掩蓋主要任務人物。房間出口也已換成同材質的花園門。

四區共用細緻草地與石路材質，地區邊緣以自然輪廓過渡，小地圖與大地圖使用實際地形。小屋、花圃、池塘與噴泉的碰撞由前後端共用規則決定；NPC、任務與金幣不由美術圖片推算。

## 素材與來源

- 內建 **ImageGen** 製作；沒有使用 CLI、API 金鑰或外部素材服務。
- 原中央廣場 9 款 runtime 素材：[wish-plaza-v1](../pet-app/public/assets/art/park/wish-plaza-v1/)。
- 新增 24 款 runtime 素材：[full-park-v1](../pet-app/public/assets/art/park/full-park-v1/)。
- 共 33 款 WebP，總計 **6,872,720 bytes**。檔名包含內容雜湊，符合現有靜態路由及瀏覽器快取規則。
- 新增原始 PNG 與完整提示詞：[原始素材](../artifacts/park-art/full-park-v1/)／[prompts.json](../artifacts/park-art/full-park-v1/prompts.json)。
- 原廣場來源：[原始素材與提示詞](../artifacts/park-art/wish-plaza-v1/)。路牌沿用同次製作、先前未投入遊戲的方向路牌素材。
- 角色由已確認的熊園長衍生，地區地面由已確認的廣場衍生，以維持材質、光線與角色比例。其他物件依同一美術規格各自生成。

原始圖保留不動。Sharp 僅裁去透明空白、縮放和打包，保留生成的真實透明度。地區混合、陰影、光點、水波、前後排序與碰撞屬於遊戲渲染／規則。

## 檔案與重建

- [`world-art.ts`](../pet-app/src/park/world-art.ts)：四區地形、完整物件美術、植被、地圖縮圖與環境特效。
- [`world-art-assets.json`](../pet-app/src/park/world-art-assets.json)：新增素材的檔名、尺寸與大小。
- [`park-world.mjs`](../pet-app/lib/park-world.mjs)：世界配置、可走範圍、物件接近點及碰撞。
- [`BedroomScene.ts`](../pet-app/src/game/BedroomScene.ts)：花園門與原有步行出門流程。

```text
node scripts/build-pet-park-art.mjs
node scripts/build-pet-park-world-art.mjs
npm run build:pet
node --test pet-app/tests/park.test.cjs pet-app/tests/park-postgres.test.cjs
node scripts/test-pet-park-world-art-live.mjs
node scripts/test-pet-park-live.mjs --output=artifacts/pet-playtest/full-park-v1/multiplayer
```

瀏覽器測試可透過 `PET_APP_TEST_DIST` 指向隔離的 production build。測試使用臨時學生、錢包及登入資料，不會修改本機學生紀錄。

## 驗證紀錄

- TypeScript 檢查與 Vite production build 通過。
- 7 項 JSON／PGlite 資料與規則測試通過，涵蓋可達性、碰撞、30 人出生位置、每日任務、防重領、每日上限、交易回復及刪除關聯資料。
- 四區實際走動的瀏覽器美術測試通過：33 款素材全數載入、多人位置同步、四位 NPC 圖像與對話、花圃／池塘／蘋果樹／樹洞／蘑菇／收集物件、地圖、前後遮擋、手機花園門及桌面／平板／手機版面。
- 新版完整多人回歸通過：房間出口、同班同步／跨班隔離、鍵盤／觸控／表情、每日三個任務與額外獎勵、防重領、重新整理／重連、未分班私人房間、老師設定／鎖定／解鎖及回房間。30 位同班學生在 1024 × 768 Chrome 視窗同步並顯示 30 隻寵物，取樣約 60 FPS，沒有頁面 JavaScript 錯誤。
- 四區截圖與報告：[full-park-v1](../artifacts/pet-playtest/full-park-v1/)，完整多人及任務回歸結果另存 `multiplayer/`。

實體 iPad 與正式 PostgreSQL 尚未驗證。本次為本機完成的四區版本，未包含正式網站部署，也未新增第二期的另外四區。
