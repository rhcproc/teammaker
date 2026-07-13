import React from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface EmailVerificationRequiredProps {
  onClose: () => void;
}

const EmailVerificationRequired: React.FC<EmailVerificationRequiredProps> = ({ onClose }) => {
  const { user, sendEmailVerification, signOut } = useAuth();

  const handleResendVerification = async () => {
    try {
      await sendEmailVerification();
      alert('Verification email sent! Please check your email and spam folder.');
    } catch (error) {
      console.error('Resend verification error:', error);
      alert('Failed to resend verification email. Please try again.');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      onClose();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">📧</div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Email Verification Required
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Please verify your email address to continue using TeamMaker.
          </p>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Verification Required
              </h3>
              <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                <p>We've sent a verification email to:</p>
                <p className="font-medium">{user?.email}</p>
                <p className="mt-2">Please check your email and click the verification link to continue.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleResendVerification}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Resend Verification Email
          </button>
          
          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Sign Out
          </button>
        </div>

        {/* 개발용 우회 옵션 */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">🔧 개발 모드</p>
            <p className="text-xs text-red-700 dark:text-red-300 mb-2">
              개발 중에는 이메일 인증을 우회할 수 있습니다.
            </p>
            <button
              onClick={() => {
                localStorage.setItem('skipEmailVerification', 'true');
                onClose();
                window.location.reload();
              }}
              className="text-xs text-red-600 dark:text-red-400 hover:underline"
            >
              개발용: 이메일 인증 우회하기
            </button>
          </div>
        )}

        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">📧 이메일을 찾을 수 없나요?</p>
          <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
            <li>• 스팸/정크 메일 폴더를 확인해주세요</li>
            <li>• Gmail 사용 시 '프로모션' 탭을 확인해주세요</li>
            <li>• 이메일이 오지 않으면 'Resend Verification Email' 버튼을 클릭해주세요</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default EmailVerificationRequired;
