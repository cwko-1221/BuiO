# 目前美術並行分工

使用者於2026-11-05要求四條工作線：地圖、寶可夢影片步姿、其他訓練員影片步姿、UI含對戰。同時可執行上限四agent含root，因此root負責UI與統整，另三條由子agent負責。

| 工作線 | Agent | 檔案範圍與交付 |
| --- | --- | --- |
| 地圖 | pokemon_motion_critic（恢復時轉任地圖，承接map_design） | worldPremiumPrototype/Art/Terrain與地圖素材、路線、碰撞、遮擋；既有已選立體手繪風格，先可行走木橋場景再擴張 |
| 寶可夢 | pokemon_sprites（承接pokemon_video_walk） | 三視圖、Lovart影片、原片與裁框預覽、可用loop、透明圖集；不改UI／地圖／訓練員 |
| 其餘訓練員 | video_atlas_pack（承接訓練員影片製作） | Azure→Violet→Blaze現有設計三視圖與Lovart影片步姿；不再審核或重做已確認Emerald |
| UI與對戰 | root | templates、UI樣式、互動與桌機／手機檢視；同時統整各agent交接，負責共用renderer/world/registry接入 |

UI工作線不製作角色步姿素材。地圖與角色agent不改UI。共用程式改動由root統整，避免衝突；全遊戲完整品質另作最後驗收。

目前具體狀態：

- 地圖三個新模組已接入explicit localhost premium-crossing-v1試作，正在真實角色行走／遮擋／碰撞測試；水與岸仍是施工中素材。
- 寶可夢Squirtle的Seedance影片task fcf4fbba-b86b-4faf-a44e-7951a977b221被服務端API_CONTENT_POLICY版權限制拒絕，紀錄保留。使用者隨後明確指定「pokemon轉用kling4.0flash」；已重新派該worker用確切模型kling/kling-v4-flash做同一三視圖的一次6秒測試，保留Squirtle原本身份與內容。若新服務端仍拒絕即回報，不改名或重複提交。另已完成24物種來源清單，12物種三向齊全、12物種缺方向；未新增任何驗收。
- Azure首段task e796d3d1-33af-4550-a291-bf1492af2091已提交Seedance2Fast6s720p，後續只追同一handle；成功檢視原片才依序做其餘兩位。
- UI第一批已修手機對戰技能卡：名稱／MP上列，屬性／威力下列，另列相剋或MP不足。12個桌機／直向／橫向畫面與實際使用技能消耗MP已檢查，零瀏覽器錯誤／存檔請求。證據ui-battle-layout-v7。

新使用者指示已擴充provider分工：Lovart影片明確允許訓練員及寶可夢；地圖／UI／技能圖像仍用內建ImageGen。遇服務端政策拒絕即保存並回報，不以不斷變更請求消耗credits。

影片時長新偏好：後續尚未提交的寶可夢／訓練員影片採4秒，從第一格即穩定行走，不加入站姿起步或收尾過渡。已完成或provider已執行的6秒任務沿用，不為時長重新生成。三視圖同時播放，因此無須把每方向的時長相加；4秒是否能擷取完整自然循環仍以實際影片為準。

續作更新：舊執行槽曾因用量限制中止，使用者要求繼續後以上三個可啟動槽已回報resume，分工不變。Azure固定四方向已由使用者明確確認，A循環109–131幀製成23×3真alpha圖集並接入shared registry與預設預覽，native四方向25/23幀按各自設定均實際播放；Emerald與Azure目前2/4訓練員接入。Violet4秒任務7b794e1e-c526-4814-9e45-7f6d8290984c已完成待使用者確認；Blaze4秒fab9e7ac-24ed-4fe5-8c20-78fb5712782d追同handle。

Kling前次非JSON回覆已從原始nestedtoolresult找回：本機MCP參數驗證拒絕first_frame，要求params.image物件，未送provider。已按schema修正，唯一真正送出4秒任務fb1c7410-f099-4a2b-9fd5-a48f5a14d2d5，繼續追同handle，不新增/重交。

UI已加入真實我方／對方行動與招式提示、行動牌框，實際雙方回合後恢復等待指令，零錯誤／save。探索任務改可展開詳情，手機預設58px／展開111px，狀態跨HUD重繪保留。這些是功能與局部視覺證據，不代表全遊戲美術通過。
