# 奇趣科學島

登入 BuiO 後由 `/science-lab` 進入。這是面向小一至小六學生的完整 3D 模擬實驗模組，內容按《List of Suggested Teaching Aids and Equipment for Primary Science》的教具編號及學習內容代碼建立；該 PDF 是教具與學習內容的對照表，並非完整課程文件。

## 學生體驗

- 5 個多步驟探究，涵蓋生命與健康、物質、環境、能量及力與運動。
- 每個探究包括預測、安全提示、器材操作、逐步觀察、科學解釋、模型限制和 PDF 內容代碼。
- 支援拖動、連接、倒入、攪拌、敲擊、點按及連續數值調校；Rapier 剛體碰撞、浮力、摩擦、彈簧張力與電磁力會直接影響結果，所有步驟亦有鍵盤／按鈕等效操作。
- 3D 卡通器材由本地 Blender 資產包與程序幾何組成，動畫與 WebAudio 音效亦隨模組提供，不依賴外部圖片、字型或聲音服務。
- 以學生帳戶分隔的本機進度、能力星章、科學筆記、低畫質、減少動態及高對比設定。
- WebGL 不可用時自動切換至可完成相同探究的簡化生成場景。

## 建立與驗證

```bash
npm run build:science-lab
npm run check:science-lab
npm run check:science-lab-live
npm run check:science-lab-physics
```

正式 HTML 由平台登入保護；只有帶雜湊名稱的建立資源可由 `/science-lab/assets` 讀取。`/science-lab/preview` 只在開發環境啟用。
