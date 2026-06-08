export const state = {
  loggedIn: false,
  currentUser: null,
  activeView: 'dashboard',
  loginError: '',
  loginLoading: false,
  mathSsoStatus: '',
  studentsList: [],
  studentsLoaded: false,
  adminUnlocked: false,
};

export function updateState(newState) {
  Object.assign(state, newState);
}
