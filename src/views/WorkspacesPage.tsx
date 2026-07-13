import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from '../lib/router';
import { db } from '../services/firebase/config';
import { collection, query, where, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/layout/Header';
import Toast from '../components/common/Toast';
import { createTeamUrl, getUserIdFromEmail } from '../utils/urlUtils';
import { getUserTeams } from '../services/team/teamService';
import { UserTeamInfo } from '../types';
import { checkWorkspaceAccess, WorkspaceAccessResult } from '../utils/workspaceSecurity';
import { saveTeamOrder } from '../utils/storageUtils';

interface Member {
  id: string;
  name: string;
}

interface FixedPair {
  id: string;
  members: string[];
}

interface LockedTeam {
  id: string;
  members: string[];
}

interface Group {
  id: string;
  members: string[];
}

interface Workspace {
  id: string;
  userId: string;
  createdAt: number;
  groups: Group[];
  members: Member[];
  groupSize: number;
  fixedPairs: FixedPair[];
  lockedTeams: LockedTeam[];
  title: string;
  isPublic?: boolean;
}

interface WorkspacesPageProps {
  darkMode: boolean;
  setDarkMode: (value: boolean | ((val: boolean) => boolean)) => void;
}

function WorkspacesPage({ darkMode, setDarkMode }: WorkspacesPageProps) {
  const navigate = useNavigate();
  const { userId } = useParams<{ userId?: string }>();
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [userTeams, setUserTeams] = useState<UserTeamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [draggedTeam, setDraggedTeam] = useState<string | null>(null);

  useEffect(() => {
    const loadWorkspaces = async () => {
      console.log('loadWorkspaces called with:', { user: user?.id, userId });
      
      if (!user && !userId) {
        console.log('No user and no userId, loading public workspaces');
        // 비로그인 사용자에게 public 워크스페이스들 보여주기
        try {
          const q = query(collection(db, 'workspaces'));
          const snapshot = await getDocs(q);
          
          const publicWorkspaces: Workspace[] = [];
          
          snapshot.forEach(docSnap => {
            const workspaceData = { id: docSnap.id, ...docSnap.data() } as Workspace;
            
            // public 워크스페이스만 필터링
            if (workspaceData.isPublic === true) {
              publicWorkspaces.push(workspaceData);
            }
          });
          
          publicWorkspaces.sort((a, b) => b.createdAt - a.createdAt);
          setWorkspaces(publicWorkspaces);
        } catch (error) {
          console.error('Failed to load public workspaces:', error);
          setToastMessage('Failed to load public workspaces');
          setShowToast(true);
        } finally {
          setLoading(false);
        }
        return;
      }
      
      setLoading(true);
      setCheckingAccess(true);
      setAccessDenied(false);
      
      try {
        // 로그인한 사용자의 경우 새로운 팀 서비스 사용
        if (user && user.email) {
          // URL에 userId가 있고, 현재 로그인한 사용자와 다른 경우 접근 권한 검증
          const userEmailBasedId = getUserIdFromEmail(user.email);
          if (userId && userId !== user.id && userId !== userEmailBasedId) {
            console.log('Accessing another user\'s teams, checking permissions...');
            
            // 다른 사용자의 팀 목록을 조회하려고 시도
            // URL의 userId는 이메일 기반이므로, 워크스페이스의 userId와 매칭 확인
            const q = query(collection(db, 'workspaces'));
            const snapshot = await getDocs(q);
            const otherUserWorkspaces: Workspace[] = [];
            
            snapshot.forEach(docSnap => {
              const workspaceData = { id: docSnap.id, ...docSnap.data() } as Workspace;
              
              // URL의 userId와 워크스페이스의 userId 매칭 확인
              const workspaceUserId = workspaceData.userId;
              const userIdMatches = workspaceUserId && (
                workspaceUserId === userId || 
                workspaceUserId.startsWith(userId) ||
                userId.startsWith(workspaceUserId)
              );
              
              if (userIdMatches) {
                otherUserWorkspaces.push(workspaceData);
              }
            });
            
            // 현재 사용자가 다른 사용자의 워크스페이스에 접근 권한이 있는지 확인
            let hasAccessToAny = false;
            for (const workspace of otherUserWorkspaces) {
              const access = await checkWorkspaceAccess(user, workspace.id, workspace);
              if (access.hasAccess) {
                hasAccessToAny = true;
                break;
              }
            }
            
            if (!hasAccessToAny) {
              console.log('Access denied: User has no permission to view other user\'s teams');
              setAccessDenied(true);
              setCheckingAccess(false);
              return;
            }
            
            // 접근 권한이 있는 워크스페이스만 표시
            const accessibleWorkspaces: Workspace[] = [];
            for (const workspace of otherUserWorkspaces) {
              const access = await checkWorkspaceAccess(user, workspace.id, workspace);
              if (access.hasAccess) {
                accessibleWorkspaces.push(workspace);
              }
            }
            
            setWorkspaces(accessibleWorkspaces);
            console.log('Loaded accessible workspaces for other user:', accessibleWorkspaces.length);
          } else {
            // 자신의 팀 목록 조회
            console.log('Loading teams for logged-in user:', user.email, 'User ID:', user.id);
            const result = await getUserTeams(user.email, user.id);
            
            if (result.success && result.data) {
              setUserTeams(result.data);
              console.log('Loaded user teams:', result.data.length, result.data);
              console.log('userTeams state updated:', result.data);
              
              // UserTeamInfo를 Workspace 형태로 변환하여 workspaces state에 설정
              const workspacesFromTeams: Workspace[] = [];
              
              // 각 팀에 대해 실제 workspace 데이터를 가져와야 함
              for (const teamInfo of result.data) {
                try {
                  const workspaceRef = doc(db, 'workspaces', teamInfo.teamId);
                  const workspaceDoc = await getDoc(workspaceRef);
                  
                  if (workspaceDoc.exists()) {
                    const workspaceData = { id: workspaceDoc.id, ...workspaceDoc.data() } as Workspace;
                    workspacesFromTeams.push(workspaceData);
                    console.log('Added workspace to display:', workspaceData.title, 'Role:', teamInfo.role);
                  }
                } catch (error) {
                  console.error('Failed to fetch workspace data for team:', teamInfo.teamId, error);
                }
              }
              
              setWorkspaces(workspacesFromTeams);
              console.log('Set workspaces from user teams:', workspacesFromTeams.length);
              
              // 만약 새로운 서비스에서 팀을 찾지 못했다면 기존 로직으로 fallback
              if (result.data.length === 0) {
                console.log('No teams found with new service, trying fallback...');
                const fallbackQ = query(collection(db, 'workspaces'), where('userId', '==', user.id));
                const fallbackSnapshot = await getDocs(fallbackQ);
                const fallbackWorkspaces: Workspace[] = [];
                
                fallbackSnapshot.forEach(docSnap => {
                  const workspaceData = { id: docSnap.id, ...docSnap.data() } as Workspace;
                  fallbackWorkspaces.push(workspaceData);
                });
                
                if (fallbackWorkspaces.length > 0) {
                  console.log('Found teams with fallback:', fallbackWorkspaces.length);
                  setWorkspaces(fallbackWorkspaces);
                }
              }
            } else {
              console.error('Failed to load user teams:', result.error);
              setToastMessage('Failed to load teams');
              setShowToast(true);
            }
          }
        } else if (userId) {
          // 비로그인 사용자가 특정 사용자의 팀 목록에 접근 시도
          console.log('Non-logged in user trying to access teams for userId:', userId);
          setAccessDenied(true);
          setCheckingAccess(false);
          return;
        } else {
          // 특정 사용자의 팀 목록 조회 (기존 로직 유지)
          console.log('Loading teams for userId:', userId);
          const q = query(collection(db, 'workspaces'));
          const snapshot = await getDocs(q);
          
          const workspacesData: Workspace[] = [];
          
          snapshot.forEach(docSnap => {
            const workspaceData = { id: docSnap.id, ...docSnap.data() } as Workspace;
            
            // userId 매칭 로직 (기존과 동일)
            const userIdMatches = workspaceData.userId && userId && (
              workspaceData.userId === userId || 
              workspaceData.userId.startsWith(userId) ||
              userId.startsWith(workspaceData.userId)
            );
            
            if (userIdMatches) {
              workspacesData.push(workspaceData);
            }
          });
          
          workspacesData.sort((a, b) => b.createdAt - a.createdAt);
          setWorkspaces(workspacesData);
        }
      } catch (error) {
        console.error('Failed to load teams:', error);
        setToastMessage('Failed to load teams');
        setShowToast(true);
      } finally {
        setLoading(false);
        setCheckingAccess(false);
      }
    };
    loadWorkspaces();
  }, [user, userId]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US');
  };

  const updateWorkspace = async (workspaceId: string, updatedData: Partial<Workspace>) => {
    if (!user) return;
    try {
      const workspaceRef = doc(db, 'workspaces', workspaceId);
      await updateDoc(workspaceRef, updatedData);
      
      // 로컬 상태도 업데이트
      const updatedWorkspaces = workspaces.map(ws => 
        ws.id === workspaceId ? { ...ws, ...updatedData } : ws
      );
      setWorkspaces(updatedWorkspaces);
      
      setToastMessage('Team updated successfully!');
      setShowToast(true);
    } catch (error) {
      console.error('Failed to update workspace:', error);
      setToastMessage('Failed to update team. Please try again.');
      setShowToast(true);
    }
  };

  // 팀 순서 지정 함수들
  const handleDragStart = (e: React.DragEvent, teamId: string) => {
    setDraggedTeam(teamId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetTeamId: string) => {
    e.preventDefault();
    if (!draggedTeam || draggedTeam === targetTeamId) return;

    // 현재 정렬된 순서를 기준으로 인덱스 찾기
    const sortedTeams = [...userTeams].sort((a, b) => {
      const aOrder = a.displayOrder ?? userTeams.indexOf(a);
      const bOrder = b.displayOrder ?? userTeams.indexOf(b);
      return aOrder - bOrder;
    });

    const draggedIndex = sortedTeams.findIndex(team => team.teamId === draggedTeam);
    const targetIndex = sortedTeams.findIndex(team => team.teamId === targetTeamId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newTeams = [...sortedTeams];
    const [draggedTeamData] = newTeams.splice(draggedIndex, 1);
    newTeams.splice(targetIndex, 0, draggedTeamData);

    // displayOrder 업데이트
    const updatedTeams = newTeams.map((team, index) => ({
      ...team,
      displayOrder: index,
      teamNumber: index + 1
    }));

    setUserTeams(updatedTeams);
    
    // localStorage에 팀 순서 저장
    if (user?.email) {
      const teamOrder = updatedTeams.map(team => ({
        teamId: team.teamId,
        displayOrder: team.displayOrder || 0,
        teamNumber: team.teamNumber || 1
      }));
      saveTeamOrder(user.email, teamOrder);
    }
    
    setDraggedTeam(null);
  };

  const handleDragEnd = () => {
    setDraggedTeam(null);
  };

  // 팀 번호 수동 설정
  const handleTeamNumberChange = (teamId: string, newNumber: number) => {
    const updatedTeams = userTeams.map(team => {
      if (team.teamId === teamId) {
        return { ...team, teamNumber: newNumber, displayOrder: newNumber - 1 };
      }
      return team;
    }).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

    setUserTeams(updatedTeams);
    
    // localStorage에 팀 순서 저장
    if (user?.email) {
      const teamOrder = updatedTeams.map(team => ({
        teamId: team.teamId,
        displayOrder: team.displayOrder || 0,
        teamNumber: team.teamNumber || 1
      }));
      saveTeamOrder(user.email, teamOrder);
    }
  };

  if (loading || checkingAccess) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <Header onBackToLanding={() => navigate('/')} darkMode={darkMode} setDarkMode={setDarkMode} onNavToggle={setNavOpen} />
        <div className={`px-4 sm:px-6 lg:px-8 py-8 transition-all duration-300 ease-in-out ${
          navOpen ? 'ml-56' : 'ml-0'
        }`}>
          <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="text-6xl mb-4 animate-bounce">🏢</div>
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                {checkingAccess ? 'Checking Access...' : 'Loading Teams...'}
              </h3>
              <div className="flex justify-center space-x-1">
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    );
  }

  // 접근 권한이 없는 경우
  if (accessDenied) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <Header onBackToLanding={() => navigate('/')} darkMode={darkMode} setDarkMode={setDarkMode} onNavToggle={setNavOpen} />
        <div className={`px-4 sm:px-6 lg:px-8 py-8 transition-all duration-300 ease-in-out ${
          navOpen ? 'ml-56' : 'ml-0'
        }`}>
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center max-w-md mx-auto">
                <div className="text-6xl mb-4">🔒</div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Access Denied
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  You do not have permission to view this user's teams.
                </p>
                <div className="space-y-3">
                  <button
                    onClick={() => navigate('/workspaces')}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Go to My Workspaces
                  </button>
                  <button
                    onClick={() => navigate('/app')}
                    className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Create New Workspace
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 로그인하지 않은 사용자에게 메시지 표시
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <Header onBackToLanding={() => navigate('/')} darkMode={darkMode} setDarkMode={setDarkMode} onNavToggle={setNavOpen} />
        <div className={`px-4 sm:px-6 lg:px-8 py-8 transition-all duration-300 ease-in-out ${
          navOpen ? 'ml-56' : 'ml-0'
        }`}>
          <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="text-6xl mb-4">🔐</div>
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                Please Sign In
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                You need to sign in to view your teams.
              </p>
              <button
                onClick={() => navigate('/')}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Go to Home
              </button>
            </div>
          </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Toast message={toastMessage} show={showToast} onClose={() => setShowToast(false)} />
      <Header onBackToLanding={() => navigate('/')} darkMode={darkMode} setDarkMode={setDarkMode} onNavToggle={setNavOpen} />
      <div className={`px-4 sm:px-6 lg:px-8 py-8 transition-all duration-300 ease-in-out ${
        navOpen ? 'ml-72' : 'ml-0'
      }`}>
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                {user ? 'Your Workspaces' : 'Public Workspaces'}
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                {user ? 'Manage and view your team formation projects' : 'Browse publicly available team formation projects'}
              </p>
            </div>
            <div className="flex gap-3">
              {user ? (
                <button
                  onClick={() => navigate('/app')}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create New Workspace
                </button>
              ) : (
                <button
                  onClick={() => navigate('/app')}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Sign In
                </button>
              )}
            </div>
          </div>

          {/* 로그인한 사용자의 경우 새로운 팀 목록 표시 */}
          {user && user.email ? (
            (() => {
              console.log('Rendering UI - userTeams:', userTeams, 'length:', userTeams.length);
              return userTeams.length === 0;
            })() ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🏢</div>
                <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                  No teams yet
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Create your first team to get started with team formation.
                </p>
                <button
                  onClick={() => navigate('/app')}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create Your First Team
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(() => {
                  console.log('Rendering team list - userTeams:', userTeams);
                  // 팀 순서에 따라 정렬
                  const sortedTeams = [...userTeams].sort((a, b) => {
                    const aOrder = a.displayOrder ?? userTeams.indexOf(a);
                    const bOrder = b.displayOrder ?? userTeams.indexOf(b);
                    return aOrder - bOrder;
                  });
                  
                  return sortedTeams.map((team) => {
                    console.log('Rendering team:', team);
                    console.log('Team role for', team.teamName, ':', team.role);
                    return (
                  <div 
                    key={team.teamId} 
                    className={`border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-all bg-white dark:bg-gray-700 cursor-move ${
                      draggedTeam === team.teamId ? 'opacity-50 scale-95' : ''
                    }`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, team.teamId)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, team.teamId)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center space-x-2">
                        <span className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-2 py-1 rounded-full text-xs font-bold">
                          #{team.teamNumber || (sortedTeams.indexOf(team) + 1)}
                        </span>
                        <h3 className="font-semibold text-gray-900 dark:text-white text-lg truncate">{team.teamName}</h3>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center space-x-1 ${
                          team.role === 'creator' 
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                            : team.role === 'leader'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                            : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        }`}>
                          {team.role === 'creator' && (
                            <>
                              <span>👑</span>
                              <span>Creator</span>
                            </>
                          )}
                          {team.role === 'leader' && (
                            <>
                              <span>👨‍💼</span>
                              <span>Leader</span>
                            </>
                          )}
                          {team.role === 'member' && (
                            <>
                              <span>👤</span>
                              <span>Member</span>
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-600 dark:text-gray-300 mb-4 space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">Your Role:</span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          team.role === 'creator' 
                            ? 'bg-purple-50 text-purple-700 dark:bg-purple-800 dark:text-purple-200'
                            : team.role === 'leader'
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-800 dark:text-blue-200'
                            : 'bg-green-50 text-green-700 dark:bg-green-800 dark:text-green-200'
                        }`}>
                          {team.role === 'creator' ? '👑 Creator' : team.role === 'leader' ? '👨‍💼 Leader' : '👤 Member'}
                        </span>
                      </div>
                      <p>Members: {team.memberCount || 0}</p>
                      <p>Leaders: {team.leaderCount || 0}</p>
                      <p>Joined: {formatDate(team.joinedAt.getTime())}</p>
                      {team.description && <p className="text-gray-500 dark:text-gray-400 truncate">{team.description}</p>}
                    </div>
                    
                    <div className="flex space-x-2">
                      <button
                        onClick={async () => {
                          const newUrl = await createTeamUrl(
                            user?.email ? getUserIdFromEmail(user.email) : '',
                            team.teamName,
                            team.teamId,
                            db
                          );
                          navigate(newUrl);
                        }}
                        className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                      >
                        View Workspace
                      </button>
                      <button
                        onClick={() => {
                          const currentNumber = team.teamNumber || (sortedTeams.indexOf(team) + 1);
                          const newNumber = prompt(`Enter team number for "${team.teamName}":`, currentNumber.toString());
                          if (newNumber && !isNaN(Number(newNumber)) && Number(newNumber) > 0) {
                            handleTeamNumberChange(team.teamId, Number(newNumber));
                          }
                        }}
                        className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
                        title="Change team number"
                      >
                        #
                      </button>
                      {team.role === 'creator' && (
                        <button
                          onClick={() => {
                            // 기존 workspace 객체로 변환하여 설정 모달 열기
                            const workspace: Workspace = {
                              id: team.teamId,
                              title: team.teamName,
                              userId: team.createdBy || '',
                              createdAt: team.joinedAt.getTime(),
                              groups: [],
                              members: [],
                              groupSize: 4,
                              fixedPairs: [],
                              lockedTeams: []
                            };
                            setSelectedWorkspace(workspace);
                            setShowSettingsModal(true);
                          }}
                          className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                          title="Edit team settings"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                    );
                  });
                })()}
              </div>
            )
          ) : (
            /* 기존 로직: 특정 사용자의 팀 목록 또는 빈 상태 */
            workspaces.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🏢</div>
                <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                  No teams found
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  This user hasn't created any teams yet.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {workspaces.map((workspace) => (
                  <div key={workspace.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow bg-white dark:bg-gray-700">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-semibold text-gray-900 dark:text-white text-lg truncate">{workspace.title}</h3>
                    </div>
                    
                    <div className="text-sm text-gray-600 dark:text-gray-300 mb-4 space-y-1">
                      <p>Members: {workspace.members?.length || 0}</p>
                      <p>Teams: {workspace.groups?.length || 0}</p>
                      <p>Group Size: {workspace.groupSize || 4}</p>
                      <p>Fixed Pairs: {workspace.fixedPairs?.length || 0}</p>
                      <p>Locked Teams: {workspace.lockedTeams?.length || 0}</p>
                      <p>Created: {formatDate(workspace.createdAt)}</p>
                    </div>
                    
                    <div className="flex space-x-2">
                      <button
                        onClick={async () => {
                          const newUrl = await createTeamUrl(
                            user?.email ? getUserIdFromEmail(user.email) : '',
                            workspace.title,
                            workspace.id,
                            db
                          );
                          navigate(newUrl);
                        }}
                        className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                      >
                        View Workspace
                      </button>
                      <button
                        onClick={() => {
                          setSelectedWorkspace(workspace);
                          setShowSettingsModal(true);
                        }}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                        title="Edit team settings"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && selectedWorkspace && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-96 max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Edit Team: {selectedWorkspace.title}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Team Name
                </label>
                <input
                  type="text"
                  value={selectedWorkspace.title}
                  onChange={(e) => setSelectedWorkspace({...selectedWorkspace, title: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
                />
              </div>
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={async () => {
                  if (selectedWorkspace) {
                    await updateWorkspace(selectedWorkspace.id, {
                      title: selectedWorkspace.title
                    });
                    setShowSettingsModal(false);
                  }
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Changes
              </button>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default WorkspacesPage; 