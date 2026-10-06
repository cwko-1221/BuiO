# 老師按年級及科組調整金幣

老師在「金幣調整」選擇「科組」後，依次選擇年級、科目及組別，例如 **P5 → 中文 → A組**。

- 年級及組別均須明確選擇；切換年級或科目會清除原有組別。
- 組別選單只顯示該年級、該科目現有的組別。沒有組別時不可預覽。
- 摘要及確認視窗顯示完整對象，例如「P5 中文 A組」，以及人數和總金額。
- 正數派發及負數扣款均只影響符合該年級、科目和組別的學生。全班及個別學生模式沿用原有行為。
- 三個選單最少高 56px；窄畫面改成直向排列。

## API

`POST /api/pet/teacher/grants/preview` 及 `POST /api/pet/teacher/grants/commit` 的科組請求必須包含：

```json
{
  "scope": "group",
  "grade": "P5",
  "groupField": "chineseGroup",
  "groupName": "A",
  "amount": 200,
  "note": "課堂表現"
}
```

`groupName` 使用老師名單提供的原值，例如 `A` 或 `A組`；`groupField` 可為 `chineseGroup`、`englishGroup`、`mathGroup`。提交須附上原有 `Idempotency-Key`。

年級按目前學年的學生編班資料判定。標準班別 `P1`–`P6` 及舊有班別如 `5A`、`P5B` 可對應至年級；畢業或無法識別的班別不會納入科組派發。缺少年級或年級／科組無效時，預覽及提交均拒絕處理，避免舊客戶端按同名組別跨年級派發。

`GET /api/pet/teacher/roster` 另提供 `grades`，每名學生另有 `grade`。

## 驗證

執行 `npm run check:pet-grant-grade-live`。測試使用隔離資料庫，包含多個年級的同名 A 組、不同班別格式及歷年編班，驗證前端選項、人數、確認名單、實際餘額、重複提交、扣款、權限及 iPad／手機版面。
