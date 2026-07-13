import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from '../lib/router';
import Header from '../components/layout/Header';
import { db } from '../services/firebase/config';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import Toast from '../components/common/Toast';
import { getUserNotifications } from '../services/notification/notificationService';
import { calculateUserStorageUsage, formatBytes, STORAGE_LIMIT_BYTES } from '../utils/storageUtils';
import { Notification } from '../types';
import { createTeamUrl, getUserIdFromEmail } from '../utils/urlUtils';

interface LandingPageProps {
  darkMode: boolean;
  setDarkMode: (value: boolean | ((val: boolean) => boolean)) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ darkMode, setDarkMode }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [recentNotifications, setRecentNotifications] = useState<Notification[]>([]);
  const [storageUsage, setStorageUsage] = useState<number>(0);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  // Load user's workspaces
  useEffect(() => {
    const loadWorkspaces = async () => {
      if (!user) return;
      try {
        const q = query(collection(db, 'workspaces'), where('userId', '==', user.id));
        const snapshot = await getDocs(q);
        const workspacesData: any[] = [];
        snapshot.forEach(docSnap => {
          workspacesData.push({ id: docSnap.id, ...docSnap.data() });
        });
        // 최신순(내림차순) 정렬
        workspacesData.sort((a, b) => b.createdAt - a.createdAt);
        setWorkspaces(workspacesData);
      } catch (error) {
        console.error('Failed to load workspaces:', error);
      }
    };
    loadWorkspaces();
  }, [user]);

  // Load additional dashboard data
  useEffect(() => {
    const loadDashboardData = async () => {
      if (!user) return;
      
      try {
        // Load recent notifications
        const notifications = await getUserNotifications(user.id, 5);
        setRecentNotifications(notifications);

        // Load storage usage
        const usage = await calculateUserStorageUsage(user.id);
        setStorageUsage(usage);

        // Load recent activity (recent workspaces)
        const recentWorkspaces = workspaces
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 3);
        setRecentActivity(recentWorkspaces);
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      }
    };

    loadDashboardData();
  }, [user, workspaces]);

  // const deleteWorkspace = async (workspaceId: string) => {
  //   if (!user) return;
  //   try {
  //     await deleteDoc(doc(db, 'workspaces', workspaceId));
  //     setWorkspaces(workspaces.filter(w => w.id !== workspaceId));
  //                       setToastMessage('Team deleted successfully!');
  //     setShowToast(true);
  //   } catch (error) {
  //             setToastMessage('Failed to delete team. Please try again.');
  //     setShowToast(true);
  //   }
  // };

  // const formatDate = (timestamp: number) => {
  //   return new Date(timestamp).toLocaleString('en-US');
  // };

  return (
    <div className={`landing-page min-h-screen pt-0 bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-all duration-300 ease-in-out`}>
      <Toast message={toastMessage} show={showToast} onClose={() => setShowToast(false)} />
      <Header 
        showBackButton={false} 
        darkMode={darkMode} 
        setDarkMode={setDarkMode}
        onNavToggle={setNavOpen}
      />
      
      <div className={`landing-container transition-all duration-300 ease-in-out ${
        navOpen ? 'ml-56' : 'ml-0'
      }`}>
        <header className="landing-header">
          <h1 className="landing-title dark:text-white">
            <span className="title-team">Team</span>
            <span className="title-maker">Maker</span>
          </h1>
          <p className="landing-subtitle dark:text-gray-300">
            Smart Team Formation Made Simple
          </p>
          <button 
            className="launch-button dark:text-white mt-8"
            onClick={() => navigate('/app')}
          >
            {user ? 'Launch App' : 'Get Started'}
          </button>
        </header>

        <main className="landing-main">
          {user ? (
            // Logged in user content
            <div className="hero-section">
              <div className="hero-content">
                <div className="welcome-section">
                  <h2 className="hero-title">
                    Welcome back, {user.displayName || 'User'}! 👋
                  </h2>
                  <p className="hero-description dark:text-gray-300">
                    Ready to create some amazing teams? Your previous configurations and saved results 
                    are ready for you. Let's get started with your next team formation project.
                  </p>
                </div>
                
                <div className="user-stats-section">
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-number">{workspaces.length}</div>
                      <div className="stat-label">Workspaces Created</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-number">
                        {workspaces.reduce((total, ws) => total + (ws.members?.length || 0), 0)}
                      </div>
                      <div className="stat-label">Total Members</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-number">{recentNotifications.length}</div>
                      <div className="stat-label">Recent Notifications</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-number">{formatBytes(storageUsage)}</div>
                      <div className="stat-label">Storage Used</div>
                    </div>
                  </div>
                </div>

                {/* Recent Activity Section */}
                <div className="recent-activity-section">
                  <h3 className="section-title">Recent Activity</h3>
                  <div className="activity-grid">
                    {recentActivity.length > 0 ? (
                      recentActivity.map((workspace) => (
                        <div key={workspace.id} className="activity-card bg-white dark:bg-slate-700">
                          <div className="activity-icon">🏢</div>
                          <div className="activity-content">
                            <h4 className="activity-title">{workspace.title}</h4>
                            <p className="activity-description">
                              Created {new Date(workspace.createdAt).toLocaleDateString()}
                            </p>
                            <p className="activity-meta">
                              {workspace.members?.length || 0} members • {workspace.groups?.length || 0} teams
                            </p>
                          </div>
                          <button 
                            className="activity-button"
                            onClick={async () => {
                              const newUrl = await createTeamUrl(
                                user?.email ? getUserIdFromEmail(user.email) : '',
                                workspace.title,
                                workspace.id,
                                db
                              );
                              navigate(newUrl);
                            }}
                          >
                            View
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="no-activity">
                        <p className="text-gray-500 dark:text-gray-400">No recent activity</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent Notifications Section */}
                {recentNotifications.length > 0 && (
                  <div className="recent-notifications-section">
                    <h3 className="section-title">Recent Notifications</h3>
                    <div className="notifications-list">
                      {recentNotifications.slice(0, 3).map((notification) => (
                        <div key={notification.id} className={`notification-item ${!notification.isRead ? 'unread' : ''}`}>
                          <div className="notification-icon">
                            {notification.type === 'assignment_created' ? '📝' : 
                             notification.type === 'assignment_submitted' ? '📤' : 
                             notification.type === 'storage_warning' ? '⚠️' : '🔔'}
                          </div>
                          <div className="notification-content">
                            <h4 className="notification-title">{notification.title}</h4>
                            <p className="notification-message">{notification.message}</p>
                            <p className="notification-time">
                              {new Date(notification.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="quick-actions">
                  <h3 className="section-title">Quick Actions</h3>
                  <div className="actions-grid">
                    <div className="action-card bg-white dark:bg-slate-700">
                      <div className="action-icon">🚀</div>
                      <h4>Start New Project</h4>
                      <p>Create a new team formation project from scratch</p>
                      <button 
                        className="action-button bg-gradient-to-r from-pink-500 to-yellow-400 text-white rounded-full px-8 py-3 text-base font-semibold shadow-lg hover:from-pink-600 hover:to-yellow-500 disabled:bg-gradient-to-r disabled:from-pink-500 disabled:to-yellow-400 disabled:text-white disabled:opacity-60 disabled:shadow-none w-48 mx-auto block transition"
                        onClick={() => navigate('/app')}
                      >
                        Get Started
                      </button>
                    </div>
                    <div className="action-card bg-white dark:bg-slate-700">
                      <div className="action-icon">📋</div>
                      <h4>View Teams</h4>
                      <p>View and manage your previously created teams</p>
                      <button 
                        className="action-button bg-gradient-to-r from-pink-500 to-yellow-400 text-white rounded-full px-8 py-3 text-base font-semibold shadow-lg hover:from-pink-600 hover:to-yellow-500 w-48 mx-auto block transition"
                        onClick={() => navigate('/workspaces')}
                      >
                        View Teams
                      </button>
                    </div>
                    <div className="action-card bg-white dark:bg-slate-700">
                      <div className="action-icon">⚙️</div>
                      <h4>Settings</h4>
                      <p>Customize your team formation preferences and defaults</p>
                      <button 
                        className="action-button bg-gradient-to-r from-pink-500 to-yellow-400 text-white rounded-full px-8 py-3 text-base font-semibold shadow-lg hover:from-pink-600 hover:to-yellow-500 disabled:bg-gradient-to-r disabled:from-pink-500 disabled:to-yellow-400 disabled:text-white disabled:opacity-60 disabled:shadow-none w-48 mx-auto block transition"
                        disabled
                      >
                        Configure
                      </button>
                    </div>
                  </div>
                </div>


              </div>
            </div>
          ) : (
            // Guest user content
            <div className="hero-section">
              <div className="hero-content">
                <h2 className="hero-title">
                  Create Balanced Teams Instantly
                </h2>
                <p className="hero-description dark:text-gray-300">
                  TeamMaker helps you create fair and balanced teams for any activity. 
                  Whether it's for work projects, study groups, or recreational activities, 
                  our intelligent algorithm ensures everyone gets a chance to work with different people.
                </p>
                
                <div className="features-grid">
                  <div className="feature-card bg-white dark:bg-slate-700">
                    <div className="feature-icon">🎯</div>
                    <h3>Smart Grouping</h3>
                    <p>Intelligent algorithms create balanced teams automatically</p>
                  </div>
                  <div className="feature-card bg-white dark:bg-slate-700">
                    <div className="feature-icon">🔒</div>
                    <h3>Fixed Pairs</h3>
                    <p>Keep specific people together when needed</p>
                  </div>
                  <div className="feature-card bg-white dark:bg-slate-700">
                    <div className="feature-icon">💾</div>
                    <h3>Save Results</h3>
                    <p>Save and reuse your team configurations</p>
                  </div>
                  <div className="feature-card bg-white dark:bg-slate-700">
                    <div className="feature-icon">⚡</div>
                    <h3>Quick Setup</h3>
                    <p>Add members in bulk and get started instantly</p>
                  </div>
                </div>

                <div className="benefits-section">
                  <h3 className="section-title">Why Choose TeamMaker?</h3>
                  <div className="benefits-grid">
                    <div className="benefit-item bg-white dark:bg-slate-700">
                      <span className="benefit-icon">🎲</span>
                      <span>Fair and random team distribution</span>
                    </div>
                    <div className="benefit-item bg-white dark:bg-slate-700">
                      <span className="benefit-icon">⚖️</span>
                      <span>Balanced group sizes</span>
                    </div>
                    <div className="benefit-item bg-white dark:bg-slate-700">
                      <span className="benefit-icon">🔗</span>
                      <span>Keep friends and pairs together</span>
                    </div>
                    <div className="benefit-item bg-white dark:bg-slate-700">
                      <span className="benefit-icon">📊</span>
                      <span>Visual team organization</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* cta-section 제거 */}
        </main>

        <footer className="landing-footer">
                          <p className="dark:text-gray-400">&copy; 2025 TeamMaker. Made with ❤️ for better team collaboration.</p>
        </footer>
      </div>
    </div>
  );
};

export default LandingPage; 
