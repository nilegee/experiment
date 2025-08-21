import React from 'react';
import { NavLink } from 'react-router-dom';

interface SidebarProps {
  isOpen: boolean;
}

const linkClasses = ({ isActive }: { isActive: boolean }) =>
  `block py-2 px-4 rounded hover:bg-gray-200 ${isActive ? 'bg-gray-200' : ''}`;

const Sidebar: React.FC<SidebarProps> = ({ isOpen }) => {
  return (
    <div
      className={`bg-white shadow-lg w-64 space-y-6 py-7 px-2 absolute inset-y-0 left-0 transform ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } transition duration-200 ease-in-out lg:relative lg:translate-x-0`}
    >
      <nav className="space-y-2">
        <NavLink to="/todo" className={linkClasses}>
          Todo
        </NavLink>
        <NavLink to="/notes" className={linkClasses}>
          Notes
        </NavLink>
        <NavLink to="/calendar" className={linkClasses}>
          Calendar
        </NavLink>
      </nav>
    </div>
  );
};

export default Sidebar;
