import React, { useState, useEffect } from 'react';
import { useNavigate } from '../lib/router';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/layout/Header';
import Toast from '../components/common/Toast';
import { 
  getUserNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  cleanupDuplicateNotifications
} from '../services/notification/notificationService';
import { Notification } from '../types';

interface NotificationsPageProps {
  darkMode: boolean;
  setDarkMode: (value: boolean | ((val: boolean) => boolean)) => void;
}

const NotificationsPage: React.FC<NotificationsPageProps> = ({ darkMode, setDarkMode }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [markingAsRead, setMarkingAsRead] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadNotifications();
    }
  }, [user]);

  const loadNotifications = async (reset = true) => {
    if (!user) return;

    if (reset) {
      setLoading(true);
      setNotifications([]);
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }

    try {
      // 먼저 중복 알림 정리 (초기 로드 시에만)
      if (reset) {
        await cleanupDuplicateNotifications(user.id);
      }
      
      const lastNotification = reset ? undefined : notifications[notifications.length - 1];
      const userNotifications = await getUserNotifications(user.id, 10, lastNotification);
      
      if (reset) {
        setNotifications(userNotifications);
      } else {
        setNotifications(prev => [...prev, ...userNotifications]);
      }
      
      // 더 이상 로드할 알림이 없는지 확인
      setHasMore(userNotifications.length === 10);
    } catch (error) {
      console.error('Failed to load notifications:', error);
      setToastMessage('Failed to load notifications');
      setShowToast(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    setMarkingAsRead(notificationId);
    try {
      await markNotificationAsRead(notificationId);
      
      // 로컬 상태 업데이트
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId 
            ? { ...notif, isRead: true }
            : notif
        )
      );

      setToastMessage('Notification marked as read');
      setShowToast(true);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      setToastMessage('Failed to mark notification as read');
      setShowToast(true);
    } finally {
      setMarkingAsRead(null);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;

    try {
      await markAllNotificationsAsRead(user.id);
      
      // 로컬 상태 업데이트
      setNotifications(prev => 
        prev.map(notif => ({ ...notif, isRead: true }))
      );

      setToastMessage('All notifications marked as read');
      setShowToast(true);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      setToastMessage('Failed to mark all notifications as read');
      setShowToast(true);
    }
  };

  const formatTimeAgo = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return new Date(timestamp).toLocaleDateString();
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'assignment_created':
        return '📝';
      case 'assignment_submitted':
        return '📤';
      case 'assignment_deadline_reminder':
        return '⏰';
      case 'team_member_joined':
        return '👥';
      case 'workspace_invited':
        return '🏢';
      case 'storage_warning':
        return '⚠️';
      case 'system_announcement':
        return '📢';
      default:
        return '🔔';
    }
  };

  const getNotificationTypeLabel = (type: string): string => {
    switch (type) {
      case 'assignment_created':
        return 'Assignment Created';
      case 'assignment_submitted':
        return 'Assignment Submitted';
      case 'assignment_deadline_reminder':
        return 'Deadline Reminder';
      case 'team_member_joined':
        return 'Team Member Joined';
      case 'workspace_invited':
        return 'Workspace Invited';
      case 'storage_warning':
        return 'Storage Warning';
      case 'system_announcement':
        return 'System Announcement';
      default:
        return 'Notification';
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <Header onBackToLanding={() => navigate('/')} darkMode={darkMode} setDarkMode={setDarkMode} onNavToggle={setNavOpen} />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Please log in to view notifications
            </h1>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Toast message={toastMessage} show={showToast} onClose={() => setShowToast(false)} />
      <Header onBackToLanding={() => navigate('/')} darkMode={darkMode} setDarkMode={setDarkMode} onNavToggle={setNavOpen} />
      
      <div className={`px-4 py-8 transition-all duration-300 ease-in-out ${
        navOpen ? 'ml-72' : 'ml-0'
      }`}>
        <div className="max-w-4xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Notifications
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                Stay updated with your latest activities and important updates
              </p>
            </div>
            
            {notifications.some(n => !n.isRead) && (
              <button
                onClick={handleMarkAllAsRead}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Mark All Read
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {notifications.length}
              </div>
              <div className="text-sm text-blue-600 dark:text-blue-400">
                Total Notifications
              </div>
            </div>
            <div className="bg-orange-50 dark:bg-orange-900/30 rounded-lg p-4">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {notifications.filter(n => !n.isRead).length}
              </div>
              <div className="text-sm text-orange-600 dark:text-orange-400">
                Unread
              </div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {notifications.filter(n => n.isRead).length}
              </div>
              <div className="text-sm text-green-600 dark:text-green-400">
                Read
              </div>
            </div>
          </div>

          {/* Notifications List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600 dark:text-gray-300">Loading notifications...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🔔</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                No notifications yet
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                You'll see important updates and activities here
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`border rounded-lg p-4 transition-all duration-200 ${
                    !notification.isRead 
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' 
                      : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                  }`}
                >
                  <div className="flex items-start space-x-4">
                    <div className="text-2xl flex-shrink-0">
                      {getNotificationIcon(notification.type)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <h3 className={`text-lg font-semibold ${
                            !notification.isRead 
                              ? 'text-gray-900 dark:text-white' 
                              : 'text-gray-700 dark:text-gray-300'
                          }`}>
                            {notification.title}
                          </h3>
                          <span className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full">
                            {getNotificationTypeLabel(notification.type)}
                          </span>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {formatTimeAgo(notification.createdAt)}
                          </span>
                          {!notification.isRead && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          )}
                        </div>
                      </div>
                      
                      <p className={`text-sm mb-3 ${
                        !notification.isRead 
                          ? 'text-gray-700 dark:text-gray-300' 
                          : 'text-gray-500 dark:text-gray-400'
                      }`}>
                        {notification.message}
                      </p>
                      
                      {!notification.isRead && (
                        <button
                          onClick={() => handleMarkAsRead(notification.id)}
                          disabled={markingAsRead === notification.id}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium disabled:opacity-50"
                        >
                          {markingAsRead === notification.id ? (
                            <span className="flex items-center">
                              <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-600 mr-1"></div>
                              Marking...
                            </span>
                          ) : (
                            'Mark as read'
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {/* 더 보기 버튼 */}
              {hasMore && (
                <div className="flex justify-center mt-6">
                  <button
                    onClick={() => loadNotifications(false)}
                    disabled={loadingMore}
                    className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {loadingMore ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Loading more...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        Load More
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationsPage;

