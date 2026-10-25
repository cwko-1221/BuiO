# 池畔慢釣：美術、操作與魚類圖鑑

2026-10-25。保留原有森林池塘背景，新增六種獨立魚類原畫、竹製魚竿、浮標、水花，以及三個可選的釣點。遊戲維持 60 秒，釣起兩條魚即達標；每日首次達標的 8 金幣與原有委託共用上限，結算仍由伺服器決定。

## 玩法

點水面或控制區選釣點，再按「拋竿」。浮標沿弧線落水，魚會先試餌兩次；真正咬鉤時浮標下沉，配合水花、聲音和明顯的提示，這時才提竿。過早或過晚提竿會讓魚游走，可以再試。

提竿後按住收線、放開鬆線，讓張力保持在綠色區域。六種魚有不同的拉力，收線途中會有較強的拉扯，控制區會提示「太緊／太鬆／剛剛好」。張力和收線進度放在畫面下方，池塘中央保留作觀察。

| 釣點 | 遊戲魚種 |
| --- | --- |
| 晴光淺灘 | 日光小鯉、薄荷小魚、桃花胖鯽 |
| 睡蓮水灣 | 薄荷小魚、桃花胖鯽、星點金魚 |
| 靜水深潭 | 月光銀魚、藍尾小魚、星點金魚 |

釣起魚時顯示原畫、名稱、尺寸、常見／少見／珍稀和分數；新發現有獨立提示。釣獲尺寸是該次遊戲紀錄，魚種收藏沿用原有每日存檔。圖鑑在開始、暫停及結果面板可展開查看六種魚，已發現的魚會亮起。

## 觸控與聲音

- iPad 及手機使用 Pointer Events 和指標捕捉，按下立即送出輸入，放開、取消觸控或旋轉時清除收線狀態。
- 一個主要按鈕處理拋竿、提竿與按住收線，不需要連續猛點。空白鍵亦可操作。
- 暫停、離開頁面、老師鎖定或離開遊戲沿用現有生命週期；暫停不消耗遊戲時間。
- 新增 7 個原創短音效：拋竿、試餌、咬鉤、提竿、拉扯、釣獲及魚游走。以預先建立的 Web Audio buffer 播放，並保留靜音設定。
- 使用較慢的 72 BPM 伴奏。非必要移動尊重減少動態效果設定，沒有加入全畫面模糊或昂貴的水面濾鏡。

## 美術資產

使用內建 **ImageGen** 生成透明素材。浮標另外以同一工具清除周圍光暈，保留原有木材及油漆細節。正式素材只經透明邊界裁切、縮小及 WebP 壓縮，沒有用程式重畫魚、釣具或水花。

- [全部生成提示](../artifacts/park-fishing-v2/prompts.json)；[浮標清理提示](../artifacts/park-fishing-v2/bobber-edit-prompt.txt)。
- [來源與裁切紀錄](../artifacts/park-fishing-v2/source-record.json)；[正式素材清單](../pet-app/src/park/fishing-art-assets.json)。
- [九件美術總覽](../artifacts/park-fishing-v2/contact-sheet.png)。
- 原稿：[日光小鯉](../artifacts/park-fishing-v2/fish-sunny.png)、[薄荷小魚](../artifacts/park-fishing-v2/fish-mint.png)、[月光銀魚](../artifacts/park-fishing-v2/fish-moon.png)、[桃花胖鯽](../artifacts/park-fishing-v2/fish-peach.png)、[藍尾小魚](../artifacts/park-fishing-v2/fish-blue.png)、[星點金魚](../artifacts/park-fishing-v2/fish-gold.png)、[魚竿](../artifacts/park-fishing-v2/rod.png)、[浮標](../artifacts/park-fishing-v2/bobber.png)、[水花](../artifacts/park-fishing-v2/splash.png)。
- 正式 WebP 目錄：`pet-app/public/assets/art/park/fishing-v2/`，9 張共 **366,172 bytes**。
- [音效試聽檔清單](../artifacts/park-fishing-v2/audio/manifest.json)：原創聲音的 WAV 輸出與 runtime buffer 使用相同合成來源。

## 網上參考

參考任天堂的 [Animal Crossing 釣魚介紹](https://play.nintendo.com/news-tips/tips-tricks/fishing-new-horizons-tips-and-tricks/)，採用觀察魚影、區分試餌和真正下沉的節奏。參考開發者在 [WEBFISHING 官方 Steam 頁面](https://store.steampowered.com/app/3146520/WEBFISHING/) 介紹的魚種收集與圖鑑方向。遊戲圖像、魚種名稱和聲音均由本專案另行製作，沒有取用參考遊戲素材。

## 驗證紀錄

61 項樂園規則與整合測試通過，涵蓋三個釣點的魚種限制、兩次試餌、提竿時機、魚線過緊／過鬆、真實收線、尺寸範圍、六種魚均可遇見、重播一致性、聲音樣本、班級共建及保存。TypeScript、4 項正式產物檢查及原有寵物模組檢查亦通過。

完整瀏覽器流程使用四個隔離的真實登入測試帳戶，透過實際按住／放開和觸控完成釣魚、節奏、點燈、高爾夫及迷宮，另以手機完成釣魚、查看圖鑑、旋轉、暫停和返回。沒有直接寫入分數或釣獲結果來冒充遊玩。

- [最終玩法與觸控報告](../artifacts/pet-playtest/park-fishing-release-3/report.json)。
- [樂園原有流程](../artifacts/pet-playtest/park-fishing-regression-2/smoke-report.json)：14 張任務卡、搜尋、無地面路線圖形、香蕉觸控、飛行護盾及老師鎖定；此檢查在同功能的 build 2 執行，build 3 僅微調寵物與魚竿在碼頭的位置。
- [本機分發核對](../artifacts/pet-playtest/park-fishing-final-3/preview-verification.json) 與 [驗證清單](../artifacts/pet-playtest/park-fishing-final-3/validation-manifest.json)。

最終版本為 `artifacts/park-fishing-build-3`，入口 SHA-256 為 `fe3382b4d943dc8e81c492c1df149c9a1aa56783ae5dc6132c74bd0f2ef83fc2`。測試環境為 Windows Chrome 與模擬平板／手機觸控；尚未實測實體 iPad，未對外部署。[本機預覽](http://localhost:3000/pet)。
