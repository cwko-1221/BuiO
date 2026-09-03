'use strict';

// Built-in demo question set so the game is playable without any teacher
// setup (and in JSON db mode where the Postgres question bank is offline).

module.exports = {
  id: 'demo',
  title: '示範題庫（常識問答）',
  questions: [
    { question: '1 + 1 = ?', choices: ['1', '2', '3', '4'], correctIndex: 1 },
    { question: '7 × 8 = ?', choices: ['54', '56', '63', '64'], correctIndex: 1 },
    { question: '100 − 45 = ?', choices: ['45', '50', '55', '65'], correctIndex: 2 },
    { question: '一星期有幾多日？', choices: ['5 日', '6 日', '7 日', '8 日'], correctIndex: 2 },
    { question: '「apple」嘅中文係？', choices: ['橙', '蘋果', '香蕉', '提子'], correctIndex: 1 },
    { question: '「dog」嘅中文係？', choices: ['貓', '狗', '鳥', '魚'], correctIndex: 1 },
    { question: '三角形有幾多隻角？', choices: ['2', '3', '4', '5'], correctIndex: 1 },
    { question: '水嘅化學式係？', choices: ['CO2', 'O2', 'H2O', 'NaCl'], correctIndex: 2 },
    { question: '12 ÷ 4 = ?', choices: ['2', '3', '4', '6'], correctIndex: 1 },
    { question: '香港位於中國嘅邊面？', choices: ['北面', '南面', '東北面', '西面'], correctIndex: 1 },
    { question: '「cat」嘅中文係？', choices: ['狗', '兔', '貓', '馬'], correctIndex: 2 },
    { question: '9 × 9 = ?', choices: ['72', '81', '89', '99'], correctIndex: 1 },
    { question: '一年有幾多個月？', choices: ['10', '11', '12', '13'], correctIndex: 2 },
    { question: '15 + 27 = ?', choices: ['32', '41', '42', '52'], correctIndex: 2 },
    { question: '「book」嘅中文係？', choices: ['筆', '書', '紙', '尺'], correctIndex: 1 },
    { question: '邊個係地球最大嘅海洋？', choices: ['大西洋', '印度洋', '太平洋', '北冰洋'], correctIndex: 2 },
    { question: '60 ÷ 5 = ?', choices: ['10', '11', '12', '15'], correctIndex: 2 },
    { question: '「red」係咩顏色？', choices: ['藍色', '紅色', '綠色', '黃色'], correctIndex: 1 },
    { question: '正方形有幾多條邊？', choices: ['3', '4', '5', '6'], correctIndex: 1 },
    { question: '8 × 6 = ?', choices: ['42', '46', '48', '54'], correctIndex: 2 },
  ],
};
