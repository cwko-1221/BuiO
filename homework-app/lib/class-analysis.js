'use strict';

const { subjectById } = require('./domain');

function buildClassAnalysis(students, records) {
  const details = new Map(students.map(student => [student.id, []]));
  for (const record of records) for (const homework of record.homeworks || []) for (const item of homework.statuses || []) {
    if (item.status !== 'missing' || !details.has(item.studentId)) continue;
    details.get(item.studentId).push({
      date: record.date, subject: record.subject,
      subjectName: subjectById(record.subject)?.name || record.subject,
      homeworkId: homework.id, homework: homework.title, madeUp: Boolean(item.madeUp),
    });
  }
  const rows = students.map(student => ({
    ...student, missingCount: details.get(student.id).length, missingRecords: details.get(student.id),
  }));
  return { rows, totalMissing: rows.reduce((total, student) => total + student.missingCount, 0) };
}

module.exports = { buildClassAnalysis };
