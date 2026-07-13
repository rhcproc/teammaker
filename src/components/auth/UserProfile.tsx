import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Button from '../common/Button';
import { calculateUserStorageUsage, formatBytes, calculateStoragePercentage, STORAGE_LIMIT_BYTES } from '../../utils/storageUtils';

interface UserProfileProps {
  onClose?: () => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ onClose }) => {
  const { user, signOut, deleteAccount, loading } = useAuth();
  // const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [storageUsage, setStorageUsage] = useState<number>(0);
  const [storageLoading, setStorageLoading] = useState(true);

  // Storage 사용량 로드
  useEffect(() => {
    const loadStorageUsage = async () => {
      if (!user) return;
      
      setStorageLoading(true);
      try {
        const usage = await calculateUserStorageUsage(user.id);
        setStorageUsage(usage);
      } catch (error) {
        console.error('Failed to load storage usage:', error);
      } finally {
        setStorageLoading(false);
      }
    };

    loadStorageUsage();
  }, [user]);

  if (!user) {
    return null;
  }

  const handleSignOut = async () => {
    try {
      await signOut();
      onClose?.();
      // Sign out 후 홈페이지로 리다이렉트
      window.location.href = '/';
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('Are you sure you want to delete your account? This action cannot be undone and will permanently delete all your data, including all teams you have created.')) {
      return;
    }

    const confirmText = prompt('Please type "DELETE" to confirm account deletion:');
    if (confirmText !== 'DELETE') {
      alert('Account deletion cancelled. You must type "DELETE" exactly to confirm.');
      return;
    }

    // 비밀번호 입력 모달 표시
    setShowPasswordModal(true);
  };

  const handlePasswordSubmit = async () => {
    if (!password.trim()) {
      alert('Please enter your password.');
      return;
    }

    setDeleteLoading(true);
    setShowPasswordModal(false);
    
    try {
      console.log('Starting account deletion...');
      await deleteAccount(password);
      console.log('Account deletion completed successfully');
      onClose?.();
      // 계정 삭제 후 메인 홈페이지로 리다이렉트
      window.location.href = '/';
    } catch (error) {
      console.error('Delete account failed:', error);
      alert(`Failed to delete account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDeleteLoading(false);
      setPassword('');
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full mx-auto max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">User Profile</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* 프로필 사진, 이름, 이메일 */}
      <div className="flex flex-col items-center mb-8">
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName}
            className="w-20 h-20 rounded-full border-4 border-gray-200 mb-3 shadow"
            onError={(e) => {
              console.error('Profile image failed to load:', user.photoURL);
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent) {
                parent.innerHTML = `
                  <div class="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center border-4 border-gray-200 mb-3 shadow">
                    <span class="text-white text-2xl font-bold">
                      ${user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                    </span>
                  </div>
                `;
              }
            }}
            onLoad={() => {
              console.log('Profile image loaded successfully:', user.photoURL);
            }}
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center border-4 border-gray-200 mb-3 shadow">
            <span className="text-white text-2xl font-bold">
              {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
            </span>
          </div>
        )}
        <div className="text-lg font-bold text-gray-900 mb-1">{user.displayName || 'User'}</div>
        <div className="text-gray-500 text-sm">{user.email}</div>
        
        {/* 프로필 이미지 디버깅 정보 */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded text-xs">
            <div>PhotoURL: {user.photoURL || 'None'}</div>
            <div>DisplayName: {user.displayName || 'None'}</div>
            <div>Email: {user.email || 'None'}</div>
          </div>
        )}
      </div>

      <hr className="my-6" />

      {/* Account Information */}
      <div className="mb-8">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Account Information</h4>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">User ID:</span>
            <span className="text-xs text-gray-900 font-mono max-w-[220px] truncate text-right">{user.id}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">Member since:</span>
            <span className="text-xs text-gray-900">{user.createdAt.toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">Last login:</span>
            <span className="text-xs text-gray-900">{user.lastLoginAt.toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">Email verification:</span>
            <span className={`text-xs font-medium ${
              user.emailVerified === undefined 
                ? 'text-gray-500' 
                : user.emailVerified 
                  ? 'text-green-600' 
                  : 'text-red-600'
            }`}>
              {user.emailVerified === undefined 
                ? 'N/A (OAuth)' 
                : user.emailVerified 
                  ? 'Verified' 
                  : 'Not verified'
              }
            </span>
          </div>
          
          {/* Storage Usage */}
          <div className="pt-2 border-t border-gray-100">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-gray-500">Storage Usage:</span>
              <span className="text-xs text-gray-900 font-medium">
                {storageLoading ? (
                  <span className="text-xs text-gray-400">Loading...</span>
                ) : (
                  `${formatBytes(storageUsage)} / ${formatBytes(STORAGE_LIMIT_BYTES)}`
                )}
              </span>
            </div>
            
            {/* Progress Bar */}
            {!storageLoading && (
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div 
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    calculateStoragePercentage(storageUsage, STORAGE_LIMIT_BYTES) > 80 
                      ? 'bg-red-500' 
                      : calculateStoragePercentage(storageUsage, STORAGE_LIMIT_BYTES) > 60 
                        ? 'bg-yellow-500' 
                        : 'bg-green-500'
                  }`}
                  style={{ 
                    width: `${calculateStoragePercentage(storageUsage, STORAGE_LIMIT_BYTES)}%` 
                  }}
                ></div>
              </div>
            )}
            
            {!storageLoading && calculateStoragePercentage(storageUsage, STORAGE_LIMIT_BYTES) > 80 && (
              <p className="text-xs text-red-600 mt-1">
                ⚠️ Storage usage is high
              </p>
            )}
          </div>
        </div>
      </div>

      <hr className="my-6" />

      {/* Account Stats */}
      <div className="mb-8">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Account Stats</h4>
        <div className="flex gap-4">
          <div className="flex-1 bg-gray-50 rounded-xl p-4 flex flex-col items-center">
            <div className="text-2xl font-bold text-blue-600">0</div>
            <div className="text-xs text-gray-500 mt-1">Workspaces Created</div>
          </div>
          <div className="flex-1 bg-gray-50 rounded-xl p-4 flex flex-col items-center">
            <div className="text-2xl font-bold text-green-600">0</div>
            <div className="text-xs text-gray-500 mt-1">Teams Joined</div>
          </div>
        </div>
      </div>

      <div className="space-y-3 mt-6">
        <Button
          variant="danger"
          size="md"
          onClick={handleSignOut}
          className="w-full text-base py-3"
        >
          Sign Out
        </Button>
        
        <Button
          variant="danger"
          size="md"
          onClick={handleDeleteAccount}
          disabled={deleteLoading || loading}
          className="w-full text-base py-3 bg-red-600 hover:bg-red-700 border-red-600"
        >
          {deleteLoading ? 'Deleting Account...' : 'Delete Account'}
        </Button>
      </div>

      {/* Password Input Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Confirm Account Deletion
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Please enter your password to confirm account deletion. This will permanently delete your account and all teams you have created.
            </p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:text-white mb-4"
              autoFocus
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handlePasswordSubmit();
                }
              }}
            />
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPassword('');
                }}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordSubmit}
                disabled={!password.trim()}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfile; 