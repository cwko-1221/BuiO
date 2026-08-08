export const state = {
  loggedIn: false,
  currentUser: null,
  activeView: 'dashboard',
  loginError: '',
  loginLoading: false,
  mathSsoStatus: '',
  studentsList: [],
  studentsLoaded: false,
  homeworkAccess: false,
  homeworkPending: [],
  homeworkPendingLoaded: false,
};

export function updateState(newState) {
  Object.assign(state, newState);
}
