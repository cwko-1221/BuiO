'use strict';

function isFractionQuestion(question) {
  return Boolean(question && (
    question.answerType === 'fraction'
    || question.answerType === 'mixed'
    || (question.tag && question.tag.startsWith('frac_'))
  ));
}

function isDecimalArithmeticQuestion(question) {
  return Boolean(question && [
    'add_up_to_3n', 'sub_up_to_3n', 'mix_3n_4d',
    'mul_by_powers10', 'mul_by_decimal_scales', 'mul_decimal_or_integer',
    'div_by_powers10', 'div_by_decimal_scales', 'div_decimal_general',
    'mix_decimal_or_integer_up_to_4',
    'convert_decimal_fraction', 'convert_decimal_percent', 'convert_percent_fraction',
    'linear_equation_easy_2',
  ].includes(question.tag));
}

function fractionAnswerFormat(question) {
  if (!isFractionQuestion(question)) return null;
  const type = question.answerType || 'fraction';
  const numerator = question.answerNumerator ?? question.correctAnswer;
  const denominator = question.answerDenominator ?? question.denominator;
  const fields = type === 'mixed'
    ? [
        { name: 'whole', maxLength: String(Math.abs(question.answerWhole || 0)).length },
        { name: 'numerator', maxLength: String(Math.abs(numerator)).length },
        { name: 'denominator', maxLength: String(Math.abs(denominator)).length },
      ]
    : [
        { name: 'numerator', maxLength: String(Math.abs(numerator)).length },
        { name: 'denominator', maxLength: String(Math.abs(denominator)).length },
      ];
  return { type, fields };
}

function gradeAnswer(question, rawUserAnswer, rawUserDenominator, rawUserNumerator, rawUserWhole) {
  if (isFractionQuestion(question)) {
    const numerator = parseInt(rawUserNumerator ?? rawUserAnswer, 10);
    const denominator = parseInt(rawUserDenominator, 10);
    const answerType = question.answerType || 'fraction';
    const whole = answerType === 'mixed' ? parseInt(rawUserWhole, 10) : 0;
    const expectedNumerator = question.answerNumerator ?? question.correctAnswer;
    const expectedDenominator = question.answerDenominator ?? question.denominator;
    const expectedWhole = question.answerWhole || 0;
    const valid = Number.isInteger(numerator)
      && Number.isInteger(denominator)
      && denominator > 0
      && numerator >= 0
      && (answerType !== 'mixed' || numerator < denominator)
      && (answerType !== 'mixed' || (Number.isInteger(whole) && whole >= 0));
    const isCorrect = valid
      && numerator === expectedNumerator
      && denominator === expectedDenominator
      && (answerType !== 'mixed' || whole === expectedWhole);
    const userValue = valid ? whole + numerator / denominator : null;
    const correctValue = expectedWhole + expectedNumerator / expectedDenominator;
    const userDisplay = valid
      ? (answerType === 'mixed' ? `${whole} ${numerator}/${denominator}` : `${numerator}/${denominator}`)
      : '';
    const correctDisplay = answerType === 'mixed'
      ? `${expectedWhole} ${expectedNumerator}/${expectedDenominator}`
      : `${expectedNumerator}/${expectedDenominator}`;
    return {
      userAnswer: userValue,
      userAnswerDisplay: userDisplay,
      correctAnswerValue: correctValue,
      correctAnswerDisplay: correctDisplay,
      isCorrect,
    };
  }

  const rawAnswer = String(rawUserAnswer ?? '').trim();
  const decimalQuestion = isDecimalArithmeticQuestion(question);
  const validDecimal = !decimalQuestion || /^\d+(?:\.\d{1,6})?$/.test(rawAnswer);
  const userAnswer = decimalQuestion
    ? (validDecimal ? Number(rawAnswer) : null)
    : parseFloat(rawUserAnswer);
  return {
    userAnswer,
    userAnswerDisplay: userAnswer,
    correctAnswerValue: question.correctAnswer,
    correctAnswerDisplay: question.correctAnswer,
    isCorrect: validDecimal && (decimalQuestion
      ? Math.round(userAnswer * 1000000) === Math.round(question.correctAnswer * 1000000)
      : userAnswer === question.correctAnswer),
  };
}


// Pure, read-only feedback shared by HTTP and the persistent transport.
// Persistence still regrades the full set inside its existing transaction.
function gradeQuizAnswer(session, attempt = {}, requireQuizId = false) {
  if (!session?.studentId) return { status: 401, success: false, message: '請先登入' };
  for (const key of ['index', 'quizId', 'userAnswer', 'userNumerator', 'userDenominator', 'userWhole', 'timeTaken']) {
    const value = attempt[key];
    if (value != null && (typeof value !== 'string' && typeof value !== 'number' || typeof value === 'string' && value.length > 256 || typeof value === 'number' && !Number.isFinite(value))) {
      return { status: 400, success: false, message: '答案資料格式不正確，請重試。' };
    }
  }
  const quiz = session.currentQuiz;
  if (!quiz?.length) return { status: 400, success: false, message: '沒有進行中的測驗，請先取得題目' };
  if ((requireQuizId || attempt.quizId) && attempt.quizId !== session.currentQuizId) {
    return { status: 409, success: false, message: '測驗已更改，請重新載入。' };
  }
  const question = quiz.find(q => q.index === Number(attempt.index));
  if (!question) return { status: 400, success: false, message: '找不到這一題，請重新載入。' };
  const graded = gradeAnswer(question, attempt.userAnswer, attempt.userDenominator, attempt.userNumerator, attempt.userWhole);
  return {
    status: 200, success: true,
    result: {
      index: question.index, questionText: question.questionText,
      correctAnswer: graded.correctAnswerDisplay, userAnswer: graded.userAnswerDisplay,
      isCorrect: graded.isCorrect, timeTaken: Math.max(0, Math.round(Number(attempt.timeTaken) || 0)), tag: question.tag,
    },
  };
}

module.exports = { gradeAnswer, fractionAnswerFormat, gradeQuizAnswer };
