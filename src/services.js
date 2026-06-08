import { state, updateState } from './store.js';

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
        return true;
      }
    }
  } catch { /* not logged in */ }
  return false;
}

export function clearSession() {
  return fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
}

export async function fetchActiveSessions(onUpdate) {
  try {
    const res = await fetch('/api/whiteboard/sessions');
    const data = await res.json();
    if (data.success) {
      onUpdate(data.sessions);
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

export async function fetchStudentsList() {
  try {
    const res = await fetch('/api/stats/teacher/all-users', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        updateState({ studentsList: data.students, studentsLoaded: true });
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
    body: JSON.stringify({ id, password })
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
