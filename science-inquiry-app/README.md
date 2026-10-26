# 科學探究閣

學生與老師從平台首頁進入 `/science-inquiry`，沿用平台登入和語言設定。

- 學生可選擇已拍好的影片、在手機拍攝，或透過瀏覽器鏡頭錄影，選擇「科學發現／科學疑問」。標題及觀察／疑問文字全部選填，只上傳影片亦可提交審核。單段最多 1 分鐘、250 MB、輸入最高 4K。
- 影片處理及儲存成功後顯示「審核中」；待審核與退回影片只限上傳者及老師觀看。學生可在「我的探究」查看狀態和老師回饋。
- 老師在「影片審核」觀看影片，可通過並發佈、填寫原因退回，或將已發佈影片下架。審核使用版本檢查，避免兩位老師互相覆蓋決定。
- 已發佈影片可供所有登入學生觀看、點讚及取消點讚，每名學生每段影片只計一次；點讚操作可安全重送。

## 影片處理

伺服器以 FFmpeg 轉為 H.264 / AAC MP4、CRF 23、最高 30 fps、長邊 1920／短邊 1080，保持比例而不放大，支援直向與橫向。影片碼率最高 2 Mbps，音訊 128 kbps；處理結果上限 48 MiB。已經細小且相容的 MP4 若重新壓縮變大，可改用無損重新封裝。輸出啟用 faststart，移除定位等 metadata，並產生 JPEG 封面。

輸入採磁碟暫存、限制格式與外部協定；同一服務實例一次處理一段影片、使用兩個執行緒，忙碌時回傳 429 並提示學生稍後重試。壓縮逾時、無效影片或儲存失敗會清理暫存及已上傳物件，不會產生可發佈記錄。處理期間需保持頁面開啟。

FFmpeg 隨 `ffmpeg-static` 安裝，ffprobe 隨 `@ffprobe-installer/ffprobe` 安裝。可用 `FFMPEG_PATH`、`FFPROBE_PATH` 指定自行維護的執行檔。正式安裝不可跳過套件安裝腳本及 ffprobe 的平台 optional dependency。靜態二進位來源及授權見上述套件說明；部署時一併遵守所用 FFmpeg build 的授權。

## 資料及私人儲存

正式環境沿用 `SUPABASE_DB_URL`，首次讀取自動執行可重複套用的 `db/migrations/20261026_science_inquiry.sql`，建立影片表、點讚表及索引，啟用 RLS 並撤銷 anon/authenticated 的直接存取。使用平台現有的伺服器資料庫角色，該角色需具備建表及後端存取權限；也可在部署前透過既有 migration 流程套用 SQL。

沿用 `SUPABASE_URL`（或 `NEXT_PUBLIC_SUPABASE_URL`）及 `SUPABASE_SECRET_KEY`（或 `SUPABASE_SERVICE_ROLE_KEY`）。首次上傳時自動建立／確認 `science-inquiry` 私人 bucket，限制 MP4/JPEG 及 48 MiB。Supabase 專案本身的檔案上限亦須允許該大小。**不會**在 PostgreSQL 模式退回伺服器的暫時磁碟儲存。若未設定儲存服務，上傳會明確失敗。

播放與封面均經登入 API 代理，支援 HTTP Range，設定 private/no-store，每次請求重新檢查審核狀態；Supabase 短效簽名 URL 保留在伺服器，不交給瀏覽器。下架後的新播放、跳轉及封面請求立即拒絕。已下載到學生裝置的內容無法追溯收回。

JSON 開發模式儲存在現有 JSON 資料庫及 `data/science-inquiry-media/`（已列入 gitignore）。測試可用 `BUIO_JSON_DB_FILE`、`SCIENCE_INQUIRY_MEDIA_DIR` 指向獨立目錄。

## 驗證

```sh
npm run check:science-inquiry
npm run check:science-inquiry-live
```

前者測試 JSON/PostgreSQL 真實 SQL 引擎、未審核影片隔離、審核版本、重複／並發點讚、分頁、RLS、橫直向壓縮、無 duration header 的 WebM、定位資料清除及過長／損壞影片。後者用臨時帳戶和本機媒體儲存驗證瀏覽器完整流程，結果與截圖存放於 `tmp/science-inquiry-qa/`；不會修改學校資料或連接正式儲存。首次使用可能需 `npx playwright install chromium`。
