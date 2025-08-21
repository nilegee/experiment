import React from 'react';

interface NavbarProps {
  onMenuClick: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ onMenuClick }) => {
  return (
    <nav className="bg-white shadow px-4 h-16 flex items-center">
      <button
        className="lg:hidden mr-4"
        onClick={onMenuClick}
        aria-label="Toggle Sidebar"
      >
        <svg
          className="w-6 h-6 text-gray-700"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <h1 className="text-xl font-semibold">My Dashboard</h1>
    </nav>
  );
};

export default Navbar;
