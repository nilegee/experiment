import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './layout/Navbar';
import Sidebar from './layout/Sidebar';
import TodoApp from './apps/todo/TodoApp';
import NotesApp from './apps/notes/NotesApp';
import CalendarApp from './apps/calendar/CalendarApp';

const App: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <BrowserRouter>
      <div className="flex h-screen">
        <Sidebar isOpen={sidebarOpen} />
        <div className="flex-1 flex flex-col">
          <Navbar onMenuClick={() => setSidebarOpen((prev) => !prev)} />
          <main className="flex-1 p-4 overflow-y-auto">
            <Routes>
              <Route path="/" element={<Navigate to="/todo" replace />} />
              <Route path="/todo" element={<TodoApp />} />
              <Route path="/notes" element={<NotesApp />} />
              <Route path="/calendar" element={<CalendarApp />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
};

export default App;
