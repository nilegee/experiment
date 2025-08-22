import React from 'react';
import { NavLink } from 'react-router-dom';
import { CheckSquare, StickyNote, Calendar as CalendarIcon, FileText } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
}

const linkClasses = ({ isActive }: { isActive: boolean }) =>
  `flex items-center py-2 px-4 rounded hover:bg-gray-200 ${isActive ? 'bg-gray-200' : ''}`;

const navItems = [
  { to: '/todo', label: 'Todo', icon: CheckSquare },
  { to: '/notes', label: 'Notes', icon: StickyNote },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon },
  { to: '/hr-update', label: 'HR Update', icon: FileText },
];

const Sidebar: React.FC<SidebarProps> = ({ isOpen }) => {
  return (
    <div
      className={`bg-white shadow-lg w-64 space-y-6 py-7 px-2 absolute inset-y-0 left-0 transform ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } transition duration-200 ease-in-out lg:relative lg:translate-x-0`}
    >
      <nav className="space-y-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkClasses}>
            <Icon className="w-4 h-4 mr-2" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

export default Sidebar;
