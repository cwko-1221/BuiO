import { state, updateState } from './store.js';
import { t } from './i18n.js';

let activeSessionsCache = [];
let sessionRequest = null;
let sessionGeneration = 0;
let nextSessionPoll = 0;
let sessionFailures = 0;
const sessionListeners = new Set();
const refreshSessions = () => { nextSessionPoll = 0; };
addEventListener('online', refreshSessions);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSessions(); });

export function getActiveSessions() {
  return activeSessionsCache;
}

async function requestAuth(path, timeoutMs, init) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new DOMException('Authentication request timed out', 'TimeoutError')), timeoutMs);
  });
  const request = (async () => {
    const options = { ...init, cache: 'no-store', signal: controller.signal };
    const response = window.BuiLoading
      ? await window.BuiLoading.fetch(path, options, { retries: 0, showStatus: false })
      : await fetch(path, options);
    const credentialError = response.status === 400 || response.status === 401;
    if ((!response.ok && !credentialError) || !response.headers.get('Content-Type')?.includes('application/json')) {
      throw new Error('Authentication service unavailable');
    }
    const data = await response.json();
    return response.ok ? data : { success: false, message: data?.message };
  })();
  try {
    // Bound the UI wait even if the browser has not yet settled the fetch or body read.
    return await Promise.race([request, deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

export async function checkSession() {
  try {
    const data = await requestAuth('/api/auth/me', 5000);
    if (data?.success && data.student) {
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
  } catch { /* Show the sign-in form if the session cannot be confirmed. */ }
  return false;
}

export async function fetchHomeworkInfo() {
  const generation = sessionGeneration, accountId = state.currentUser?.id;
  if (!state.loggedIn || !accountId) return false;
  const current = () => generation === sessionGeneration && state.loggedIn && state.currentUser?.id === accountId;
  const read = async url => {
    const response = await fetch(url, { credentials: 'include' });
    const data = await response.json();
    if (!response.ok || !data.success) throw Error('Homework information unavailable');
    return data;
  };
  // Neither request depends on the other. Publish each part as it arrives,
  // without delaying the authenticated portal or another account's session.
  const access = read('/api/homework/meta').then(meta => {
    if (current()) updateState({ homeworkAccess: Boolean(meta.canAccess) });
    return Boolean(meta.canAccess);
  }).catch(() => false);
  const pending = state.currentUser.role === 'student'
    ? read('/api/homework/pending').then(data => {
        if (current()) updateState({ homeworkPending: data.pending || [], homeworkHistory: data.history || [], homeworkPendingLoaded: true, homeworkPendingError: false });
      }).catch(() => { if (current()) updateState({ homeworkPendingLoaded: true, homeworkPendingError: true }); })
    : Promise.resolve();
  const [canAccess] = await Promise.all([access, pending]);
  return canAccess;
}

export function clearSession() {
  window.BuiReliable?.clear();
  sessionGeneration++;
  sessionRequest = null;
  nextSessionPoll = 0;
  sessionListeners.clear();
  activeSessionsCache = [];
  return fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
}

export async function fetchActiveSessions(onUpdate) {
  if (!state.loggedIn || document.hidden || Date.now() < nextSessionPoll) return;
  if (onUpdate) sessionListeners.add(onUpdate);
  if (sessionRequest) return sessionRequest;
  const generation = sessionGeneration;
  const accountId = state.currentUser?.id;
  sessionRequest = (async () => {
    try {
      const res = await fetch('/api/classroom/sessions', { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error('Session lookup failed');
      const data = await res.json();
      if (!data.success) throw new Error('Session lookup failed');
      if (generation !== sessionGeneration || state.currentUser?.id !== accountId || !state.loggedIn) return;
      const sessions = ['whiteboard', 'buzzer'].flatMap((type, index) => {
        const rows = index === 0 ? data.whiteboards : data.buzzers;
        return Array.isArray(rows) ? rows.map(row => ({ ...row, type })) : activeSessionsCache.filter(row => row.type === type);
      });
      sessionFailures = data.partial ? sessionFailures + 1 : 0;
      if (JSON.stringify(activeSessionsCache) !== JSON.stringify(sessions)) {
        activeSessionsCache = sessions;
        for (const listener of sessionListeners) listener(sessions);
      }
    } catch { sessionFailures++; }
    finally {
      if (generation === sessionGeneration) {
        nextSessionPoll = Date.now() + Math.min(30000, 10000 * 2 ** Math.min(sessionFailures, 2)) + Math.random() * 1000;
        sessionRequest = null;
        sessionListeners.clear();
      }
    }
  })();
  return sessionRequest;
}

export function endTeacherSession(roomId) {
  nextSessionPoll = 0;
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

export async function fetchSubjectTeacherSettings(academicYear = state.subjectTeacherYear || state.currentAcademicYear, className = state.subjectTeacherClass || 'P1') {
  try {
    const query = `?academicYear=${encodeURIComponent(academicYear)}&className=${encodeURIComponent(className)}`;
    const res = await fetch(`/api/homework/subject-teachers${query}`, { credentials: 'include' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || t('subject_teacher_load_failed'));
    updateState({
      subjectTeachers: data.assignments || [],
      subjectTeacherSubjects: data.subjects || [],
      subjectTeacherTeachers: data.teachers || [],
      subjectTeacherYear: data.academicYear || academicYear,
      subjectTeacherClass: data.className || className,
      subjectTeachersLoaded: true,
      subjectTeachersLoading: false,
      subjectTeacherError: '',
    });
    return true;
  } catch (error) {
    updateState({ subjectTeachersLoaded: true, subjectTeachersLoading: false, subjectTeacherError: error.message || t('subject_teacher_load_failed') });
    return false;
  }
}

export function loginApi(id, password) {
  return requestAuth('/api/auth/login', 12000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId: id, password })
  });
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
