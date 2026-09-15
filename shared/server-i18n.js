'use strict';

// Every module answers the browser with Chinese `message` text — validation
// errors, confirmations, import summaries. Rewriting each route would mean
// touching a hundred files and rewording each one at its call site, so instead
// the translation happens once, on the way out: res.json is wrapped and any
// message/reason/error field that matches a known Chinese string is swapped for
// its English twin. Anything not on the list is passed through untouched, so a
// student's name or a question's text can never be mangled by a near-miss.

const EXACT = new Map(Object.entries({
  // --- auth / accounts (math-app/routes/auth.js) -------------------------
  '登入成功': 'Signed in',
  '已登出': 'Signed out',
  '請輸入學號和密碼': 'Enter your ID and password',
  '學號不存在': 'That ID does not exist',
  '密碼錯誤': 'Wrong password',
  '未登入': 'Not signed in',
  '服務暫時繁忙，請稍後再試': 'The service is temporarily busy. Please try again shortly.',
  '請先登入': 'Please sign in first',
  '請先登入。': 'Please sign in first.',
  '請先登入平台。': 'Please sign in to the platform first.',
  '權限不足，僅限教師存取': 'Teachers only',
  '請先輸入 Admin 密碼': 'Enter the Admin password first',
  'Admin 已解鎖': 'Admin unlocked',
  'Admin 密碼不正確': 'Wrong Admin password',
  '不支援的語言': 'Unsupported language',
  '語言設定已更新': 'Language updated',
  '參數不完整': 'Some details are missing',
  '缺少學號或姓名': 'Missing ID or name',
  '請填寫完整資訊 (學號/教師編號、姓名、密碼)': 'Please fill in every field (ID, name, password)',
  '學號格式不正確': 'That ID is not in a valid format',
  '無效的學生 ID': 'Invalid student ID',
  '學號屬於教師帳戶': 'That ID belongs to a teacher account',
  '此帳號已經存在': 'That account already exists',
  '帳號建立成功': 'Account created',
  '帳號已成功刪除': 'Account deleted',
  '無法刪除自己目前登入的帳號': 'You cannot delete the account you are signed in with',
  '找不到該帳號': 'Account not found',
  '更新成功': 'Updated',
  '不允許更新此欄位': 'That field cannot be updated',
  '密碼最少需要 6 個字元': 'A password needs at least 6 characters',
  '班號必須是 1 至 99 的整數': 'Class number must be a whole number from 1 to 99',
  '請提供學生資料': 'Please supply the student rows',
  '每次最多匯入 200 名學生': 'Up to 200 students can be imported at a time',
  'Excel 內有重複學號': 'That Excel file has duplicate student IDs',

  // --- quiz / stats (math-app) ------------------------------------------
  '沒有進行中的測驗': 'No quiz is in progress',
  '沒有進行中的測驗，請先取得題目': 'No quiz in progress — fetch some questions first',
  '請提供答案陣列': 'Please supply the answers array',
  '答案已提交': 'Answers submitted',
  '此題型不在你的年級範圍。': 'That question type is outside your year level.',
  '學年不正確': 'Invalid academic year',
  '班級不正確，只支援 P1 至 P6。': 'Invalid class — only P1 to P6 are supported.',
  '請提供要停用的級別。': 'Please say which levels to switch off.',
  '至少要保留一個級別，否則學生沒有題目可以做。': 'Keep at least one level on, or students will have nothing to answer.',
  '未知的題目級別：': 'Unknown question level: ',

  // --- homework ---------------------------------------------------------
  '科長設定已儲存': 'Monitor settings saved',
  '記錄已更新': 'Record updated',
  '記錄已刪除': 'Record deleted',
  '請為所有學生選擇狀態': 'Choose a status for every student',
  '學生狀態資料不正確': 'The student status data is not valid',
  '請新增 1 至 12 份功課': 'Add between 1 and 12 pieces of homework',

  // --- assessment report ------------------------------------------------
  '只限老師使用': 'Teachers only',
  '請選擇 Excel 檔案': 'Please choose an Excel file',
  '檔案不是有效的 .xls 或 .xlsx Excel 檔案': 'That file is not a valid .xls or .xlsx workbook',
  'Excel 內沒有可用的考評工作表': 'That workbook has no usable assessment sheets',
  '此項目沒有原始 Excel 檔案': 'This entry has no original Excel file',
  '無法讀取已解析的考評資料': 'Could not read the parsed assessment data',
  '沒有可遷移的考評資料': 'There is no assessment data to migrate',
  '遷移資料缺少檔名': 'The migration data has no filename',

  // --- Cantonese module -------------------------------------------------
  '找不到作業': 'Assignment not found',
  '找不到項目': 'Item not found',
  '找不到題目': 'Question not found',
  '找不到該題目': 'Question not found',
  '找不到嘗試': 'Attempt not found',
  '部分題目找不到': 'Some questions could not be found',
  '缺少 assignmentId': 'Missing assignmentId',
  '缺少 assignmentId 或 itemId': 'Missing assignmentId or itemId',
  '缺少 category': 'Missing category',
  '缺少 category / traditionalText / englishMeaning': 'Missing category / traditionalText / englishMeaning',
  '缺少 category 或 itemIds': 'Missing category or itemIds',
  '缺少 file': 'Missing file',
  '缺少 text': 'Missing text',
  '缺少 targetClassname / targetGroup / title': 'Missing targetClassname / targetGroup / title',
  '缺少作業或題目資料': 'Missing assignment or question data',
  '缺少音檔': 'Missing audio file',
  '只接受圖片檔': 'Image files only',
  '必須提供 5 個練習項目': 'Exactly 5 practice items are required',
  '請剛好選擇 5 題': 'Pick exactly 5 questions',
  '每個項目都需要中文與英文翻譯': 'Every item needs both the Chinese and the English',
  '該類別已存在相同的題目': 'That category already has this question',
  'Azure 粵語發音評估尚未設定。': 'Azure Cantonese pronunciation scoring is not configured.',
  'Azure 粵語語音辨識尚未設定。': 'Azure Cantonese speech recognition is not configured.',
  'Azure 語音服務等候逾時，請再試一次。': 'The Azure speech service timed out. Please try again.',
  'Google TTS 尚未設定。': 'Google TTS is not configured.',
  'Supabase Storage 尚未設定。': 'Supabase Storage is not configured.',
  '缺少發音評估參考文字。': 'The pronunciation check has no reference text.',
  '題目的粵拼資料不完整，今次不評分。': 'This question is missing Jyutping data, so it will not be scored.',
  '未取得音素層級分數，今次結果不會當作通過。': 'No phoneme-level score came back, so this attempt will not count as a pass.',
  '未能清楚辨識讀音，請再錄一次。': 'That reading was not clear enough — please record again.',
  '辨識信心太低，今次不評分，請在較近咪高峰的位置再錄。': 'Recognition confidence was too low to score. Move closer to the microphone and record again.',
  '同一時間評分的同學太多，請等幾秒再按錄音。': 'Too many classmates are being scored right now. Wait a few seconds and record again.',
  '錄音內容是空的，請重新錄音。': 'The recording is empty. Please record again.',
  '錄音太短，請按下錄音後完整讀出答案。': 'That recording is too short — press record and read the whole answer.',
  '收音太小聲，請把 iPad 或咪高峰移近一點再試。': 'That was too quiet. Move the iPad or microphone closer and try again.',
  '環境聲音太嘈，未能公平評分；請靠近咪高峰再試。': 'It is too noisy to score fairly. Move closer to the microphone and try again.',
  '聲音過大而失真，請稍為遠離咪高峰再試。': 'That was loud enough to distort. Move back a little and try again.',
  '錄音必須是 WAV 格式。': 'The recording must be a WAV file.',
  '錄音必須是單聲道 16-bit PCM WAV。': 'The recording must be mono 16-bit PCM WAV.',
  'WAV 錄音缺少音訊資料。': 'The WAV recording has no audio data.',
  'WAV 錄音資料不完整。': 'The WAV recording is incomplete.',

  // --- English spelling -------------------------------------------------
  '每個單字必須是 2–12 個英文字母': 'Each word must be 2–12 English letters',

  // --- Phonics ----------------------------------------------------------
  '只可選擇英式或美式英語': 'Choose either British or American English',
  '只有老師可以預覽口音。': 'Only teachers can preview the accent.',
  '教師預覽不會寫入學生進度': 'Teacher previews are not written to student progress',
  '班級無效': 'Invalid class',
  '學年不存在': 'That academic year does not exist',
  '學年無效': 'Invalid academic year',
  '找不到這個 Phonics 單字': 'That phonics word was not found',
  '無效的 Phonics 單字。': 'Invalid phonics word.',
  'audioType 只可為 word、segment 或 blend': 'audioType must be word, segment or blend',
  'segmentIndex 無效': 'Invalid segmentIndex',
  'blendLength 無效': 'Invalid blendLength',

  // --- Quiz games / question banks --------------------------------------
  '只有老師可以選擇課堂題庫。': 'Only teachers can choose the class question bank.',
  '缺少題庫名稱。': 'The question bank needs a name.',
  '至少需要一條題目。': 'At least one question is needed.',
  '題庫不存在。': 'That question bank does not exist.',
  '題庫不存在或沒有題目。': 'That question bank does not exist, or has no questions.',
  '題庫不存在或無權限。': 'That question bank does not exist, or is not yours.',
  '示範題庫無法修改。': 'The demo question bank cannot be edited.',
  '示範題庫無法刪除。': 'The demo question bank cannot be deleted.',
  '遊戲題庫需要 Postgres 資料庫（開發模式可使用示範題庫）。': 'Game question banks need a Postgres database (the demo bank works in development).',
  '未有學生加入。': 'No students have joined yet.',
  '遊戲已經結束。': 'The game is over.',
  '無法產生房間代碼': 'Could not generate a room code',
  '搵唔到呢個房間，請檢查代碼。': 'That room could not be found — check the code.',

  // --- Tower defence ----------------------------------------------------
  '請先加入老師建立的塔防房間。': 'Join your teacher’s tower-defence room first.',
  '你尚未加入這個塔防房間。': 'You have not joined this tower-defence room.',
  '老師已結束這個課堂。': 'Your teacher has ended this class.',
  '老師尚未開始，或課堂已經結束。': 'Your teacher has not started yet, or the class has ended.',
  '這個課堂已經結束。': 'This class has ended.',
  '這條題目已經失效。': 'That question is no longer valid.',
  '遊戲答題連線已失效，請重新開始。': 'The quiz connection dropped. Please start again.',
  '找不到這個房間，請重新選擇。': 'That room was not found. Please pick again.',
  '找不到所選題庫。': 'The chosen question bank was not found.',
  '目前只可使用內置題庫。': 'Only the built-in question bank is available right now.',
  '塔防題庫的每一題必須有四個選項。': 'Every tower-defence question needs four choices.',
  '房間狀態不正確。': 'The room is not in the right state.',
  '無法選擇這個戰場。': 'That battlefield cannot be chosen.',
  '戰役已經開始，不能更換戰場。': 'The campaign has started — the battlefield cannot be changed.',
  '暫時無法建立房間代碼，請再試一次。': 'Could not create a room code just now. Please try again.',

  // --- maths: question-type names, categories and tiers -----------------
  // These reach the browser as `name`/`category` on tag rows, so translating
  // them here covers the quiz card, the radar chart and the type picker at once.
  '加法': 'Addition',
  '減法': 'Subtraction',
  '乘法': 'Multiplication',
  '除法': 'Division',
  '混合': 'Mixed',
  '其他': 'Other',
  '未知': 'Unknown',
  '銅': 'Bronze',
  '銀': 'Silver',
  '金': 'Gold',
  '鑽': 'Diamond',
  '2個數加法 (18以內、無進位)': 'Add 2 numbers (up to 18, no carrying)',
  '2個數加法 (18以內、有進位)': 'Add 2 numbers (up to 18, with carrying)',
  '2個數減法 (18以內、無退位)': 'Subtract 2 numbers (up to 18, no borrowing)',
  '2個數加法 (2位數、有進位、和<100)': 'Add 2 numbers (2-digit, carrying, sum < 100)',
  '3個數加法 (2位數、無進位、和<100)': 'Add 3 numbers (2-digit, no carrying, sum < 100)',
  '3個數加法 (2位數、有進位、和<100)': 'Add 3 numbers (2-digit, carrying, sum < 100)',
  '2個數加法 (3位數、有進位、和<1000)': 'Add 2 numbers (3-digit, carrying, sum < 1000)',
  '3個數加法 (3位數、有進位、和<1000)': 'Add 3 numbers (3-digit, carrying, sum < 1000)',
  '2個數減法 (3位數、無退位)': 'Subtract 2 numbers (3-digit, no borrowing)',
  '2個數減法 (3位數、有退位)': 'Subtract 2 numbers (3-digit, borrowing)',
  '3個數加減混合 (3位數、由左至右、結果<1000)': 'Add and subtract 3 numbers (3-digit, left to right, result < 1000)',
  '個位乘個位 (2/3/4/5/10 乘法表)': 'Single × single (2/3/4/5/10 times tables)',
  '個位乘個位 (6/7/8/9 乘法表)': 'Single × single (6/7/8/9 times tables)',
  '表內除法 (無餘數)': 'Times-table division (no remainder)',
  '表內除法 (有餘數，只寫商)': 'Times-table division (remainder, quotient only)',
  '2位數乘1位數 (無進位)': '2-digit × 1-digit (no carrying)',
  '2位數乘1位數 (有進位)': '2-digit × 1-digit (with carrying)',
  '3位數乘1位數 (無進位)': '3-digit × 1-digit (no carrying)',
  '3位數乘1位數 (有進位)': '3-digit × 1-digit (with carrying)',
  '3個數連乘': 'Multiply 3 numbers',
  '2位數÷1位數 (有餘數，只寫商)': '2-digit ÷ 1-digit (remainder, quotient only)',
  '3位數÷1位數 (無餘數)': '3-digit ÷ 1-digit (no remainder)',
  '3位數÷1位數 (有餘數，只寫商)': '3-digit ÷ 1-digit (remainder, quotient only)',
  '3個數四則混合 (先乘除後加減、無括號)': 'Mixed operations, 3 numbers (× ÷ before + −, no brackets)',
  '3個數四則混合 (有小括號)': 'Mixed operations, 3 numbers (with parentheses)',
  '2位數乘2位數 (無進位)': '2-digit × 2-digit (no carrying)',
  '2位數乘2位數 (有進位)': '2-digit × 2-digit (with carrying)',
  '3位數乘2位數 (無進位)': '3-digit × 2-digit (no carrying)',
  '3位數乘2位數 (有進位)': '3-digit × 2-digit (with carrying)',
  '2位數÷2位數 (有退位、無餘數)': '2-digit ÷ 2-digit (borrowing, no remainder)',
  '2位數÷2位數 (有退位、有餘數，只寫商)': '2-digit ÷ 2-digit (borrowing, remainder, quotient only)',
  '3位數÷2位數 (有退位、無餘數)': '3-digit ÷ 2-digit (borrowing, no remainder)',
  '3位數÷2位數 (有退位、有餘數，只寫商)': '3-digit ÷ 2-digit (borrowing, remainder, quotient only)',
  '4個數四則混合 (含小括號)': 'Mixed operations, 4 numbers (with parentheses)',
  '4個數四則混合 (含中括號)': 'Mixed operations, 4 numbers (with square brackets)',
  '兩位數加法 (無進位)': '2-digit addition (no carrying)',
  '兩位數減法 (無退位)': '2-digit subtraction (no borrowing)',
  '兩位數÷一位數 (整除)': '2-digit ÷ 1-digit (exact)',
  '三位數÷一位數 (商中間有零)': '3-digit ÷ 1-digit (zero inside the quotient)',
  '三位數÷一位數 (商尾數有零)': '3-digit ÷ 1-digit (zero at the end of the quotient)',
  '需要大量練習，建議從基礎概念重新學習': 'Needs a lot of practice — go back to the basics',
  '需要加強練習，注意計算步驟': 'Needs more practice — watch the working steps',
  '接近達標，再多練習幾次即可掌握': 'Nearly there — a few more rounds should do it',
  '表現良好，繼續保持': 'Doing well — keep it up',

  '你未獲委任為科長，無權進入欠交功課模組。': 'You are not a subject monitor, so the missing-homework module is not open to you.',
  '科任老師設定已儲存': 'Subject-teacher settings saved',
  '學年或班別不正確': 'The academic year or class is not valid',
  '科任老師設定資料不正確': 'The subject-teacher settings are not valid',
  '任教老師必須是現有教師帳戶': 'The assigned teacher must be an existing teacher account',
  '你未獲委任教授此班別及科目': 'You are not assigned to teach this class and subject',
  '老師已結束課堂': 'Your teacher has ended the class',
  '預覽學生': 'Preview student',

  // --- homework subjects (sent as `name` on each subject row) -----------
  '中文 A組': 'Chinese, Group A',
  '中文 B組': 'Chinese, Group B',
  '英文 A組': 'English, Group A',
  '英文 B組': 'English, Group B',
  '數學 A組': 'Maths, Group A',
  '數學 B組': 'Maths, Group B',
  '常識': 'General Studies',
  '人文': 'Humanities',
  '科學': 'Science',
  '視藝': 'Visual Arts',
  '音樂': 'Music',
  '體育': 'PE',
  '電腦': 'Computing',
  '普通話': 'Putonghua',

  // --- phonics accents (sent as accentLabel and inside the accents map) ---
  '英式英語': 'British English',
  '美式英語': 'American English',

  // --- classroom sockets (acks, not res.json — translated in the browser) --
  '建立房間失敗。': 'Could not create the room.',
  '老師已關閉房間。': 'Your teacher closed the room.',
  '老師已離開，房間已關閉。': 'Your teacher left, so the room has closed.',

  // --- names of the banks and games that ship with the platform ----------
  '晶核學院綜合題庫': 'Bastion Academy Mixed Bank',
  '示範題庫（常識問答）': 'Demo Bank (General Knowledge)',
  '唔好望落嚟': 'Don’t Look Down',
  '晶核守衛戰': 'Crystal Bastion',

  // --- Pet paradise -----------------------------------------------------
  '學生功能只供學生使用。': 'This is a student-only feature.',
  '缺少防重複提交識別碼。': 'Missing the duplicate-submission token.',
  '請提供防止重複提交識別碼。': 'Please supply a duplicate-submission token.',
}));

