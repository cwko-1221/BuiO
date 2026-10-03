# 龜波氣功動作與連續光束

保留上一版粗氣功的 150 px 寬度、大型藍白光球與持續發射。移除光束中間重複的光球貼圖，改成五層連續光帶及完整流動光紋，發射和末段消散平滑過渡。

悟空專用八個動作依次為準備、收手到腰側、蓄氣、蓄氣頂點、出掌、持續發射 A／B、收招。所有姿勢保持同一縮放及腳底錨點；雙手的發射點隨姿勢設定，發射時不套用寵物表情動畫的傾斜和縮放。其餘動作繼續使用已發佈寵物圖集。

[原始八姿勢 PNG](raw.png) 使用 Codex 內建 imagegen 一次生成，[完整實際提示與來源雜湊](generation.json)、[既有種子姿勢](seed.png)及[透明參考畫布](reference-canvas.png)一併保存。前處理按 sprite-pipeline 建立參考畫布與共同比例預覽；正式圖集用連通形狀保留完整手指，依腳底統一對齊，沒有逐幀縮放。

重建：從專案根目錄執行 `node scripts/build-pet-brawl-goku-cast.mjs`。输出是 640 × 320 透明 WebP，每幀 160 × 160，約 120 KiB，登記於公開 brawl manifest 的 fighterSkillAnimations。只在悟空出場時載入，退出場景即清理。

驗證：TypeScript 與正式 Vite 建置、25 角色資產和所有權、50 招左右合共 100 次施放。另檢查龜波氣功左右八姿勢、34 個動畫時點、四個持續發射時點的光束核心像素、觸控施放、減少動態及場景清理。截圖／報告：`artifacts/pet-playtest/kamehameha-smooth/browser-final/`。測試使用 Windows Chrome 的 1024 × 768 觸控模擬；未用實體 iPad Safari 驗證。
