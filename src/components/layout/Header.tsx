import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Button from '../common/Button';
import Modal from '../common/Modal';
import UserProfile from '../auth/UserProfile';
import AuthModal from '../auth/AuthModal';
import { useNavigate, useLocation } from '../../lib/router';
import { getUnreadNotificationCount } from '../../services/notification/notificationService';
import NotificationModal from '../notification/NotificationModal';

interface HeaderProps {
  onBackToLanding?: () => void;
  title?: string;
  showBackButton?: boolean;
  darkMode?: boolean;
  setDarkMode?: (value: boolean | ((val: boolean) => boolean)) => void;
  onNavToggle?: (value: boolean | ((val: boolean) => boolean)) => void;
}

const Header: React.FC<HeaderProps> = ({ 
  onBackToLanding, 
  title = 'TeamMaker',
  showBackButton = true,
  darkMode = false,
  setDarkMode,
  onNavToggle
}) => {
  const { user, signInWithGoogle, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');
  const [navOpen, setNavOpen] = useState(false);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [showNotificationModal, setShowNotificationModal] = useState(false);

  // 로딩 타임아웃 설정 (5초 후 강제로 로딩 해제)
  React.useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => {
        setLoadingTimeout(true);
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      setLoadingTimeout(false);
    }
  }, [loading]);

  // 알림 개수 로드
  useEffect(() => {
    const loadNotificationCount = async () => {
      if (!user) {
        setUnreadNotificationCount(0);
        return;
      }

      try {
        const count = await getUnreadNotificationCount(user.id);
        setUnreadNotificationCount(count);
      } catch (error) {
        console.error('Failed to load notification count:', error);
      }
    };

    loadNotificationCount();
    
    // 30초마다 알림 개수 새로고침
    const interval = setInterval(loadNotificationCount, 30000);
    return () => clearInterval(interval);
  }, [user]);

  // const handleGoogleSignIn = async () => {
  //   try {
  //     await signInWithGoogle();
  //   } catch (error) {
  //     console.error('Google sign in failed:', error);
  //   }
  // };

  const handleSignOut = async () => {
    try {
      await signOut();
      setShowUserMenu(false);
      // Sign out 후 메인화면으로 이동
      navigate('/');
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const toggleUserMenu = () => {
    setShowUserMenu(!showUserMenu);
  };

  const openProfileModal = () => {
    setShowUserMenu(false);
    setShowProfileModal(true);
  };

  // 현재 경로에 따라 활성 메뉴 항목 결정
  const getActiveMenuItem = () => {
    const path = location.pathname;
    
    if (path === '/') {
      return 'home';
    } else if (path.includes('/workspaces') || path.includes('/workspace/')) {
      return 'workspaces';
    } else if (path === '/notifications') {
      return 'notifications';
    } else if (path === '/contact') {
      return 'contact';
    }
    
    return null;
  };

  const activeMenuItem = getActiveMenuItem();

  return (
    <>
      <header className="w-full bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              {/* 햄버거 메뉴 */}
              <button
                className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-800 focus:outline-none mr-2"
                onClick={() => {
                  setNavOpen(true);
                  onNavToggle?.(true);
                }}
                aria-label="Open navigation menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/30 dark:bg-white/10 text-gray-900 dark:text-white text-2xl font-bold">
                <span className="mr-2">🎲✨</span>
                <span className="hidden sm:inline">{title}</span>
              </span>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* 다크모드 토글 버튼 */}
              {setDarkMode && (
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  aria-label="Toggle dark mode"
                >
                  {darkMode ? (
                    <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4.22 2.03a1 1 0 011.41 0l.71.7a1 1 0 01-1.41 1.42l-.7-.71a1 1 0 010-1.41zM18 9a1 1 0 100 2h-1a1 1 0 100-2h1zm-2.03 4.22a1 1 0 010 1.41l-.7.71a1 1 0 01-1.42-1.41l.71-.7a1 1 0 011.41 0zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zm-4.22-2.03a1 1 0 00-1.41 0l-.71.7a1 1 0 001.41 1.42l.7-.71a1 1 0 000-1.41zM4 11a1 1 0 100-2H3a1 1 0 100 2h1zm2.03-4.22a1 1 0 00-1.41 0l-.71.7a1 1 0 001.41 1.42l.7-.71a1 1 0 000-1.41zM10 6a4 4 0 100 8 4 4 0 000-8z" /></svg>
                  ) : (
                    <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>
                  )}
                </button>
              )}
              
              {/* 알림 벨 아이콘 */}
              {user && (
                <button
                  onClick={() => setShowNotificationModal(true)}
                  className="relative p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  aria-label="Notifications"
                >
                  <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM4.828 7l2.586 2.586a2 2 0 002.828 0L12.828 7H4.828zM4 5h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2z" />
                  </svg>
                  {unreadNotificationCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                    </span>
                  )}
                </button>
              )}
              
              {loading && !loadingTimeout ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span className="text-sm text-gray-500">Loading...</span>
                </div>
              ) : user ? (
                <div className="relative">
                  <button
                    onClick={toggleUserMenu}
                    className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center space-x-2">
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={user.displayName}
                          className="w-8 h-8 rounded-full border-2 border-gray-200"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                          <span className="text-white text-sm font-medium">
                            {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                          </span>
                        </div>
                      )}
                      <span className="text-sm font-medium text-gray-700 hidden sm:block">
                        {user.displayName || user.email}
                      </span>
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <div className="flex items-center space-x-3">
                          {user.photoURL ? (
                            <img
                              src={user.photoURL}
                              alt={user.displayName}
                              className="w-10 h-10 rounded-full"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                              <span className="text-white text-sm font-medium">
                                {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                              </span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {user.displayName || 'User'}
                            </p>
                            <p className="text-sm text-gray-500 truncate">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="px-4 py-2">
                        <div className="text-xs text-gray-500 mb-2">
                          Member since {user.createdAt.toLocaleDateString()}
                        </div>
                        <div className="text-xs text-gray-500">
                          Last login: {user.lastLoginAt.toLocaleDateString()}
                        </div>
                      </div>
                      
                      <div className="border-t border-gray-100 pt-2">
                        <button
                          onClick={openProfileModal}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          View Profile
                        </button>
                        <button
                          onClick={handleSignOut}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setAuthModalMode('login');
                      setShowAuthModal(true);
                    }}
                    className="flex items-center space-x-2"
                  >
                    Sign In
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setAuthModalMode('signup');
                      setShowAuthModal(true);
                    }}
                    className="flex items-center space-x-2"
                  >
                    Sign Up
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Backdrop for mobile menu */}
        {showUserMenu && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowUserMenu(false)}
          />
        )}
      </header>

      {/* 슬라이드 네비게이션 메뉴 */}
      {navOpen && (
        <div className="fixed inset-0 z-50">
          {/* 오버레이 */}
          <div className="fixed inset-0 bg-black/40" onClick={() => { 
            setNavOpen(false); 
            onNavToggle?.(false);
          }}></div>
          {/* 네비게이션 패널 */}
          <nav className="fixed top-0 left-0 h-full w-72 bg-white dark:bg-gray-900 shadow-lg transition-transform transform translate-x-0 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-800">
              <span className="text-lg font-bold text-gray-900 dark:text-white">Menu</span>
              <button onClick={() => { 
                setNavOpen(false); 
                onNavToggle?.(false);
              }} aria-label="Close menu" className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* User Info Section */}
            {user && (
              <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-center space-x-3">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName}
                      className="w-12 h-12 rounded-full"
                      onError={(e) => {
                        console.error('Header profile image failed to load:', user.photoURL);
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          parent.innerHTML = `
                            <div class="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center">
                              <span class="text-white text-lg font-bold">
                                ${user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                              </span>
                            </div>
                          `;
                        }
                      }}
                      onLoad={() => {
                        console.log('Header profile image loaded successfully:', user.photoURL);
                      }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center">
                      <span className="text-white text-lg font-bold">
                        {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {user.displayName || 'User'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {user.email}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Menu */}
            <div className="flex-1 p-4 space-y-3">
              <button
                onClick={() => { 
                  setNavOpen(false); 
                  onNavToggle?.(false);
                  navigate('/');
                }}
                className={`w-full px-4 py-3 rounded-lg font-semibold transition flex items-center space-x-3 ${
                  activeMenuItem === 'home'
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span>Home</span>
              </button>
              
              <button
                onClick={() => { 
                  setNavOpen(false); 
                  onNavToggle?.(false);
                  // 워크스페이스 목록으로 이동
                  navigate('/workspaces');
                }}
                className={`w-full px-4 py-3 rounded-lg font-semibold transition flex items-center space-x-3 ${
                  activeMenuItem === 'workspaces'
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span>Workspaces</span>
              </button>

              {/* Notifications */}
              <button
                onClick={() => { 
                  setNavOpen(false); 
                  onNavToggle?.(false);
                  navigate('/notifications');
                }}
                className={`w-full px-4 py-3 rounded-lg font-semibold transition flex items-center space-x-3 ${
                  activeMenuItem === 'notifications'
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                <div className="relative">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-5 5v-5zM4.828 7l2.586 2.586a2 2 0 002.828 0L12.828 7H4.828zM4 5h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2z" />
                  </svg>
                  {unreadNotificationCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                      {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                    </span>
                  )}
                </div>
                <span>Notifications</span>
              </button>
              
              <button
                onClick={() => { 
                  setNavOpen(false); 
                  onNavToggle?.(false);
                  navigate('/contact');
                }}
                className={`w-full px-4 py-3 rounded-lg font-semibold transition flex items-center space-x-3 ${
                  activeMenuItem === 'contact'
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>Contact</span>
              </button>
            </div>

            {/* Bottom Section */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-3">
              {/* Profile */}
              <button
                onClick={() => { 
                  setNavOpen(false); 
                  onNavToggle?.(false);
                  setShowProfileModal(true);
                }}
                className="w-full px-4 py-3 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition flex items-center space-x-3"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>Profile</span>
              </button>

              {/* Sign Out */}
              {user && (
                <button
                  onClick={() => { 
                    setNavOpen(false); 
                    onNavToggle?.(false);
                    handleSignOut();
                  }}
                  className="w-full px-4 py-3 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-semibold hover:bg-red-200 dark:hover:bg-red-900/50 transition flex items-center space-x-3"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>Sign Out</span>
                </button>
              )}
            </div>
          </nav>
        </div>
      )}

      {/* User Profile Modal */}
      <Modal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        size="lg"
      >
        <UserProfile onClose={() => setShowProfileModal(false)} />
      </Modal>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        initialMode={authModalMode}
      />

      {/* Notification Modal */}
      <NotificationModal
        isOpen={showNotificationModal}
        onClose={() => setShowNotificationModal(false)}
        onNotificationCountChange={setUnreadNotificationCount}
      />
    </>
  );
};

export default Header; 
