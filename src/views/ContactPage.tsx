import React, { useState } from 'react';
import { useNavigate } from '../lib/router';
import Header from '../components/layout/Header';

interface ContactPageProps {
  darkMode: boolean;
  setDarkMode: (value: boolean | ((val: boolean) => boolean)) => void;
}

function ContactPage({ darkMode, setDarkMode }: ContactPageProps) {
  const navigate = useNavigate();
  // const [navOpen, setNavOpen] = useState(false);
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Header onBackToLanding={() => navigate('/')} darkMode={darkMode} setDarkMode={setDarkMode} />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-all duration-300 ease-in-out">
        <div className="flex justify-center items-center min-h-[calc(100vh-8rem)]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center w-full max-w-2xl">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-6">Contact</h1>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-8 leading-relaxed">
              <b>TeamMaker</b> is an innovative service that helps with team building and collaboration.<br/>
              We support fair and efficient team formation for various projects, study groups, workshops, and more.<br/>
              <br/>
              We continuously evolve to create better collaboration cultures.
            </p>
            <div className="mt-10 p-6 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <span className="block text-gray-600 dark:text-gray-400 mb-3 text-lg">Contact Email</span>
              <a href="mailto:rhcproc@gmail.com" className="text-blue-600 dark:text-blue-400 underline text-xl font-semibold hover:text-blue-800 dark:hover:text-blue-300 transition-colors">
                rhcproc@gmail.com
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ContactPage; 
