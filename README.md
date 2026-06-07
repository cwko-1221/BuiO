# 杯澳個人化學習平台 Prototype

一站式學習入口的第一版前端 prototype。學生登入後可在同一個 Dashboard 選擇不同模組，目前預留：

- 數學練習
- 互動白板
- 中文學習（未啟用）
- 英文學習（未啟用）

## 使用方式

```bash
npm run dev
```

打開 `http://127.0.0.1:3000`。

如果這部機未安裝 npm，也可以直接用 Node 執行：

```bash
node server.js
```

## 模組連結

進入平台後到「設定」頁，把現有 Math 和 Whiteboard 的部署網址貼上。白板只需要填前端根網址，平台會根據學生/老師身份自動加上 `/student` 或 `/teacher` 和 `room` 參數。

## 下一階段可接入

- 真正帳號登入
- 班級與學生資料庫
- Math 學習進度 API
- Whiteboard 房間建立 API
- 老師指派任務
- 更多學科模組
