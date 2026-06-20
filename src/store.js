export const state = {
  loggedIn: false,
  currentUser: null,
  activeView: 'dashboard',
  loginError: '',
  loginLoading: false,
  mathSsoStatus: '',
  studentsList: [],
  studentsLoaded: false,
};

export function updateState(newState) {
  Object.assign(state, newState);
}