// Messages the server builds at runtime, matched against the finished string.
const PATTERNS = [
  [/^已更新 (\d+) 項狀態$/, 'Updated $1 status entries'],
  [/^請填寫第 (\d+) 份功課名稱$/, 'Give homework #$1 a name'],
  [/^成功新增 (\d+) 名學生，更新 (\d+) 名學生$/, 'Added $1 students and updated $2'],
  [/^所有學生已升級；現時學年為 (.+)$/, 'All students moved up — the current academic year is $1'],
  [/^找不到第 (\d+) 題$/, 'Question $1 was not found'],
  [/^請先完成今天的隨機練習（(\d+)\/(\d+)）。$/, 'Finish today’s random practice first ($1/$2).'],
  [/^未知的標籤: (.+)$/, 'Unknown tag: $1'],
  [/^(P[1-6]) · A組$/, '$1 · Group A'],
  [/^(P[1-6]) · B組$/, '$1 · Group B'],
  [/^(P[1-6])（全級）$/, '$1 (whole year)'],
  [/^仍有 (\d+) 位學生未選擇戰場。$/, '$1 students have not chosen a battlefield yet.'],
  [/^「(.+)」未設定正確答案。$/, '“$1” has no correct answer set.'],
  [/^「(.+)」需要 2-4 個選項。$/, '“$1” needs 2–4 choices.'],
  [/^題庫「(.+)」少於 (\d+) 題$/, 'Question bank “$1” has fewer than $2 questions'],
  [/^第 (\d+) 個工作表沒有有效科目資料$/, 'Sheet $1 has no usable subject data'],
  [/^第 (\d+) 個工作表沒有有效學生資料$/, 'Sheet $1 has no usable student data'],
  [/^第 (\d+) 個工作表缺少 (.+)$/, 'Sheet $1 is missing $2'],
  [/^第 (\d+) 個工作表資料格式不正確$/, 'Sheet $1 is not in the expected format'],
  [/^第 (\d+) 個工作表與同一檔案內另一工作表的學年、年級、班別及考績期重複$/,
   'Sheet $1 repeats the year, form, class and assessment period of another sheet in the same file'],
  [/^(.+) \(只寫商\)$/, '$1 (quotient only)'],
  [/^(.+) 無效$/, 'Invalid $1'],
];

