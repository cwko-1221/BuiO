'use strict';

const { gradeQuizAnswer } = require('../engine/quiz-grading');
const i18n = require('../../shared/server-i18n');

module.exports = function registerQuizSocket(io) {
  const namespace = io.of('/math-quiz');
  namespace.use((socket, next) => {
    const session = socket.request.session;
    const quizId = socket.handshake.auth?.quizId;
    if (!session?.studentId || !quizId || quizId !== session.currentQuizId || !session.currentQuiz?.length) {
      return next(Object.assign(new Error('Quiz session unavailable'), { data: { status: session?.studentId ? 409 : 401 } }));
    }
    next();
  });
  namespace.on('connection', socket => {
    const session = socket.request.session;
    const lang = session.language === 'en-US' ? 'en-US' : 'zh-HK';
    const expires = Date.now() + 30 * 60 * 1000;
    let second = 0, count = 0;
    socket.on('quiz:grade', (attempt, reply) => {
      if (typeof reply !== 'function') return;
      const now = Math.floor(Date.now() / 1000);
      if (now !== second) { second = now; count = 0; }
      if (++count > 20) return reply({ status: 429, success: false, message: '請稍後再試。' });
      if (Date.now() >= expires) return reply({ status: 503, success: false, message: 'Quiz connection expired' });
      // The signed HTTP session supplies the questions and correct answers.
      // This event only returns feedback; it never writes marks or rewards.
      let data;
      try { data = gradeQuizAnswer(session, attempt && typeof attempt === 'object' ? attempt : {}, true); }
      catch { data = { status: 400, success: false, message: '答案資料格式不正確，請重試。' }; }
      reply(lang === 'en-US' ? i18n.translateBody(data) : data);
    });
  });
};
