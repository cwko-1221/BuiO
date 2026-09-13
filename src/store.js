export const state = {
  loggedIn: false,
  currentUser: null,
  activeView: 'dashboard',
  loginError: '',
  loginLoading: false,
  mathSsoStatus: '',
  studentsList: [],
  studentsLoaded: false,
  academicYears: [],
  currentAcademicYear: '2025-26',
  studentManagementYear: '',
  adminUnlocked: false,
  subjectTeacherYear: '',
  subjectTeacherClass: 'P1',
  subjectTeachers: [],
  subjectTeacherSubjects: [],
  subjectTeacherTeachers: [],
  subjectTeachersLoaded: false,
  subjectTeachersLoading: false,
  subjectTeacherError: '',
  homeworkAccess: false,
  homeworkPending: [],
  homeworkPendingLoaded: false,
};

export function updateState(newState) {
  Object.assign(state, newState);
}
