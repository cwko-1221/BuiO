import { state, updateState } from './store.js';

let activeSessionsCache = [];

export function getActiveSessions() {
  return activeSessionsCache;
}

export async function checkSession() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.student) {
        updateState({
          currentUser: {
            id: data.student.id,
            name: data.student.name,
            role: data.student.role,
            className: data.student.className || '',
            language: data.student.language || 'zh-HK',
          },
          loggedIn: true
        });
        await fetchHomeworkInfo();
        return true;
      }
    }
  } catch { /* not logged in */ }
  return false;
}

export async function fetchHomeworkInfo() {
  try {
    const metaResponse = await fetch('/api/homework/meta', { credentials: 'include' });
    const meta = await metaResponse.json();
    const homeworkAccess = Boolean(metaResponse.ok && meta.success && meta.canAccess);
    let homeworkPending = [];
    if (state.currentUser?.role === 'student') {
      const pendingResponse = await fetch('/api/homework/pending', { credentials: 'include' });
      const pending = await pendingResponse.json();
      if (pendingResponse.ok && pending.success) homeworkPending = pending.pending || [];
    }
    updateState({ homeworkAccess, homeworkPending, homeworkPendingLoaded: true });
    return homeworkAccess;
  } catch {
    updateState({ homeworkAccess: false, homeworkPending: [], homeworkPendingLoaded: true });
    return false;
  }
}

export function clearSession() {
  return fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
}

export async function fetchActiveSessions(onUpdate) {
  try {
    const res = await fetch('/api/whiteboard/sessions');
    const data = await res.json();
    if (data.success) {
      const oldStr = JSON.stringify(activeSessionsCache);
      const newStr = JSON.stringify(data.sessions);
      if (oldStr !== newStr) {
        activeSessionsCache = data.sessions;
        if (onUpdate) onUpdate(data.sessions);
      }
    }
  } catch (e) {}
}

export function endTeacherSession(roomId) {
  return fetch('/api/whiteboard/sessions/end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId })
  });
}

export async function fetchStudentsList(academicYear = state.studentManagementYear || '') {
  try {
    const query = academicYear ? `?academicYear=${encodeURIComponent(academicYear)}` : '';
    const res = await fetch(`/api/stats/teacher/all-users${query}`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        updateState({
          studentsList: data.students,
          studentsLoaded: true,
          academicYears: data.academicYears || state.academicYears,
          currentAcademicYear: data.currentAcademicYear || state.currentAcademicYear,
          studentManagementYear: data.academicYear || academicYear || data.currentAcademicYear,
        });
        return true;
      }
    }
  } catch (e) {
    console.error('Fetch users error:', e);
  }
  return false;
}

export async function loginApi(id, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId: id, password })
  });
  return await res.json();
}

export async function addStudentApi(payload) {
  return fetch('/api/stats/teacher/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include'
  });
}

export async function deleteStudentApi(studentId) {
  return fetch(`/api/stats/teacher/students/${studentId}`, {
    method: 'DELETE',
    credentials: 'include'
  });
}
