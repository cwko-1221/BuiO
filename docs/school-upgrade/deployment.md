# BuiO 部署與現網驗證（2026-10-11）

本記錄配合 [升級報告](README.md)。時間除另註外均為香港時間。下列現網檢查是少量讀取，沒有建立測試學生、改寫成績或執行生產環境的 60 人寫入負載。

## Render

| 項目 | 結果 |
|---|---|
| 服務 | Buiosch，https://buiosch.onrender.com |
| 規格 | Free、Singapore、單一實例；沒有新增收費服務 |
| 部署分支 | codex/tower-defense；只使用非強制 fast-forward 更新 |
| 自動部署 | 關閉；兩次程式部署均手動觸發 |
| 主升級 | f3f2b5207a64352ba76130d6cf4387bf96403b3a；dep-db55t1qd0e5s73eagp00；10 月 10 日 23:53:38 上線 |
| 舊錄音相容修正 | 84ccdff7c44915bc202a5ad1a51db467bacdd3b6；dep-db55v72jnfac739bui9g；10 月 10 日 23:58:33 上線 |
| 最後部署狀態 | live；現網程式版本為 84ccdff7 |
| 健康檢查 | /health/live；已由 Dashboard 儲存，並以 Render API 確認 |
| 建置／啟動 | npm install／npm run start；三個前端在 Render 建置成功 |

ADMIN_PASSWORD 已改用 Render 環境變數；新憑證只存於本機 Git 以外的私人檔案，沒有寫入原始碼或本報告。SESSION_SECRET 保留，現有教師登入可繼續使用。更新環境變數曾啟動一個舊版本部署，已取消，之後才按次序部署新程式。

免費服務閒置後的冷啟動仍存在。此次沒有升級方案、建立常駐保活請求或增加實例。

## Supabase

已套用 server_only_data_20261010、operation_receipts_20261010、private_recordings_20261010 三項遷移。

- 49 張 public 資料表均已啟用 RLS；anon/authenticated 的 public 資料表 SELECT 授權為零；public schema 的 SECURITY DEFINER 函數為零。
- 後端維持 postgres 角色及平台 cookie 的存取模式；沒有誤套只適用 Supabase Auth 的政策。
- recordings 已為 private；question-images 為供題目使用的 public bucket。兩者上限均為 20 MiB。
- 舊 recordings 的 389 個物件、業務成績及音檔路徑沒有重寫。讀取相容既有 done.webm，上傳仍只允許 practice／assessment。
- 原先公開預載報表的完整備份放在 Git 以外。現行資料庫保留原有全部歷史報表身份鍵；不使用較舊資料覆蓋現行成績。
- 候選效能索引沒有套用；新增操作收據表使用其必要的主鍵約束。詳見升級報告中的讀寫測試門檻。

## 現網驗證結果

| 檢查 | 結果 |
|---|---|
| /health/live | 200、no-store；不查詢資料庫 |
| /health | 200；資料庫診斷正常 |
| 匿名開啟 report.html／preloadData.js | 401 |
| 匿名 classroom/sessions／chinese/recordings | 401、private/no-store |
| 匿名白板入口 | 重新導向登入 |
| 版本化 Phaser | 200；Brotli 約 358 KB，解壓後與原始約 1.38 MB 檔案一致；版本網址可快取 |
| recordings 關閉公開後的舊 public URL | 被拒絕，HTTP 400 |
| 教師頁面錄音 | 關閉 public 後重新載入，10 段均使用授權 API、readyState=4、無媒體錯誤 |
| 舊題目圖片 | 關閉 public 後經授權路徑正常載入，225 × 225 |

沒有把學生姓名、答案、成績、Storage 路徑、簽署網址或憑證放入本驗證記錄。授權讀取的跨帳戶拒絕及操作收據原子性另有隔離測試，並非以實際學生作寫入測試。

## 已知限制

Google 中文語音暖機在升級後日誌仍顯示 PERMISSION_DENIED，原因為供應商專案未啟用計費。已核對 10 月 8 日的升級前部署，存在相同錯誤。本次沒有啟用計費；TTS 快取無法解決該權限問題，不能據此宣稱全部現網語音功能已驗證成功。

30／60 人並發、斷線、回應遺失及錄音恢復已在隔離 fixture 通過，詳見 load-fixture.json。學校實際網絡與 Render／Supabase 的暖機 p95 改善比例仍待現場量測；不要把本機測試數字當成生產效能保證。

## 程式及後續維護

[PR #3](https://github.com/cwko-1221/BuiO/pull/3) 記錄主升級；非強制更新部署分支後 GitHub 已將其標記為 merged。後續舊錄音修正包含在目前上線的 84ccdff7。本報告是部署後的文件更新，不需要因此重建服務。

原本本機工作目錄及未提交資料、美術產物保持原狀；升級修改在獨立工作目錄完成。若需回退效能修改，應保留成績及錄音的授權保護，避免恢復公開資料入口。操作收據的清理政策須先配合可接受重播期限確認。
