# 大亂鬥 v11：技能特效與鳴人分身

以路飛已認可的兩張八幀圖集作基準，為其餘 48 招生成專用動畫；大亂鬥現有 25 位角色、50 招合共 400 幀。路飛圖集內容雜湊保持不變。

鳴人各分身只有 1 HP；一次有效攻擊即消失，最多存在 180 tick（3 秒）。兩個分身仍各自移動、追敵及普攻，消失時播放專用煙霧動畫。沒有分身標示、倒數或小血條。技能的 MP 與冷卻 UI 保留。舊 v10 規則完整封存，舊存檔、伺服器驗證和重播仍使用其原始規則。

八幀動畫涵蓋準備、釋放、爆發及收招，並按實際機制接上持續火焰、光束、遠攻飛行、冰柱與雷擊、旋風、護盾、標記、竹蜻蜓和煙霧。飛行畫面的位置另經調整，避免竹蜻蜓和角色被頂部 HUD 遮擋。

| 角色 | 第一技能 | 第二技能 |
| --- | --- | --- |
| 星斑貓 | 星影換位（blink） | 獵星連爪（flurry） |
| 雲耳狗 | 裂空風刃（gale-blades） | 龍捲風眼（cyclone-eye） |
| 布丁豬 | 裂地震波（seismic-fault） | 泥漿砲彈（mud-mortar） |
| 金毛犬 | 彈力追獵（fetch） | 金光守護（rally） |
| 月芽兔 | 月牙光輪（moon-disc） | 月落星雨（moonfall） |
| 泡泡水獺 | 泡泡連彈（bubble-volley） | 泡泡牢籠（bubble-snare） |
| 苔背龜 | 龜殼反彈（shell-counter） | 藤根圍城（moss-garden） |
| 火花鼠 | 烈焰噴吐（flame-breath） | 爆炎果實（blazing-nut） |
| 葉尾狐 | 葉刃回旋（leaf-blade） | 森羅葉暴（leaf-tempest） |
| 雪羽企鵝 | 冰柱長城（glacial-wall） | 極地暴風雪（polar-blizzard） |
| 雷角羊 | 雷角連鎖（horn-lightning） | 天雷審判（storm-verdict） |
| 珊瑚海豹 | 洶湧巨浪（tidal-bore） | 珊瑚潮池（coral-pool） |
| 竈門禰豆子 | 血焰噴流（bloodflame-torrent） | 爆血花火（blood-bloom） |
| 孫悟空 | 龜波氣功（kamehameha） | 元氣玉（spirit-bomb） |
| 蠟筆小新 | 屁屁龍捲風（cheeky-cyclone） | 動感光線（action-beam） |
| 多啦A夢 | 空氣炮（air-cannon） | 竹蜻蜓（take-copter） |
| Hello Kitty | 蝴蝶結飛舞（ribbon-flight） | 友誼心光（friendship-glow） |
| 阿根廷10號 | 連環盤球（orbit-dribble） | 追蹤巧射（curved-shot） |
| 葡萄牙7號 | 凌空倒掛（bicycle-cannon） | 強力自由球（power-kick） |
| 比卡超 | 電球（electro-ball） | 十萬伏特（thunderbolt） |
| 弗利沙 | 死亡光線（death-beam） | 帝王能量球（emperor-orb） |
| 路飛 | 橡膠手槍（gum-pistol） | 橡膠機關槍（gum-gatling） |
| 安妮亞 | 心聲標記（mind-scan） | 預知結界（foreseen-counter） |
| 埼玉 | 普通連續拳（consecutive-punches） | 認真一拳（serious-punch） |
| 漩渦鳴人 | 多重影分身術（shadow-clones） | 螺旋丸（rasengan） |

## 資產與效能

每张透明無損 WebP 圖集為 2048 × 512，單幀 512 × 256，設完整透明邊界、共同縮放及固定發射／中心／地面錨點。50 張合共 21.79 MiB，最大一張 588.3 KiB；練習場只載入所選角色最多兩張，對戰最多四張，離場即清理。特效使用上限 72 個物件的重用池，本次 100 次施放中最多同時使用 11 個。

原圖、完整提示、參考圖及來源雜湊在 [skills-v11/jobs.json](../pet-app/art-source/skills-v11/jobs.json)，生成方式為 Codex 內建 imagegen。重建方式與圖集說明在 [美術來源 README](../pet-app/art-source/skills-v11/README.md)。

## 驗證

- `test-pet-brawl-skill-art.mjs`：50 張獨立八幀圖集，透明度、幀差異、邊界與保留路飛雜湊。逐張檢視完整圖集與 50 張遊戲內效果截圖。
- `test-pet-brawl-skill-fx-live.mjs`：左右兩個朝向合共 100 次實際施放，49 招播放多個專用幀，龜波氣功驗證原有蓄氣光球及 150 px 粗光束的左右發射，每場只載入最多兩張專用材質；六種較重效果在 Windows Chrome 1024 × 768 觸控模擬中約 60 FPS，沒有圖片或頁面錯誤。
- `test-pet-brawl-utility-live.mjs`：最終建置中的觸控、至少 64 px 按鈕、竹蜻蜓完整顯示與三次空中射線、追蹤球、安妮亞標記與護盾、分身無標示及三秒煙霧消失、MP 不足提示。
- `test-pet-brawl-utility.mjs`：一擊及精確三秒期限、自主攻擊、MP／擊殺／掉落限制、重召／主人倒下清理；目前五種角色四種模式的重播，以及 v9/v10 全 25 位角色的原規則一致性。另逐檔比較 v10 封存的九個模組與原始提交。
- `test-pet-brawl-utility-pvp.mjs`、`test-pet-brawl-pvp.mjs`、`test-pet-brawl-pvp-live.mjs`：真正 Socket 分身／空中射線同步，500 金幣入場費、邀請拒絕／取消不收費、所有權、斷線及退款。
- `test-pet-brawl-roster.mjs`、`test-pet-brawl-elemental.mjs`、`test-pet-brawl-balance.mjs`：50 招真實傷害或支援效果、所有權授權、MP、灼燒／結冰、敵人及舊版重播。
- `test-pet-brawl-story-live.mjs`：20 章、80 次真正戰鬥、100 段必要對話，全部以合法輸入完成並經伺服器驗證；解鎖、獎勵、故事存檔與舊存檔遷移通過。測試 bot 的版本識別同步更新至 v11。
- TypeScript 檢查及正式 Vite 建置通過。

測試報告與截圖位於 `artifacts/pet-playtest/skills-v11/`。上述平板測試使用 Chrome 觸控模擬，未以實體 iPad Safari 驗證。

## 龜波氣功還原

按要求，孫悟空的龜波氣功還原至 v10 的金色蓄氣光環、藍白多層粗光束、大型光球及流動光紋。專用新版龜波氣功圖集保留作美術來源，但遊戲不載入或使用。元氣玉及其餘 48 招維持 v11 特效；傷害、MP、冷卻和鳴人的分身平衡維持現行規則。

此次還原再次通過全部 50 招、左右合共 100 次施放，以及六種較重特效的正常速度測試。畫面與報告位於 `artifacts/pet-playtest/kamehameha-classic/`，悟空只載入元氣玉的專用圖集。
