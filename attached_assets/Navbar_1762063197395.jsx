import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const links = [
    { name: "Home", href: "/" },
    { name: "About", href: "/about" },
    { name: "Courses", href: "/courses" },
    { name: "Contact", href: "/contact" },
  ];

  return (
    <>
      <nav className="fixed w-full z-50 bg-white/95 backdrop-blur-md shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-9 h-9 flex items-center justify-center rounded-md bg-blue-500 text-white font-bold">
                L1
              </div>
              <span className="font-semibold text-lg text-gray-700">LearnOne</span>
            </Link>

            <div className="hidden md:flex items-center space-x-6">
              {links.map((l) => (
                <Link
                  key={l.name}
                  to={l.href}
                  className={`text-gray-700 hover:text-blue-600 transition ${
                    location.pathname === l.href ? 'text-blue-600 font-semibold' : ''
                  }`}
                >
                  {l.name}
                </Link>
              ))}
              <Link
                to="/login"
                className="px-4 py-2 rounded-md bg-blue-500 text-white transform transition-transform duration-200 hover:text-white focus:text-white hover:scale-105 hover:-translate-y-0.5 hover:shadow-lg hover:bg-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                Login
              </Link>
            </div>

            <button
              onClick={() => setOpen((s) => !s)}
              className="md:hidden p-2 text-gray-700"
            >
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {open && (
          <div className="md:hidden bg-white/95 backdrop-blur-md shadow">
            {links.map((l) => (
              <Link
                key={l.name}
                to={l.href}
                onClick={() => setOpen(false)}
                className={`block px-6 py-3 border-b border-gray-100 text-gray-700 hover:bg-gray-50 ${
                  location.pathname === l.href ? 'text-blue-600 font-semibold bg-blue-50' : ''
                }`}
              >
                {l.name}
              </Link>
            ))}
            <div className="px-6 py-4">
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-md bg-blue-500 text-white transform transition-transform duration-200 hover:text-white focus:text-white hover:scale-105 hover:-translate-y-0.5 hover:shadow-lg hover:bg-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 block text-center"
              >
                Login
              </Link>
            </div>
          </div>
        )}
      </nav>
    </>
  );
}
