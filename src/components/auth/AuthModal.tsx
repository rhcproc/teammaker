import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'signup';
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialMode = 'login' }) => {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showEmailVerification, setShowEmailVerification] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [isGoogleOAuthInProgress, setIsGoogleOAuthInProgress] = useState(false);

  const { signIn, signUp, signInWithGoogle, resetPassword, sendEmailVerification, error, clearError, user, loading } = useAuth();

  // 모달이 열릴 때마다 에러 상태 초기화
  useEffect(() => {
    if (isOpen) {
      clearError();
    }
  }, [isOpen, clearError]);

  // initialMode가 변경될 때마다 mode 상태 업데이트
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // 로그인 성공 시 모달 닫기 (Google OAuth 진행 중에는 닫지 않음)
  useEffect(() => {
    if (user && isOpen && !loading && !localLoading && !isGoogleOAuthInProgress && user.emailVerified !== false) {
      // 로딩이 완료되고 이메일 인증이 완료된 사용자만 모달 닫기
      // Google OAuth 진행 중에는 닫히지 않도록 함
      onClose();
    }
  }, [user, isOpen, loading, localLoading, isGoogleOAuthInProgress, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalLoading(true);

    try {
      if (mode === 'login') {
        await signIn(email, password);
        // 로그인 성공 시에만 모달 닫기 (AuthContext에서 user 상태가 변경되면 자동으로 닫힘)
        // onClose()는 제거하고 AuthContext의 상태 변화에 의존
      } else {
        if (password !== confirmPassword) {
          alert('Passwords do not match');
          setLocalLoading(false);
          return;
        }
        await signUp(email, password, displayName);
        console.log('회원가입 완료, 이메일 인증 발송됨:', email);
        setShowEmailVerification(true);
      }
    } catch (error) {
      console.error('Auth error:', error);
      console.log('Error message:', error instanceof Error ? error.message : 'Unknown error');
      // 에러는 AuthContext에서 이미 상태에 저장되므로 여기서는 추가 처리 불필요
      // 모달을 닫지 않고 에러 메시지가 표시되도록 함
    } finally {
      setLocalLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLocalLoading(true);
    setIsGoogleOAuthInProgress(true);
    try {
      await signInWithGoogle();
      // Google 로그인 성공 시에만 모달 닫기 (AuthContext에서 user 상태가 변경되면 자동으로 닫힘)
      // onClose()는 제거하고 AuthContext의 상태 변화에 의존
    } catch (error) {
      console.error('Google sign in error:', error);
      // Google OAuth는 AuthContext에서 에러를 throw하지 않으므로 여기서는 catch되지 않음
    } finally {
      setLocalLoading(false);
      // OAuth 완료 후 상태 리셋 (성공/실패 관계없이)
      setTimeout(() => {
        setIsGoogleOAuthInProgress(false);
      }, 1000); // 1초 후에 상태 리셋하여 모달이 닫힐 수 있도록 함
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      alert('Please enter your email address first');
      return;
    }
    try {
      await resetPassword(email);
      alert('Password reset email sent!');
    } catch (error) {
      console.error('Password reset error:', error);
    }
  };

  const handleResendVerification = async () => {
    try {
      await sendEmailVerification();
      console.log('이메일 재발송 완료:', email);
      alert('Verification email sent! Please check your spam folder if you don\'t see it in your inbox.');
    } catch (error) {
      console.error('Resend verification error:', error);
      alert('Failed to resend verification email. Please try again.');
    }
  };

  if (!isOpen) return null;

  if (showEmailVerification) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Check Your Email
          </h2>
          <div className="text-gray-600 dark:text-gray-400 mb-4">
            <p>We've sent a verification email to:</p>
            <p className="font-medium">{email}</p>
            <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">📧 이메일을 찾을 수 없나요?</p>
              <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
                <li>• 스팸/정크 메일 폴더를 확인해주세요</li>
                <li>• Gmail 사용 시 '프로모션' 탭을 확인해주세요</li>
                <li>• 이메일이 오지 않으면 'Resend Email' 버튼을 클릭해주세요</li>
              </ul>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handleResendVerification}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Resend Email
            </button>
            <button
              onClick={() => {
                setShowEmailVerification(false);
                setMode('login');
                onClose();
              }}
              className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
          
          {/* 개발용 안내 */}
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">🔧 개발 모드 안내</p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
              로컬 개발 환경에서는 이메일이 발송되지 않을 수 있습니다. 
              Firebase Console에서 이메일 템플릿을 활성화하고 Authorized domains에 localhost를 추가해주세요.
            </p>
            <button
              onClick={() => {
                setShowEmailVerification(false);
                setMode('login');
                onClose();
                alert('개발 모드: 이메일 인증을 우회하고 로그인 페이지로 이동합니다.');
              }}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              개발용: 이메일 인증 우회하고 로그인하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {mode === 'login' ? 'Sign In' : 'Sign Up'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="Enter your name"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Enter your email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Enter your password"
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="Confirm your password"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={localLoading || loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {(localLoading || loading) ? 'Loading...' : (mode === 'login' ? 'Sign In' : 'Sign Up')}
          </button>
        </form>

        <div className="mt-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-600" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-gray-800 text-gray-500">Or continue with</span>
            </div>
          </div>

          <button
            onClick={handleGoogleSignIn}
            disabled={localLoading || loading}
            className="w-full mt-4 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
        </div>

        <div className="mt-4 text-center">
          {mode === 'login' ? (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Don't have an account?{' '}
                <button
                  onClick={() => setMode('signup')}
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Sign up
                </button>
              </p>
              <button
                onClick={handlePasswordReset}
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 mt-2"
              >
                Forgot your password?
              </button>
            </>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Already have an account?{' '}
              <button
                onClick={() => setMode('login')}
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
