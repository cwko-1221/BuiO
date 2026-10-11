import { Routes, Route } from 'react-router-dom';
import { Component } from 'react';
import Home from './components/Home';
import Teacher from './components/Teacher';
import Student from './components/Student';
import ClassTeacher from './components/ClassTeacher';
import ClassStudent from './components/ClassStudent';

class LoadingBoundary extends Component {
  state = { waiting: false };
  static getDerivedStateFromError() { return { waiting: true }; }
  componentDidCatch(error) { console.warn('[whiteboard] Preparing a fresh page', error); }
  render() {
    if (this.state.waiting) return <main className="buio-loading-panel" role="status"><span className="buio-spinner" aria-hidden="true" /><span>正在準備畫面… 請重新載入以繼續。</span><button onClick={() => window.location.reload()}>重新載入</button></main>;
    return this.props.children;
  }
}

function App() {
  return (
    <LoadingBoundary>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/teacher" element={<Teacher />} />
      <Route path="/student" element={<Student />} />
      <Route path="/class-teacher" element={<ClassTeacher />} />
      <Route path="/class-student" element={<ClassStudent />} />
    </Routes>
    </LoadingBoundary>
  );
}

export default App;