function translate(text) {
  if (typeof text !== 'string' || !text) return text;
  const exact = EXACT.get(text);
  if (exact) return exact;
  for (const [pattern, replacement] of PATTERNS) {
    if (pattern.test(text)) return text.replace(pattern, replacement);
  }
  return text;
}

// Only fields that carry prose are rewritten, and only when the whole string
// matches an entry above. A teacher's own bank title or a student's name never
// matches, so it travels through untouched; the built-in banks do match, which
// is how their names follow the reader's language.
const TEXT_FIELDS = new Set([
  'message', 'reason', 'error', 'hint', 'detail',
  'title', 'setTitle', 'name', 'tagName', 'label', 'questionText',
  'category', 'advice', 'suggestion',
  'accentLabel', 'en-gb', 'en-us',
]);

function translateBody(value, depth = 0) {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map(item => translateBody(item, depth + 1));
  if (typeof value !== 'object') return value;
  const out = Array.isArray(value) ? [] : {};
  for (const [key, item] of Object.entries(value)) {
    if (TEXT_FIELDS.has(key) && typeof item === 'string') out[key] = translate(item);
    else out[key] = translateBody(item, depth + 1);
  }
  return out;
}

function resolveLang(req) {
  if (req?.session?.language) return req.session.language;
  const raw = req?.headers?.cookie;
  if (raw) {
    const match = /(?:^|;\s*)buiLang=([^;]+)/.exec(raw);
    if (match) return decodeURIComponent(match[1]);
  }
  return 'zh-HK';
}

function middleware(req, res, next) {
  if (resolveLang(req) !== 'en-US') return next();
  const original = res.json.bind(res);
  res.json = body => original(translateBody(body));
  next();
}

const api = { translate, translateBody, resolveLang, middleware };

// Socket.IO acknowledgements never pass through res.json, so the pages that
// talk over a socket load this same file in the browser and translate the
// message where they display it.
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.BuiServerI18n = api;
