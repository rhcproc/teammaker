import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from '../lib/router';
import { db } from '../services/firebase/config';
import { doc, getDoc, updateDoc, deleteDoc, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { storage } from '../services/firebase/config';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/layout/Header';
import Toast from '../components/common/Toast';
import { Assignment, TeamLeader, AssignmentSubmission, SimpleLectureNote, SimpleAttachment, LectureNoteSortOrder } from '../types';
import AssignmentSubmissionComponent from '../components/assignment/AssignmentSubmission';
import SimpleLectureNoteModal from '../components/lecture/SimpleLectureNoteModal';
import SimpleLectureNoteCard from '../components/lecture/SimpleLectureNoteCard';
import SimpleTaskSubmission from '../components/lecture/SimpleTaskSubmission';
import { parseTeamUrl, createTeamUrl, getUserIdFromEmail, findWorkspaceIdByUrl } from '../utils/urlUtils';
import { checkWorkspaceAccess, WorkspaceAccessResult } from '../utils/workspaceSecurity';
import { createAssignmentCreatedNotification } from '../services/notification/notificationService';
import { getUserIdsByEmails } from '../services/user/userService';
import AssignmentEvaluationModal from '../components/assignment/AssignmentEvaluationModal';
import BulkAssignmentEvaluationModal from '../components/assignment/BulkAssignmentEvaluationModal';
// LectureAssignmentEvaluationModal import는 제거됨
import TeamScoreCard from '../components/team/TeamScoreCard';
import { calculateTeamAverageScore, updateAllTeamAverageScores } from '../services/assignment/evaluationService';
import { 
  getSimpleLectureNotes, 
  createSimpleLectureNote, 
  updateSimpleLectureNote, 
  deleteSimpleLectureNote,
  uploadSimpleAttachment,
  deleteSimpleAttachment
} from '../services/lecture/simpleLectureService';
import { 
  getUserPreferences, 
  updateUserPreferences, 
  sortLectureNotes,
  getSortOrderLabel
} from '../services/user/preferencesService';
// import { addTeamLeader, addTeamMember } from '../services/team/teamService'; // 현재 비활성화됨

interface Member {
  id: string;
  name: string;
  email?: string;
  photoURL?: string;
  isAuthenticated?: boolean;
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

interface WorkspaceData {
  id: string;
  userId: string;
  createdAt: number;
  groups: Group[];
  members: Member[];
  groupSize: number;
  fixedPairs: FixedPair[];
  lockedTeams: LockedTeam[];
  title: string;
  // 팀 멤버십 관련 필드들 (기존 구조 + 새 구조 모두 사용)
  teamLeaderEmails?: {[teamId: string]: string};           // 기존 구조 (UI 호환성)
  teamMemberEmails?: {[teamId: string]: {[memberName: string]: string}}; // 기존 구조 (UI 호환성)
  leaders?: TeamLeader[];                                  // 새 구조 (TeamLeader 객체 배열)
  memberEmails?: string[];                                 // 새 구조 (array-contains 쿼리용)
  // 공개/비공개 설정
  isPublic?: boolean;                                      // true: 공개, false: 비공개 (멤버만)
}

interface WorkspacePageProps {
  darkMode: boolean;
  setDarkMode: (value: boolean | ((val: boolean) => boolean)) => void;
}

const WORKSPACE_REQUEST_TIMEOUT_MS = 10000;

const withTimeout = async <T,>(promise: Promise<T>, message: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), WORKSPACE_REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

function WorkspacePage({ darkMode, setDarkMode }: WorkspacePageProps) {
  const { workspaceId, teamName } = useParams<{ 
    workspaceId?: string; 
    teamName?: string; 
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessResult, setAccessResult] = useState<WorkspaceAccessResult | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [updatingTitle, setUpdatingTitle] = useState(false);
  
  // Assignment 관련 상태
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [selectedTeamLeader, setSelectedTeamLeader] = useState<TeamLeader | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [expandedAssignments, setExpandedAssignments] = useState<Set<string>>(new Set());
  const [refreshingAssignments, setRefreshingAssignments] = useState(false);
  
  // Evaluation 관련 상태
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [selectedSubmissionForEvaluation, setSelectedSubmissionForEvaluation] = useState<AssignmentSubmission | null>(null);
  const [showBulkEvaluationModal, setShowBulkEvaluationModal] = useState(false);
  const [selectedAssignmentForBulkEvaluation, setSelectedAssignmentForBulkEvaluation] = useState<Assignment | null>(null);
  // Lecture evaluation 관련 state들은 제거됨
  const [teamScores, setTeamScores] = useState<Map<string, { averageScore: number; totalAssignments: number; evaluatedAssignments: number }>>(new Map());
  const [newAssignment, setNewAssignment] = useState(() => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // 로컬 시간대 기준으로 오늘 00:00 설정
    const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0);
    // 로컬 시간대 기준으로 내일 23:59 설정
    const endDate = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59);
    
    // 로컬 시간대를 고려한 datetime-local 형식으로 변환
    const formatLocalDateTime = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };
    
    return {
      title: '',
      description: '',
      startDate: formatLocalDateTime(startDate), // 로컬 시간 오늘 00:00
      endDate: formatLocalDateTime(endDate), // 로컬 시간 내일 23:59
      maxPdfSize: 5, // 기본값 5MB
      allowedFileTypes: ['pdf'] // 기본값 PDF만 허용
    };
  });
  
  // Lecture Note 관련 상태
  const [lectureNotes, setLectureNotes] = useState<SimpleLectureNote[]>([]);
  const [showLectureNoteModal, setShowLectureNoteModal] = useState(false);
  const [editingLectureNote, setEditingLectureNote] = useState<SimpleLectureNote | null>(null);
  const [lectureNoteLoading, setLectureNoteLoading] = useState(false);
  const [refreshingLectureNotes, setRefreshingLectureNotes] = useState(false);
  const [lectureNoteSortOrder, setLectureNoteSortOrder] = useState<LectureNoteSortOrder>('week-asc');
  
  // 팀 리더 이메일 관리 (새 구조 사용)
  const [teamLeaderEmails, setTeamLeaderEmails] = useState<{[teamId: string]: string}>({});
  
  // 팀 리더 이메일 자동 설정 함수
  const autoSetTeamLeaderEmails = useCallback(() => {
    if (!workspaceData) return;
    
    const updatedTeamLeaderEmails = { ...teamLeaderEmails };
    let hasChanges = false;
    
    workspaceData.groups.forEach((group: any) => {
      const groupId = group.id;
      
      // 이미 이메일이 설정되어 있으면 스킵
      if (updatedTeamLeaderEmails[groupId]) return;
      
      // 첫 번째 멤버를 리더로 설정
      if (group.members && group.members.length > 0) {
        const firstMember = group.members[0];
        
        if (firstMember && firstMember.trim() !== '') {
          // 멤버 이름으로 이메일 찾기
          const memberData = workspaceData.members?.find((member: any) => member.name === firstMember);
          if (memberData?.email) {
            updatedTeamLeaderEmails[groupId] = memberData.email;
            hasChanges = true;
            console.log(`🔧 Auto-set leader email for ${groupId}: ${memberData.email}`);
          }
        }
      }
    });
    
    if (hasChanges) {
      setTeamLeaderEmails(updatedTeamLeaderEmails);
      console.log('✅ Auto-set team leader emails:', updatedTeamLeaderEmails);
    }
  }, [workspaceData, teamLeaderEmails]);
  const [savingEmails, setSavingEmails] = useState(false);
  
  // 팀 멤버 이메일 관리 (새 구조 사용)
  const [teamMemberEmails, setTeamMemberEmails] = useState<{[teamId: string]: {[memberName: string]: string}}>({});
  const [showTeamEmailModal, setShowTeamEmailModal] = useState(false);

  // workspaceData가 로드되면 팀 리더 이메일 자동 설정
  useEffect(() => {
    if (workspaceData && workspaceData.groups) {
      autoSetTeamLeaderEmails();
    }
  }, [workspaceData, autoSetTeamLeaderEmails]);
  const [selectedTeamForEmail, setSelectedTeamForEmail] = useState<{id: string, name: string, members: string[]} | null>(null);
  const [savingTeamEmails, setSavingTeamEmails] = useState(false);
  
  // 팀 멤버십 관리 (현재 비활성화됨)
  // const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  // const [newMemberEmail, setNewMemberEmail] = useState('');
  // const [newMemberRole, setNewMemberRole] = useState<'leader' | 'member'>('member');
  // const [addingMember, setAddingMember] = useState(false);
  
  
  // URL에서 workspaceId 추출
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);

  // 권한 체크: 팀 생성자인지 확인
  const userIdFromEmail = user?.email ? getUserIdFromEmail(user.email) : null;
  const isOwnerByUid = user && workspaceData && user.id === workspaceData.userId;
  const isOwnerByEmail = user && workspaceData && workspaceData.userId && user.email && workspaceData.userId === userIdFromEmail;
  const isOwner = accessResult?.isOwner || isOwnerByUid || isOwnerByEmail;
  
  // 사용자 역할에 따른 권한 확인
  const isViewer = accessResult?.userRole === 'viewer';
  const canEdit = isOwner || (accessResult?.isMember && !isViewer);
  
  // 디버깅용 로그
  console.log('Owner check detailed:', {
    user: user?.id,
    userEmail: user?.email,
    userIdFromEmail: userIdFromEmail,
    workspaceUserId: workspaceData?.userId,
    isOwnerByUid: isOwnerByUid,
    isOwnerByEmail: isOwnerByEmail,
    isOwner: isOwner,
    workspaceData: workspaceData // 전체 workspaceData 확인
  });

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    const resolveWorkspaceId = async () => {
      setLoading(true);
      setCheckingAccess(true);
      setError(null);
      setWorkspaceData(null);
      setAccessResult(null);

      if (workspaceId) {
        setCurrentWorkspaceId(workspaceId);
        return;
      }

      if (!teamName) {
        setCurrentWorkspaceId(null);
        setError('Workspace ID is required');
        setLoading(false);
        setCheckingAccess(false);
        return;
      }

      setCurrentWorkspaceId(null);

      try {
        const foundWorkspaceId = await withTimeout(
          findWorkspaceIdByUrl(teamName, db),
          'Workspace lookup timed out. Please open it again from My Workspaces.'
        );

        if (cancelled) return;

        if (!foundWorkspaceId) {
          setError('Workspace not found. Please open it again from My Workspaces.');
          setLoading(false);
          setCheckingAccess(false);
          return;
        }

        setCurrentWorkspaceId(foundWorkspaceId);
      } catch (error) {
        if (cancelled) return;
        setError(error instanceof Error ? error.message : 'Failed to resolve workspace URL');
        setLoading(false);
        setCheckingAccess(false);
      }
    };

    void resolveWorkspaceId();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, teamName, authLoading]);

  useEffect(() => {
    const loadWorkspace = async () => {
      if (!currentWorkspaceId || authLoading) return;

      setCheckingAccess(true);

      try {
        const docRef = doc(db, 'workspaces', currentWorkspaceId);
        const docSnap = await withTimeout(
          getDoc(docRef),
          'Workspace request timed out. Check your connection and try again.'
        );

        if (!docSnap.exists()) {
          setError('Workspace not found');
          setCheckingAccess(false);
          return;
        }

        const data = docSnap.data() as Omit<WorkspaceData, 'id'>;
        console.log('📥 Loaded workspace data:', {
          teamId: docSnap.id,
          teamName: data.title,
          memberEmails: data.memberEmails,
          leaders: data.leaders,
          groups: data.groups,
          groupsLength: data.groups?.length,
          groupsType: Array.isArray(data.groups) ? 'array' : typeof data.groups,
          groupsKeys: data.groups ? Object.keys(data.groups) : 'no groups'
        });
        
        setWorkspaceData({
          id: docSnap.id,
          ...data
        });

        // 접근 권한 확인
        const access = await checkWorkspaceAccess(user, currentWorkspaceId, data);
        setAccessResult(access);

        if (!access.hasAccess) {
          setError(`Access denied: ${access.reason}`);
          setCheckingAccess(false);
          return;
        }

      } catch (error) {
        console.error('Error loading workspace:', error);
        setError(`Failed to load workspace: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
        setCheckingAccess(false);
      }
    };

    loadWorkspace();
  }, [currentWorkspaceId, authLoading, user?.id, user?.email]);

  // Assignment 로드 함수
  const loadAssignments = async (showLoading = false) => {
    if (!currentWorkspaceId) return;
    
    if (showLoading) {
      setRefreshingAssignments(true);
    }
    
    try {
      console.log('Loading assignments for workspaceId:', currentWorkspaceId);
      const q = query(collection(db, 'assignments'), where('workspaceId', '==', currentWorkspaceId));
      const snapshot = await getDocs(q);
      console.log('Assignment query snapshot size:', snapshot.size);
      const assignmentsData: Assignment[] = [];
      snapshot.forEach(docSnap => {
        console.log('Assignment document:', docSnap.id, docSnap.data());
        assignmentsData.push({ id: docSnap.id, ...docSnap.data() } as Assignment);
      });
      console.log('Loaded assignments:', assignmentsData);
      setAssignments(assignmentsData);
      
      // 팀 점수 계산
      await calculateAllTeamScores();
    } catch (error) {
      console.error('Failed to load assignments:', error);
    } finally {
      if (showLoading) {
        setRefreshingAssignments(false);
      }
    }
  };

  // Lecture Note 로드 함수
  const loadLectureNotes = async (showLoading = false) => {
    if (!currentWorkspaceId) return;
    
    if (showLoading) {
      setRefreshingLectureNotes(true);
    }
    
    try {
      console.log('Loading lecture notes for workspaceId:', currentWorkspaceId);
      const result = await getSimpleLectureNotes(currentWorkspaceId);
      
      if (result.success && result.data) {
        console.log('Loaded lecture notes:', result.data);
        setLectureNotes(result.data);
        // 강제 리렌더링을 위한 상태 업데이트
        setLectureNotes(prev => [...prev]);
      } else {
        console.error('Failed to load lecture notes:', result.error);
        setLectureNotes([]);
      }
    } catch (error) {
      console.error('Failed to load lecture notes:', error);
      setLectureNotes([]);
    } finally {
      if (showLoading) {
        setRefreshingLectureNotes(false);
      }
    }
  };

  // Assignment 로드
  useEffect(() => {
    loadAssignments();
  }, [currentWorkspaceId]);

  // Lecture Note 로드
  useEffect(() => {
    loadLectureNotes();
  }, [currentWorkspaceId]);

  // 사용자 설정 로드
  useEffect(() => {
    const loadUserPreferences = async () => {
      if (!user?.id) return;
      
      try {
        const result = await getUserPreferences(user.id);
        if (result.success && result.data) {
          setLectureNoteSortOrder(result.data.lectureNoteSortOrder);
        }
      } catch (error) {
        console.error('Failed to load user preferences:', error);
      }
    };

    loadUserPreferences();
  }, [user?.id]);


  // 팀 리더 이메일 로드
  useEffect(() => {
    const loadTeamLeaderEmails = async () => {
      if (!currentWorkspaceId) return;
      
      try {
        const workspaceRef = doc(db, 'workspaces', currentWorkspaceId);
        const workspaceSnap = await getDoc(workspaceRef);
        
        if (workspaceSnap.exists()) {
          const data = workspaceSnap.data();
          
          console.log('🔍 Full Firebase document data:', data);
          
          // 기존 구조에서 리더/멤버 이메일 로딩 (UI 호환성)
          if (data.teamLeaderEmails) {
            setTeamLeaderEmails(data.teamLeaderEmails);
            console.log('📧 Loaded leader emails from existing structure:', data.teamLeaderEmails);
          } else {
            console.log('⚠️ No teamLeaderEmails found in Firebase data');
          }
          if (data.teamMemberEmails) {
            setTeamMemberEmails(data.teamMemberEmails);
            console.log('📧 Loaded member emails from existing structure:', data.teamMemberEmails);
          } else {
            console.log('⚠️ No teamMemberEmails found in Firebase data');
          }
          
          console.log('📧 Current Firebase data structure:', {
            hasLeaders: Array.isArray(data.leaders),
            leadersCount: Array.isArray(data.leaders) ? data.leaders.length : 0,
            hasMemberEmails: Array.isArray(data.memberEmails),
            memberEmailsCount: Array.isArray(data.memberEmails) ? data.memberEmails.length : 0,
            hasOldStructure: !!(data.teamLeaderEmails || data.teamMemberEmails),
            leaders: data.leaders,
            memberEmails: data.memberEmails,
            teamLeaderEmails: data.teamLeaderEmails,
            teamMemberEmails: data.teamMemberEmails
          });
          
          
          // 데이터 마이그레이션이 필요한지 확인
          if (!Array.isArray(data.leaders) && !Array.isArray(data.memberEmails)) {
            console.log('⚠️ Data migration needed - no new structure found');
            // 마이그레이션이 필요한 경우 사용자에게 알림
            setToastMessage('데이터 마이그레이션이 필요합니다. Firebase 최적화를 실행해주세요.');
            setShowToast(true);
          }
        }
      } catch (error) {
        console.error('Failed to load team leader emails:', error);
      }
    };
    
    loadTeamLeaderEmails();
  }, [currentWorkspaceId]);

  const formatDate = (timestamp: number | undefined) => {
    if (!timestamp || isNaN(timestamp)) {
      return 'Date not available';
    }
    try {
      return new Date(timestamp).toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (error) {
      return 'Date not available';
    }
  };

  // 팀 점수 계산 함수
  const calculateAllTeamScores = async () => {
    if (!workspaceData) return;
    
    try {
      const teamIds = workspaceData.leaders?.map(leader => leader.teamId) || [];
      const result = await updateAllTeamAverageScores(workspaceData.id, teamIds);
      
      if (result.success && result.data) {
        const newTeamScores = new Map();
        result.data.forEach((teamScore: any) => {
          newTeamScores.set(teamScore.teamId, {
            averageScore: teamScore.averageScore,
            totalAssignments: teamScore.totalAssignments,
            evaluatedAssignments: teamScore.evaluatedAssignments
          });
        });
        setTeamScores(newTeamScores);
      }
    } catch (error) {
      console.error('Failed to calculate team scores:', error);
    }
  };

  // 평가 모달 열기
  const openEvaluationModal = (submission: AssignmentSubmission) => {
    setSelectedSubmissionForEvaluation(submission);
    setShowEvaluationModal(true);
  };

  // 평가 성공 후 처리
  const handleEvaluationSuccess = async () => {
    await loadAssignments();
    await calculateAllTeamScores();
  };

  // Lecture Assignment 평가 모달은 제거됨

  // Lecture Assignment 평가 관련 함수들은 제거됨

  // Bulk Assignment 평가 모달 열기
  const openBulkEvaluationModal = (assignment: Assignment) => {
    setSelectedAssignmentForBulkEvaluation(assignment);
    setShowBulkEvaluationModal(true);
  };

  // Bulk Assignment 평가 성공 후 처리
  const handleBulkEvaluationSuccess = async () => {
    await loadAssignments();
    await calculateAllTeamScores();
  };

  // 팀 멤버 추가 함수 (현재 비활성화됨)
  /*
  const handleAddTeamMember = async () => {
    if (!currentWorkspaceId || !newMemberEmail.trim()) return;
    
    setAddingMember(true);
    try {
      const result = newMemberRole === 'leader' 
        ? await addTeamLeader(currentWorkspaceId, newMemberEmail.trim())
        : await addTeamMember(currentWorkspaceId, newMemberEmail.trim());
      
      if (result.success) {
        setToastMessage(`${newMemberRole === 'leader' ? 'Leader' : 'Member'} added successfully!`);
        setShowToast(true);
        setNewMemberEmail('');
        setNewMemberRole('member');
        setShowAddMemberModal(false);
        
        // 워크스페이스 데이터 새로고침
        if (currentWorkspaceId) {
          const workspaceRef = doc(db, 'workspaces', currentWorkspaceId);
          const workspaceSnap = await getDoc(workspaceRef);
          if (workspaceSnap.exists()) {
            setWorkspaceData({ id: workspaceSnap.id, ...workspaceSnap.data() } as any);
          }
        }
      } else {
        setToastMessage(result.error || 'Failed to add member');
        setShowToast(true);
      }
    } catch (error) {
      console.error('Failed to add team member:', error);
      setToastMessage('Failed to add member');
      setShowToast(true);
    } finally {
      setAddingMember(false);
    }
  };
  */

  const openSettingsModal = () => {
    setEditTitle(workspaceData?.title || '');
    console.log('🔧 Opening Settings Modal - Current state:', {
      teamLeaderEmails,
      teamMemberEmails,
      workspaceData: workspaceData ? {
        teamLeaderEmails: workspaceData.teamLeaderEmails,
        teamMemberEmails: workspaceData.teamMemberEmails,
        leaders: workspaceData.leaders,
        memberEmails: workspaceData.memberEmails
      } : null
    });
    setShowSettingsModal(true);
  };

  const updateWorkspaceTitle = async () => {
    if (!workspaceData || !editTitle.trim()) return;
    
    setUpdatingTitle(true);
    try {
      const workspaceRef = doc(db, 'workspaces', workspaceData.id);
      await updateDoc(workspaceRef, {
        title: editTitle.trim()
      });
      
      setWorkspaceData({
        ...workspaceData,
        title: editTitle.trim()
      });
      
      // 새로운 URL로 리다이렉트 (팀 소유자인 경우)
      if (user && user.email && isOwner) {
        const newUrl = await createTeamUrl(
          getUserIdFromEmail(user.email),
          editTitle.trim(),
          workspaceData.id,
          db
        );
        navigate(newUrl, { replace: true });
      }
      
      setShowSettingsModal(false);
      setToastMessage('Team name updated successfully!');
      setShowToast(true);
    } catch (error) {
      setToastMessage('Failed to update workspace title. Please try again.');
      setShowToast(true);
    } finally {
      setUpdatingTitle(false);
    }
  };

  const saveTeamLeaderEmails = async () => {
    if (!workspaceData) return;

    setSavingEmails(true);
    try {
      console.log('🚀 Starting saveTeamLeaderEmails function');
      console.log('📊 workspaceData:', workspaceData);
      console.log('📊 teamLeaderEmails state:', teamLeaderEmails);
      
      const workspaceRef = doc(db, 'workspaces', workspaceData.id);
      
      // 새 구조 (leaders 배열)를 기준으로 변경 감지
      const currentLeaders = workspaceData.leaders || [];
      const newLeaderEmails = teamLeaderEmails || {};
      
      console.log('📊 currentLeaders:', currentLeaders);
      console.log('📊 newLeaderEmails:', newLeaderEmails);
      
      // 새로 입력된 리더 이메일들을 배열로 변환 (안전하게)
      let newLeaders: string[] = [];
      try {
        if (newLeaderEmails && typeof newLeaderEmails === 'object') {
          newLeaders = Object.values(newLeaderEmails)
            .filter(email => email && typeof email === 'string' && email.trim() !== '')
            .map(email => email.trim());
        }
      } catch (error) {
        console.error('❌ Error processing newLeaderEmails:', error);
        newLeaders = [];
      }
      
      console.log('🔍 New leaders from teamLeaderEmails:', newLeaders);
      
      // 제거된 리더 이메일들 찾기 (현재 leaders에는 있지만 새 입력에는 없는 이메일)
      const removedLeaderEmails: string[] = [];
      
      // leaders 배열의 구조 확인 및 이메일 추출
      let currentLeaderEmails: string[] = [];
      try {
        if (Array.isArray(workspaceData?.leaders)) {
          currentLeaderEmails = workspaceData.leaders
            .map((leader: any) => {
              // leader가 문자열인 경우
              if (typeof leader === 'string') {
                return leader.trim();
              }
              // leader가 객체인 경우
              if (typeof leader === 'object' && leader !== null) {
                return (leader.leaderEmail || leader.email || '').trim();
              }
              return '';
            })
            .filter(email => email && email !== '');
        }
      } catch (error) {
        console.error('❌ Error processing currentLeaders:', error);
        currentLeaderEmails = [];
      }
      
      console.log('🔍 Current leader emails from leaders array:', currentLeaderEmails);
      
      currentLeaderEmails.forEach(email => {
        if (email && typeof email === 'string' && !newLeaders.some(leader => leader === email)) {
          removedLeaderEmails.push(email);
        }
      });
      
      // 추가된 리더 이메일들 찾기 (새 입력에는 있지만 현재 leaders에는 없는 이메일)
      const addedLeaderEmails: string[] = [];
      newLeaders.forEach(email => {
        if (email && typeof email === 'string' && !currentLeaderEmails.some(leader => leader === email)) {
          addedLeaderEmails.push(email);
        }
      });
      
      console.log('📊 Leader email changes detected:', {
        removedLeaderEmails,
        addedLeaderEmails,
        currentLeaders,
        newLeaders
      });
      
      // Firebase 업데이트 (기존 구조 + 새 구조 모두 업데이트)
      await updateDoc(workspaceRef, {
        teamLeaderEmails: newLeaderEmails
      });
      
      // 새로운 구조에서 리더 제거/추가
      let updatedLeaders: string[] = [];
      
      // 현재 leaders 배열을 문자열 배열로 변환
      if (Array.isArray(currentLeaders)) {
        updatedLeaders = currentLeaders.map((leader: any) => {
          if (typeof leader === 'string') {
            return leader;
          }
          if (typeof leader === 'object' && leader !== null) {
            return leader.leaderEmail || leader.email || '';
          }
          return '';
        }).filter(email => email && email.trim() !== '');
      }
      
      // 제거된 리더 이메일들을 leaders에서 제거
      removedLeaderEmails.forEach(email => {
        if (email && typeof email === 'string') {
          updatedLeaders = updatedLeaders.filter(leaderEmail => leaderEmail !== email);
          console.log(`🗑️ Removed leader email: ${email}`);
        }
      });
      
      // 추가된 리더 이메일들을 leaders에 추가
      addedLeaderEmails.forEach(email => {
        if (email && typeof email === 'string' && !updatedLeaders.some(leader => leader === email)) {
          updatedLeaders.push(email);
          console.log(`➕ Added leader email: ${email}`);
        }
      });
      
      // 새로운 구조 업데이트
      const sortedUpdatedLeaders = [...updatedLeaders].sort();
      const sortedCurrentLeaders = [...currentLeaderEmails].sort();
      
      if (JSON.stringify(sortedUpdatedLeaders) !== JSON.stringify(sortedCurrentLeaders)) {
        await updateDoc(workspaceRef, {
          leaders: updatedLeaders
        });
        console.log('✅ Updated leaders array:', updatedLeaders);
      }
      
      // 기존 과제들의 팀 리더 이메일도 업데이트
      await updateExistingAssignmentsTeamLeaderEmails();
      
      const changeMessage = [];
      if (removedLeaderEmails.length > 0) {
        changeMessage.push(`${removedLeaderEmails.length}명 리더 제거`);
      }
      if (addedLeaderEmails.length > 0) {
        changeMessage.push(`${addedLeaderEmails.length}명 리더 추가`);
      }
      
      const message = changeMessage.length > 0 
        ? `리더 이메일이 저장되었습니다. (${changeMessage.join(', ')})`
        : '리더 이메일이 저장되었습니다.';
      
      setToastMessage(message);
      setShowToast(true);
      setShowSettingsModal(false); // Settings 창 닫기
    } catch (error) {
      console.error('❌ Failed to save team leader emails:', error);
      setToastMessage('리더 이메일 저장에 실패했습니다. 다시 시도해주세요.');
      setShowToast(true);
    } finally {
      setSavingEmails(false);
    }
  };

  const saveTeamMemberEmails = async () => {
    if (!workspaceData || !selectedTeamForEmail) return;

    setSavingTeamEmails(true);
    try {
      const workspaceRef = doc(db, 'workspaces', workspaceData.id);
      
      // 새 구조 (memberEmails 배열)를 기준으로 변경 감지
      const currentMemberEmails = workspaceData.memberEmails || [];
      const newTeamEmails = teamMemberEmails[selectedTeamForEmail.id] || {};
      
      // 새로 입력된 이메일들을 배열로 변환
      const newEmails = Object.values(newTeamEmails).filter(email => email && email.trim() !== '');
      
      // 제거된 이메일들 찾기 (현재 memberEmails에는 있지만 새 입력에는 없는 이메일)
      const removedEmails: string[] = [];
      currentMemberEmails.forEach(email => {
        if (!newEmails.includes(email)) {
          removedEmails.push(email);
        }
      });
      
      // 추가된 이메일들 찾기 (새 입력에는 있지만 현재 memberEmails에는 없는 이메일)
      const addedEmails: string[] = [];
      newEmails.forEach(email => {
        if (!currentMemberEmails.includes(email)) {
          addedEmails.push(email);
        }
      });
      
      console.log('📊 Email changes detected:', {
        removedEmails,
        addedEmails,
        currentMemberEmails,
        newEmails,
        selectedTeamId: selectedTeamForEmail.id
      });
      
      // Firebase 업데이트 (기존 구조 + 새 구조 모두 업데이트)
      await updateDoc(workspaceRef, {
        teamMemberEmails
      });
      
      // 새로운 구조에서 멤버 제거/추가
      let updatedMemberEmails = [...currentMemberEmails];
      
      // 제거된 이메일들을 memberEmails에서 제거
      removedEmails.forEach(email => {
        updatedMemberEmails = updatedMemberEmails.filter(e => e !== email);
        console.log(`🗑️ Removed member email: ${email}`);
      });
      
      // 추가된 이메일들을 memberEmails에 추가
      addedEmails.forEach(email => {
        if (!updatedMemberEmails.includes(email)) {
          updatedMemberEmails.push(email);
          console.log(`➕ Added member email: ${email}`);
        }
      });
      
      // 새로운 구조 업데이트
      if (JSON.stringify(updatedMemberEmails.sort()) !== JSON.stringify(currentMemberEmails.sort())) {
        console.log('🔄 Updating memberEmails array:', {
          before: currentMemberEmails,
          after: updatedMemberEmails,
          changes: { removed: removedEmails, added: addedEmails }
        });
        
        await updateDoc(workspaceRef, {
          memberEmails: updatedMemberEmails
        });
        
        console.log('✅ Successfully updated memberEmails array:', updatedMemberEmails);
        
        // 업데이트 후 Firebase에서 다시 읽어서 확인
        const updatedDoc = await getDoc(workspaceRef);
        const updatedData = updatedDoc.data();
        console.log('🔍 Firebase verification - memberEmails after update:', updatedData?.memberEmails);
      } else {
        console.log('ℹ️ No changes needed for memberEmails array');
      }
      
      const changeMessage = [];
      if (removedEmails.length > 0) {
        changeMessage.push(`${removedEmails.length}명 제거`);
      }
      if (addedEmails.length > 0) {
        changeMessage.push(`${addedEmails.length}명 추가`);
      }
      
      const message = changeMessage.length > 0 
        ? `멤버 이메일이 저장되었습니다. (${changeMessage.join(', ')})`
        : '멤버 이메일이 저장되었습니다.';
      
      setToastMessage(message);
      setShowToast(true);
      setShowTeamEmailModal(false);
    } catch (error) {
      console.error('❌ Failed to save team member emails:', error);
      setToastMessage('멤버 이메일 저장에 실패했습니다. 다시 시도해주세요.');
      setShowToast(true);
    } finally {
      setSavingTeamEmails(false);
    }
  };

  const openTeamEmailModal = (team: {id: string, name: string, members: string[]}) => {
    setSelectedTeamForEmail(team);
    setShowTeamEmailModal(true);
  };

  const updateExistingAssignmentsTeamLeaderEmails = async () => {
    if (!workspaceData) return;
    
    try {
      // 현재 워크스페이스의 모든 과제 조회
      const assignmentsQuery = query(
        collection(db, 'assignments'), 
        where('workspaceId', '==', workspaceData.id)
      );
      const assignmentsSnapshot = await getDocs(assignmentsQuery);
      
      // 각 과제의 팀 리더 이메일 업데이트
      const updatePromises = assignmentsSnapshot.docs.map(async (assignmentDoc) => {
        const assignmentData = assignmentDoc.data() as Assignment;
        const updatedTeamLeaders = assignmentData.teamLeaders.map(teamLeader => {
          // 새로운 이메일이 있으면 업데이트
          const newEmail = teamLeaderEmails[teamLeader.teamId];
          if (newEmail && newEmail !== teamLeader.leaderEmail) {
            return {
              ...teamLeader,
              leaderEmail: newEmail
            };
          }
          return teamLeader;
        });
        
        // 제출된 과제들의 리더 이메일도 업데이트
        const updatedSubmissions = assignmentData.submissions?.map(submission => {
          const newEmail = teamLeaderEmails[submission.teamId];
          if (newEmail && newEmail !== submission.leaderEmail) {
            return {
              ...submission,
              leaderEmail: newEmail
            };
          }
          return submission;
        }) || [];
        
        // 변경사항이 있는 경우에만 업데이트
        const hasTeamLeaderChanges = updatedTeamLeaders.some((updated, index) => 
          updated.leaderEmail !== assignmentData.teamLeaders[index].leaderEmail
        );
        
        const hasSubmissionChanges = updatedSubmissions.some((updated, index) => 
          assignmentData.submissions && 
          updated.leaderEmail !== assignmentData.submissions[index].leaderEmail
        );
        
        if (hasTeamLeaderChanges || hasSubmissionChanges) {
          const assignmentRef = doc(db, 'assignments', assignmentDoc.id);
          const updateData: any = {};
          
          if (hasTeamLeaderChanges) {
            updateData.teamLeaders = updatedTeamLeaders;
          }
          
          if (hasSubmissionChanges) {
            updateData.submissions = updatedSubmissions;
          }
          
          await updateDoc(assignmentRef, updateData);
        }
      });
      
      await Promise.all(updatePromises);
    } catch (error) {
      console.error('Failed to update existing assignments team leader emails:', error);
      // 에러가 발생해도 사용자에게는 성공 메시지를 보여줌 (워크스페이스 이메일은 저장되었으므로)
    }
  };


  const createAssignment = async () => {
    if (!workspaceData || !user || !newAssignment.title.trim()) return;
    
    setAssignmentLoading(true);
    try {
      // 팀 리더 정보 생성 (저장된 이메일 사용)
      const teamLeaders: TeamLeader[] = workspaceData.groups.map((group, index) => {
        const leaderName = group.members[0] && group.members[0] !== '' ? group.members[0] : `Team ${index + 1} Leader`;
        const leaderEmail = teamLeaderEmails[group.id] || '';
        
        console.log('🔍 Creating team leader for assignment:', {
          teamId: group.id,
          teamName: `Team ${index + 1}`,
          leaderName,
          leaderEmail,
          teamLeaderEmails: teamLeaderEmails,
          allTeamLeaderEmails: teamLeaderEmails
        });
        
        return {
          teamId: group.id,
          teamName: `Team ${index + 1}`,
          leaderName,
          leaderEmail,
          isVerified: false
        };
      });

      const assignmentData = {
        title: newAssignment.title.trim(),
        description: newAssignment.description.trim(),
        workspaceId: workspaceData.id,
        createdBy: user.id,
        createdAt: Date.now(),
        startDate: newAssignment.startDate ? new Date(newAssignment.startDate + ':00').getTime() : null,
        endDate: newAssignment.endDate ? new Date(newAssignment.endDate + ':00').getTime() : null,
        maxPdfSize: newAssignment.maxPdfSize,
        allowedFileTypes: newAssignment.allowedFileTypes,
        teamLeaders,
        submissions: []
      };

      const docRef = await addDoc(collection(db, 'assignments'), assignmentData);
      
      // 팀 멤버들에게 알림 전송
      try {
        const allMembers = workspaceData.groups.flatMap(group => group.members);
        const uniqueMembers = Array.from(new Set(allMembers)); // 중복 제거
        
        // 현재 사용자 제외한 멤버들만 필터링
        const targetMembers = uniqueMembers.filter(memberEmail => 
          memberEmail && memberEmail !== user.email
        );
        
        if (targetMembers.length > 0) {
          // 이메일로 사용자 ID들 찾기
          const userMappings = await getUserIdsByEmails(targetMembers);
          
          // 각 사용자에게 알림 전송
          for (const mapping of userMappings) {
            if (mapping.userId) {
              try {
                await createAssignmentCreatedNotification(
                  mapping.userId,
                  newAssignment.title.trim(),
                  workspaceData.id,
                  docRef.id
                );
              } catch (notificationError) {
                console.error(`Failed to send notification to ${mapping.email}:`, notificationError);
              }
            } else {
              console.log(`User not found for email: ${mapping.email}`);
            }
          }
        }
      } catch (error) {
        console.error('Failed to send assignment notifications:', error);
      }
      
      setShowAssignmentModal(false);
      setNewAssignment({ title: '', description: '', startDate: '', endDate: '', maxPdfSize: 5, allowedFileTypes: ['pdf'] });
      setToastMessage('Assignment created successfully!');
      setShowToast(true);
      
      // Assignment 목록 새로고침
      const q = query(collection(db, 'assignments'), where('workspaceId', '==', workspaceData.id));
      const snapshot = await getDocs(q);
      const assignmentsData: Assignment[] = [];
      snapshot.forEach(docSnap => {
        assignmentsData.push({ id: docSnap.id, ...docSnap.data() } as Assignment);
      });
      setAssignments(assignmentsData);
    } catch (error) {
      setToastMessage('Failed to create assignment. Please try again.');
      setShowToast(true);
    } finally {
      setAssignmentLoading(false);
    }
  };

  const updateAssignment = async () => {
    if (!editingAssignment || !newAssignment.title.trim()) return;

    setAssignmentLoading(true);
    try {
      const assignmentRef = doc(db, 'assignments', editingAssignment.id);
      const assignmentData = {
        title: newAssignment.title.trim(),
        description: newAssignment.description.trim(),
        startDate: newAssignment.startDate ? new Date(newAssignment.startDate + ':00').getTime() : null,
        endDate: newAssignment.endDate ? new Date(newAssignment.endDate + ':00').getTime() : null,
        maxPdfSize: newAssignment.maxPdfSize,
        allowedFileTypes: newAssignment.allowedFileTypes,
      };

      await updateDoc(assignmentRef, assignmentData);
      
      setShowAssignmentModal(false);
      setEditingAssignment(null);
      setNewAssignment({ title: '', description: '', startDate: '', endDate: '', maxPdfSize: 5, allowedFileTypes: ['pdf'] });
      
      // Assignment 목록 새로고침
      const q = query(collection(db, 'assignments'), where('workspaceId', '==', workspaceData?.id));
      const snapshot = await getDocs(q);
      const assignmentsData: Assignment[] = [];
      snapshot.forEach(docSnap => {
        assignmentsData.push({ id: docSnap.id, ...docSnap.data() } as Assignment);
      });
      setAssignments(assignmentsData);
      
      setToastMessage('Assignment updated successfully!');
      setShowToast(true);
    } catch (error) {
      setToastMessage('Failed to update assignment. Please try again.');
      setShowToast(true);
    } finally {
      setAssignmentLoading(false);
    }
  };

  const openEditAssignment = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    
    // 로컬 시간대를 유지하면서 datetime-local 형식으로 변환
    const formatLocalDateTime = (timestamp: number) => {
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };
    
    setNewAssignment({
      title: assignment.title,
      description: assignment.description || '',
      startDate: assignment.startDate ? formatLocalDateTime(assignment.startDate) : '',
      endDate: assignment.endDate ? formatLocalDateTime(assignment.endDate) : '',
      maxPdfSize: assignment.maxPdfSize || 5,
      allowedFileTypes: assignment.allowedFileTypes || ['pdf']
    });
    setShowAssignmentModal(true);
  };

  const deleteAssignment = async () => {
    if (!editingAssignment) return;

    if (!window.confirm('Are you sure you want to delete this assignment? This will also delete all submitted files. This action cannot be undone.')) {
      return;
    }

    setAssignmentLoading(true);
    try {
      // 1. 먼저 제출된 파일들을 Storage에서 삭제
      if (editingAssignment.submissions && editingAssignment.submissions.length > 0) {
        console.log('Deleting submitted files from Storage...');
        
        for (const submission of editingAssignment.submissions) {
          try {
            // files 배열이 있는 경우 (새로운 구조)
            if (submission.files && Array.isArray(submission.files)) {
              for (const file of submission.files) {
                try {
                  const fileRef = ref(storage, file.fileUrl);
                  await deleteObject(fileRef);
                  console.log('Deleted file:', file.fileName);
                } catch (fileError) {
                  console.error('Failed to delete file:', file.fileName, fileError);
                }
              }
            } 
            // fileUrl이 쉼표로 구분된 경우 (기존 구조)
            else if (submission.fileUrl && submission.fileUrl.includes(',')) {
              const urls = submission.fileUrl.split(', ');
              for (const url of urls) {
                try {
                  const fileRef = ref(storage, url.trim());
                  await deleteObject(fileRef);
                  console.log('Deleted file from URL:', url.trim());
                } catch (fileError) {
                  console.error('Failed to delete file from URL:', url.trim(), fileError);
                }
              }
            }
            // 단일 파일인 경우
            else if (submission.fileUrl) {
              try {
                const fileRef = ref(storage, submission.fileUrl);
                await deleteObject(fileRef);
                console.log('Deleted single file:', submission.fileName);
              } catch (fileError) {
                console.error('Failed to delete single file:', submission.fileName, fileError);
              }
            }
          } catch (submissionError) {
            console.error('Failed to process submission:', submission, submissionError);
          }
        }
      }
      
      // 2. Firestore에서 Assignment 문서 삭제
      await deleteDoc(doc(db, 'assignments', editingAssignment.id));
      
      setShowAssignmentModal(false);
      setEditingAssignment(null);
      setNewAssignment({ title: '', description: '', startDate: '', endDate: '', maxPdfSize: 5, allowedFileTypes: ['pdf'] });
      
      // Assignment 목록 새로고침
      const q = query(collection(db, 'assignments'), where('workspaceId', '==', workspaceData?.id));
      const snapshot = await getDocs(q);
      const assignmentsData: Assignment[] = [];
      snapshot.forEach(docSnap => {
        assignmentsData.push({ id: docSnap.id, ...docSnap.data() } as Assignment);
      });
      setAssignments(assignmentsData);
      
      setToastMessage('Assignment and all submitted files deleted successfully!');
      setShowToast(true);
    } catch (error) {
      console.error('Failed to delete assignment:', error);
      setToastMessage('Failed to delete assignment. Please try again.');
      setShowToast(true);
    } finally {
      setAssignmentLoading(false);
    }
  };

  // Lecture Note 핸들러 함수들
  const handleCreateLectureNote = async (data: {
    title: string;
    description: string;
    week: number;
    date?: string;
    hasTask: boolean;
    assignmentType?: 'team' | 'individual';
    taskData?: {
      title: string;
      description: string;
      deadline?: number | null;
      maxFileSize?: number;
      allowedFileTypes?: string[];
    };
  }) => {
    if (!workspaceData || !user) return;

    setLectureNoteLoading(true);
    try {
      const result = await createSimpleLectureNote(
        data.title,
        data.description,
        data.week,
        workspaceData.id,
        user.id,
        data.hasTask,
        data.taskData,
        data.date,
        data.assignmentType
      );

      if (result.success) {
        setShowLectureNoteModal(false);
        setToastMessage('Lecture note created successfully!');
        setShowToast(true);
        await loadLectureNotes();
      } else {
        setToastMessage(result.error || 'Failed to create lecture note');
        setShowToast(true);
      }
    } catch (error) {
      console.error('Failed to create lecture note:', error);
      setToastMessage('Failed to create lecture note. Please try again.');
      setShowToast(true);
    } finally {
      setLectureNoteLoading(false);
    }
  };

  const handleUpdateLectureNote = async (data: {
    title: string;
    description: string;
    week: number;
    date?: string;
    hasTask: boolean;
    taskData?: {
      title: string;
      description: string;
      deadline?: number | null;
      maxFileSize?: number;
      allowedFileTypes?: string[];
    };
  }) => {
    if (!editingLectureNote) return;

    setLectureNoteLoading(true);
    try {
      const result = await updateSimpleLectureNote(editingLectureNote.id, {
        title: data.title,
        description: data.description,
        week: data.week,
        date: data.date,
        hasTask: data.hasTask,
        taskTitle: data.taskData?.title || '',
        taskDescription: data.taskData?.description || '',
        taskDeadline: data.taskData?.deadline || null,
        maxFileSize: data.taskData?.maxFileSize || 5,
        allowedFileTypes: data.taskData?.allowedFileTypes || ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png']
      });

      if (result.success) {
        setShowLectureNoteModal(false);
        setEditingLectureNote(null);
        setToastMessage('Lecture note updated successfully!');
        setShowToast(true);
        await loadLectureNotes();
      } else {
        setToastMessage(result.error || 'Failed to update lecture note');
        setShowToast(true);
      }
    } catch (error) {
      console.error('Failed to update lecture note:', error);
      setToastMessage('Failed to update lecture note. Please try again.');
      setShowToast(true);
    } finally {
      setLectureNoteLoading(false);
    }
  };

  const handleDeleteLectureNote = async (noteId: string) => {
    setLectureNoteLoading(true);
    try {
      const result = await deleteSimpleLectureNote(noteId);
      
      if (result.success) {
        setToastMessage('Lecture note deleted successfully!');
        setShowToast(true);
        await loadLectureNotes();
      } else {
        setToastMessage(result.error || 'Failed to delete lecture note');
        setShowToast(true);
      }
    } catch (error) {
      console.error('Failed to delete lecture note:', error);
      setToastMessage('Failed to delete lecture note. Please try again.');
      setShowToast(true);
    } finally {
      setLectureNoteLoading(false);
    }
  };

  const handleEditLectureNote = (note: SimpleLectureNote) => {
    setEditingLectureNote(note);
    setShowLectureNoteModal(true);
  };

  const handleAddAttachment = async (noteId: string, file: File) => {
    if (!user) return;

    try {
      const result = await uploadSimpleAttachment(noteId, file, user.email);
      
      if (result.success) {
        setToastMessage('File uploaded successfully!');
        setShowToast(true);
        await loadLectureNotes();
      } else {
        setToastMessage(result.error || 'Failed to upload file');
        setShowToast(true);
      }
    } catch (error) {
      console.error('Failed to add attachment:', error);
      setToastMessage('Failed to upload file. Please try again.');
      setShowToast(true);
    }
  };

  const handleRemoveAttachment = async (noteId: string, attachment: SimpleAttachment) => {
    try {
      const result = await deleteSimpleAttachment(noteId, attachment);
      
      if (result.success) {
        setToastMessage('Attachment removed successfully!');
        setShowToast(true);
        await loadLectureNotes();
      } else {
        setToastMessage(result.error || 'Failed to remove attachment');
        setShowToast(true);
      }
    } catch (error) {
      console.error('Failed to remove attachment:', error);
      setToastMessage('Failed to remove attachment. Please try again.');
      setShowToast(true);
    }
  };

  const handleTogglePublish = async (noteId: string, isPublished: boolean) => {
    try {
      const result = await updateSimpleLectureNote(noteId, { isPublished });
      
      if (result.success) {
        setToastMessage(`Lecture note ${isPublished ? 'published' : 'unpublished'} successfully!`);
        setShowToast(true);
        await loadLectureNotes();
      } else {
        setToastMessage(result.error || 'Failed to update lecture note');
        setShowToast(true);
      }
    } catch (error) {
      console.error('Failed to toggle publish:', error);
      setToastMessage('Failed to update lecture note. Please try again.');
      setShowToast(true);
    }
  };

  // Lecture note에 팀 할당 (자동으로 처리됨)
  // 이 함수는 더 이상 필요하지 않음 - 팀 할당은 lecture note 생성 시 자동으로 처리됨

  const deleteWorkspace = async () => {
    if (!workspaceData) return;
    
    if (!window.confirm('Are you sure you want to delete this Team? This action cannot be undone.')) {
      return;
    }
    
    try {
      await deleteDoc(doc(db, 'workspaces', workspaceData.id));
      setToastMessage('Workspace deleted successfully!');
      setShowToast(true);
      
      // Delete team 후 워크스페이스 목록으로 리다이렉트
      navigate('/workspaces');
    } catch (error) {
      setToastMessage('Failed to delete Team. Please try again.');
      setShowToast(true);
    }
  };

  const openSubmissionModal = (assignment: Assignment, teamLeader: TeamLeader) => {
    // 권한 확인: 로그인한 사용자의 이메일이 팀 리더 이메일과 일치하거나 워크스페이스 소유자인지 확인
    const isAuthorized = user && user.email && user.email.toLowerCase() === teamLeader.leaderEmail.toLowerCase();
    const isOwner = user && workspaceData && user.id === workspaceData.userId;
    
    if (!isAuthorized && !isOwner) {
      setToastMessage('Only team leaders can submit assignments.');
      setShowToast(true);
      return;
    }
    
    setSelectedAssignment(assignment);
    setSelectedTeamLeader(teamLeader);
    setShowSubmissionModal(true);
  };

  const toggleAssignmentExpansion = (assignmentId: string) => {
    setExpandedAssignments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(assignmentId)) {
        newSet.delete(assignmentId);
      } else {
        newSet.add(assignmentId);
      }
      return newSet;
    });
  };

  const changeTeamLeader = async (teamIndex: number, newLeaderName: string) => {
    if (!workspaceData || !isOwner) return;
    
    try {
      // 새 리더의 이메일 찾기
      let newLeaderEmail: string | undefined;
      if (newLeaderName !== '') {
        const memberData = workspaceData.members?.find((m: any) => m.name === newLeaderName);
        newLeaderEmail = memberData?.email;
      }
      
      // 새로운 서비스 함수 사용
      const { changeTeamLeader: changeTeamLeaderService } = await import('../services/team/teamService');
      const result = await changeTeamLeaderService(
        workspaceData.id,
        teamIndex,
        newLeaderName,
        newLeaderEmail
      );
      
      if (result.success) {
        // 로컬 상태 업데이트를 위해 데이터 다시 가져오기
        const workspaceRef = doc(db, 'workspaces', workspaceData.id);
        const updatedSnap = await getDoc(workspaceRef);
        if (updatedSnap.exists()) {
          setWorkspaceData(updatedSnap.data() as WorkspaceData);
        }
        
        setToastMessage(`Team ${teamIndex + 1} leader ${newLeaderName === '' ? 'removed' : 'changed to ' + newLeaderName}!`);
        setShowToast(true);
      } else {
        setToastMessage(result.error || 'Failed to change team leader. Please try again.');
        setShowToast(true);
      }
    } catch (error) {
      console.error('Failed to change team leader:', error);
      setToastMessage('Failed to change team leader. Please try again.');
      setShowToast(true);
    }
  };




  if (loading || checkingAccess) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <Header onBackToLanding={() => navigate('/')} darkMode={darkMode} setDarkMode={setDarkMode} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="text-6xl mb-4 animate-bounce">🎲</div>
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                {checkingAccess ? 'Checking Access...' : 'Loading Team...'}
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
    );
  }

  // 접근 권한이 없는 경우
  if (accessResult && !accessResult.hasAccess) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <Header onBackToLanding={() => navigate('/')} darkMode={darkMode} setDarkMode={setDarkMode} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center max-w-md mx-auto">
              <div className="text-6xl mb-4">🔒</div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Access Denied
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {accessResult.reason || 'You do not have permission to access this workspace.'}
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
    );
  }

  if (error || !workspaceData) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <Header onBackToLanding={() => navigate('/')} darkMode={darkMode} setDarkMode={setDarkMode} onNavToggle={setNavOpen} />
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-all duration-300 ease-in-out ${
          navOpen ? 'ml-72' : 'ml-0'
        }`}>
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="text-6xl mb-4">❌</div>
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                {error || 'Team not found'}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {error && error.includes('permission') 
                  ? 'This team may be private or you may not have permission to view it.'
                  : 'The team you are looking for does not exist or has been deleted.'
                }
              </p>
              <button
                onClick={() => navigate('/')}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Go Back Home
              </button>
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
      <div className={`max-w mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-all duration-300 ease-in-out ${
        navOpen ? 'ml-72' : 'ml-0'
      }`}>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6 max-w-6xl mx-auto">
          {/* 공유된 팀 안내 메시지 */}
          {!isOwner && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center space-x-2">
                <span className="text-blue-600 dark:text-blue-400">🔗</span>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  This is a shared team. 
                </p>
              </div>
            </div>
          )}
          
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                {workspaceData.title}
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                Created on {formatDate(workspaceData.createdAt)}
              </p>
            </div>
            <div className="flex space-x-3">
              {isOwner && (
            <button
              onClick={openSettingsModal}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Settings
            </button>
              )}
              {isViewer && (
                <div className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg text-sm">
                  👁️ View Only Mode
                </div>
              )}
            </div>
          </div>

          {/* Workspace Info */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 max-w-4xl mx-auto">
            <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {workspaceData.members.length}
              </div>
              <div className="text-sm text-blue-600 dark:text-blue-400">Total Members</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {workspaceData.groups.length}
              </div>
              <div className="text-sm text-green-600 dark:text-green-400">Workspaces Created</div>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/30 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {workspaceData.groupSize}
              </div>
              <div className="text-sm text-purple-600 dark:text-purple-400">Group Size</div>
            </div>
            <div className="bg-orange-50 dark:bg-orange-900/30 p-4 rounded-lg">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {workspaceData.fixedPairs.length + workspaceData.lockedTeams.length}
              </div>
              <div className="text-sm text-orange-600 dark:text-orange-400">Fixed Groups</div>
            </div>
          </div>

          {/* Teams Display */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Teams</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {workspaceData.groups.map((group, index) => (
                <div key={group.id} className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/40 dark:to-purple-900/40 rounded-lg p-4 border border-blue-200 dark:border-blue-900/40">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center space-x-2">
                      <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-200 whitespace-nowrap" style={{ whiteSpace: 'nowrap' }}>Team {index + 1}</h3>
                      {(() => {
                        const teamLeader = group.members[0] && group.members[0] !== '' ? group.members[0] : null;
                        
                        // 디버깅을 위한 로그
                        console.log('Permission check for Team', index + 1, ':', {
                          teamLeader,
                          userEmail: user?.email,
                          userDisplayName: user?.displayName,
                          isOwner,
                          groupId: group.id,
                          allMembers: group.members
                        });
                        
                        // 팀 리더의 이메일 가져오기
                        const leaderEmail = teamLeaderEmails[group.id] || '';
                        
                        // 사용자가 이 팀의 멤버인지 확인 (이메일 기반)
                        const isTeamMember = user && group.members.some(member => {
                          if (!member || member === '') return false;
                          
                          // 팀 리더인지 확인 (리더 이메일과 사용자 이메일 비교)
                          const isLeader = leaderEmail && user.email && 
                            leaderEmail.toLowerCase() === user.email.toLowerCase();
                          
                          // 사용자 이메일이 멤버 이름을 포함하는지 확인
                          const emailMatch = user.email && 
                            user.email.toLowerCase().includes(member.toLowerCase());
                          
                          // 멤버 이름이 사용자 이메일을 포함하는지 확인
                          const reverseEmailMatch = user.email && 
                            member.toLowerCase().includes(user.email.toLowerCase());
                          
                          // 이메일의 @ 앞 부분이 멤버 이름과 일치하는지 확인
                          const emailPrefixMatch = user.email && 
                            user.email.split('@')[0].toLowerCase() === member.toLowerCase();
                          
                          // 멤버 이름이 이메일의 @ 앞 부분과 일치하는지 확인
                          const memberEmailPrefixMatch = user.email && 
                            member.toLowerCase() === user.email.split('@')[0].toLowerCase();
                          
                          console.log('Member check (email-based):', {
                            member,
                            userEmail: user.email,
                            leaderEmail,
                            isLeader,
                            emailPrefix: user.email ? user.email.split('@')[0] : null,
                            emailMatch,
                            reverseEmailMatch,
                            emailPrefixMatch,
                            memberEmailPrefixMatch,
                            result: isLeader || emailMatch || reverseEmailMatch || emailPrefixMatch || memberEmailPrefixMatch
                          });
                          
                          return isLeader || emailMatch || reverseEmailMatch || emailPrefixMatch || memberEmailPrefixMatch;
                        });
                        
                        // 팀 생성자이거나 해당 팀의 멤버인 경우에만 이메일 관리 가능
                        const canManageEmails = user && (isOwner || isTeamMember);
                        
                        console.log('Can manage emails for Team', index + 1, ':', canManageEmails, { 
                          isOwner, 
                          isTeamMember,
                          userEmail: user?.email,
                          userDisplayName: user?.displayName,
                          teamLeader,
                          teamMembers: group.members
                        });
                        
                        return canManageEmails ? (
                          <button
                            onClick={() => openTeamEmailModal({
                              id: group.id,
                              name: `Team ${index + 1}`,
                              members: group.members.filter(member => member !== '')
                            })}
                            className="p-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                            title="Manage team member emails"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </button>
                        ) : null;
                      })()}
                    </div>
                    <div className="flex items-center space-x-2">
                      {group.members.length > 0 && group.members[0] !== '' ? (
                        <span className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200 px-2 py-1 rounded-full font-medium">
                          👑 Leader: {group.members[0]}
                        </span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 px-2 py-1 rounded-full font-medium">
                          No Leader
                        </span>
                      )}
                      {group.members.length > 1 && isOwner && (
                        <select
                          value={group.members[0] || ''}
                          onChange={(e) => changeTeamLeader(index, e.target.value)}
                          className="text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">No Leader</option>
                          {group.members.filter(member => member !== '').map((memberName) => (
                            <option key={memberName} value={memberName}>
                              {memberName}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {(() => {
                      // 빈 문자열을 제외한 실제 멤버들만 필터링
                      const actualMembers = group.members.filter(member => member !== '');
                      const hasLeader = group.members.length > 0 && group.members[0] !== '';
                      
                      if (actualMembers.length > 0) {
                        return actualMembers.map((memberName, memberIndex) => {
                      // 멤버 정보 찾기
                      const memberInfo = workspaceData.members.find(m => m.name === memberName);
                          // 조장인지 확인 (첫 번째 멤버가 조장이고, 빈 문자열이 아닌 경우)
                          const isLeader = hasLeader && memberIndex === 0;
                      return (
                            <li key={memberIndex} className={`flex items-center space-x-2 ${isLeader ? 'font-semibold' : ''}`}>
                          {memberInfo?.photoURL ? (
                            <img
                              src={memberInfo.photoURL}
                              alt={memberName}
                                  className={`w-6 h-6 rounded-full border-2 ${isLeader ? 'border-yellow-400' : 'border-blue-200'}`}
                            />
                          ) : (
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
                                  isLeader ? 'bg-yellow-500 text-white' : 'bg-blue-600 dark:bg-blue-800 text-white'
                                }`}>
                                  {isLeader ? '👑' : memberIndex + 1}
                            </span>
                          )}
                              <span className={`text-gray-800 dark:text-gray-100 flex items-center ${isLeader ? 'text-yellow-700 dark:text-yellow-300' : ''}`}>
                            {memberName}
                                {isLeader && (
                                  <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200 px-2 py-1 rounded-full">
                                    Leader
                                  </span>
                                )}
                            {memberInfo?.isAuthenticated && (
                              <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                                ✓ Verified
                              </span>
                            )}
                          </span>
                          
                        </li>
                      );
                        });
                      } else {
                        return (
                          <li className="text-gray-500 dark:text-gray-400 text-sm italic">
                            No members in this team
                          </li>
                        );
                      }
                    })()}
                  </ul>
                  
                </div>
              ))}
            </div>
          </div>

          {/* Lecture Notes Section */}
          <div className="mb-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Lecture Notes</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadLectureNotes(true)}
                  disabled={refreshingLectureNotes}
                  className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Refresh lecture notes"
                >
                  {refreshingLectureNotes ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                  {refreshingLectureNotes ? 'Refreshing...' : 'Refresh'}
                </button>
                {canEdit && (
                  <button
                    onClick={() => setShowLectureNoteModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    Create Lecture Note
                  </button>
                )}
              </div>
            </div>
            
            {lectureNotes.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="text-4xl mb-4">📚</div>
                <p className="text-gray-600 dark:text-gray-400">No lecture notes created yet.</p>
                {isOwner && (
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">Create your first lecture note to get started.</p>
                )}
              </div>
        ) : (
          <div className="space-y-4">
            {sortLectureNotes(lectureNotes, lectureNoteSortOrder).map((lectureNote) => (
                  <SimpleLectureNoteCard
                    key={lectureNote.id}
                    lectureNote={lectureNote}
                    isCreator={!!canEdit}
                    workspaceData={workspaceData}
                    onEdit={handleEditLectureNote}
                    onDelete={handleDeleteLectureNote}
                    onTogglePublish={handleTogglePublish}
                    onRefresh={loadLectureNotes}
                    loading={lectureNoteLoading}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Team Scores Section */}
          {isOwner && workspaceData?.leaders && workspaceData.leaders.length > 0 && (
            <div className="mb-6 max-w-6xl mx-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Team Scores</h2>
                <button
                  onClick={calculateAllTeamScores}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center gap-2"
                  title="Refresh team scores"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh Scores
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workspaceData.leaders.map((leader, index) => {
                  const teamScore = teamScores.get(leader.teamId);
                  const leaderWithScore = {
                    ...leader,
                    averageScore: teamScore?.averageScore,
                    totalAssignments: teamScore?.totalAssignments,
                    evaluatedAssignments: teamScore?.evaluatedAssignments
                  };
                  return (
                    <TeamScoreCard
                      key={`${leader.teamId}-${index}`}
                      team={leaderWithScore}
                      showDetails={true}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Assignments Section */}
          <div className="mb-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Assignments</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadAssignments(true)}
                  disabled={refreshingAssignments}
                  className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Refresh assignments"
                >
                  {refreshingAssignments ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                  {refreshingAssignments ? 'Refreshing...' : 'Refresh'}
                </button>
                {isOwner && (
                  <button
                    onClick={() => setShowAssignmentModal(true)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                  >
                    Create Assignment
                  </button>
                )}
              </div>
            </div>
            {assignments.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="text-4xl mb-4">📝</div>
                <p className="text-gray-600 dark:text-gray-400">No assignments created yet.</p>
                {isOwner && (
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">Create your first assignment to get started.</p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {assignments
                  .sort((a, b) => a.createdAt - b.createdAt) // 생성순으로 정렬하여 번호 매기기
                  .map((assignment, index) => ({ ...assignment, displayNumber: index + 1 } as Assignment & { displayNumber: number })) // 번호 추가
                  .sort((a, b) => b.createdAt - a.createdAt) // 최신순으로 다시 정렬
                  .map((assignment) => (
                  <div key={assignment.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                            assignment.endDate && assignment.endDate < Date.now()
                              ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400' // 기한 지남 - 회색
                              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200' // 기한 내 - 파란색
                          }`}>
                            Assignment #{assignment.displayNumber}
                          </span>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{assignment.title}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">{assignment.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleAssignmentExpansion(assignment.id)}
                          className="p-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors flex items-center justify-center"
                        >
                          {expandedAssignments.has(assignment.id) ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </button>
                        {isOwner && (
                          <>
                            <button
                              onClick={() => openBulkEvaluationModal(assignment)}
                              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                            >
                              Evaluate
                            </button>
                            <button
                              onClick={() => openEditAssignment(assignment)}
                              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                            >
                              Edit
                            </button>
                          </>
                        )}
                        <div className="text-right">
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Created: {formatDate(assignment.createdAt)}
                          </p>
                          {assignment.startDate && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Start: {formatDate(assignment.startDate)}
                            </p>
                          )}
                          {assignment.endDate && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              End: {formatDate(assignment.endDate)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* 제출 현황 - 접기/펼치기 가능 */}
                    {expandedAssignments.has(assignment.id) && (
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Team Submissions</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {assignment.teamLeaders.map((leader, index) => {
                        // 해당 팀의 최신 제출 확인
                        const teamSubmissions = assignment.submissions?.filter(sub => sub.teamId === leader.teamId) || [];
                        const submission = teamSubmissions.length > 0 
                          ? teamSubmissions.reduce((latest, current) => 
                              current.submittedAt > latest.submittedAt ? current : latest
                            )
                          : null;
                        const isSubmitted = !!submission;
                        
                        // 권한 확인 변수들
                        const isAuthorized = user && user.email && leader.leaderEmail && 
                          user.email.toLowerCase() === leader.leaderEmail.toLowerCase();
                        const isOwner = user && workspaceData && user.id === workspaceData.userId;
                        
                        return (
                          <div 
                            key={index} 
                            className={`bg-gray-50 dark:bg-gray-700 rounded-lg p-3 transition-colors ${
                              (() => {
                                const canInteract = isAuthorized || isOwner;
                                return canInteract ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600' : 'cursor-not-allowed opacity-75';
                              })()
                            }`}
                            onClick={() => {
                              // 보안 강화: 팀 리더이거나 워크스페이스 소유자만 제출 모달 열기 가능
                              if (isAuthorized || isOwner) {
                                openSubmissionModal(assignment, leader);
                              }
                            }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-gray-900 dark:text-white">{leader.teamName}</span>
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                isSubmitted
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200'
                              }`}>
                                {isSubmitted ? 'Submitted' : 'Pending'}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Leader: {leader.leaderName}</p>
                            {/* 보안 강화: 로그인한 사용자만 팀 리더 이메일 확인 가능 */}
                            {leader.leaderEmail && user && (
                              <p className="text-xs text-gray-500 dark:text-gray-500">{leader.leaderEmail}</p>
                            )}
                            {leader.leaderEmail && !user && (
                              <p className="text-xs text-gray-400 dark:text-gray-600">Login to view email</p>
                            )}
                            
                            {/* 제출 정보 표시 - 보안 강화: 로그인한 사용자 중에서도 해당 팀 리더이거나 워크스페이스 소유자만 볼 수 있음 */}
                            {isSubmitted && submission && user && (isAuthorized || isOwner) && (
                              <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                <div className="text-xs text-green-800 dark:text-green-200">
                                  📄 Files submitted:
                                  {submission.files && submission.files.length > 0 ? (
                                    <div className="mt-1 space-y-1">
                                      {submission.files.map((file, index) => {
                                        // 팀 리더이거나 워크스페이스 소유자만 파일 다운로드 가능
                                        const canDownload = isAuthorized || isOwner;
                                        return (
                                          <div key={index} className="flex items-center justify-between text-xs text-green-700 dark:text-green-300">
                                            <span>• {file.fileName} ({(file.fileSize / 1024 / 1024).toFixed(2)} MB)</span>
                                            {canDownload ? (
                                              <a 
                                                href={file.fileUrl} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-blue-600 dark:text-blue-400 hover:underline ml-2"
                                                onClick={(e) => {
                                                  console.log('Downloading file:', file.fileName);
                                                }}
                                              >
                                                Download
                                              </a>
                                            ) : (
                                              <span className="text-gray-400 dark:text-gray-500 ml-2">
                                                Login required
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="mt-1 space-y-1">
                                      {submission.fileName.split(', ').map((fileName, index) => {
                                        const urls = submission.fileUrl ? submission.fileUrl.split(', ') : [];
                                        const url = urls[index];
                                        const canDownload = isAuthorized || isOwner;
                                        return (
                                          <div key={index} className="flex items-center justify-between text-xs text-green-700 dark:text-green-300">
                                            <span>• {fileName.trim()}</span>
                                            {url && canDownload ? (
                                              <a 
                                                href={url.trim()} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-blue-600 dark:text-blue-400 hover:underline ml-2"
                                                onClick={(e) => {
                                                  console.log('Downloading file:', fileName.trim());
                                                }}
                                              >
                                                Download
                                              </a>
                                            ) : (
                                              <span className="text-gray-400 dark:text-gray-500 ml-2">
                                                Login required
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                                <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                                  Submitted: {formatDate(submission.submittedAt)}
                                </p>
                                {/* 팀 생성자만 텍스트 설명 표시 */}
                                {isOwner && submission.description && (
                                  <div className="mt-2 p-2 bg-white/50 dark:bg-gray-800/50 rounded border-l-2 border-blue-400">
                                    <p className="text-xs text-gray-600 dark:text-gray-300 font-medium mb-1">
                                      📝 Additional Notes:
                                    </p>
                                    <p className="text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
                                      {submission.description}
                                    </p>
                                  </div>
                                )}
                                
                                {/* 평가 정보 표시 (버튼 제거) */}
                                {isOwner && (
                                  <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                    {submission.score !== undefined ? (
                                      <div>
                                        <p className="text-xs text-blue-800 dark:text-blue-200 font-medium">
                                          Score: {submission.score}/100
                                        </p>
                                        {submission.feedback && (
                                          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                                            Feedback: {submission.feedback}
                                          </p>
                                        )}
                                        {submission.evaluatedAt && (
                                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                            Evaluated: {formatDate(submission.evaluatedAt)}
                                          </p>
                                        )}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-blue-800 dark:text-blue-200">
                                        Not evaluated yet
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* 로그인하지 않은 사용자에게는 제출 상태만 표시 */}
                            {isSubmitted && submission && !user && (
                              <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                                <div className="text-xs text-gray-600 dark:text-gray-400">
                                  📄 Assignment submitted
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                  Login to view details
                                </p>
                              </div>
                            )}
                            
                            {/* 로그인했지만 해당 팀 리더가 아닌 사용자에게는 제출 상태만 표시 */}
                            {isSubmitted && submission && user && !isAuthorized && !isOwner && (
                              <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                                <div className="text-xs text-gray-600 dark:text-gray-400">
                                  📄 Assignment submitted
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                  Only team leader can view details
                                </p>
                              </div>
                            )}
                            
                            {/* 클릭 안내 텍스트 */}
                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                              {(() => {
                                console.log('🔍 Team leader authorization check:', {
                                  teamId: leader.teamId,
                                  teamName: leader.teamName,
                                  leaderName: leader.leaderName,
                                  leaderEmail: leader.leaderEmail,
                                  userEmail: user?.email,
                                  isAuthorized,
                                  teamLeaderEmails: teamLeaderEmails[leader.teamId]
                                });
                                
                                if (!user) {
                                  return 'Login to submit assignment';
                                } else if (!leader.leaderEmail) {
                                  return 'Leader email not set in Settings';
                                } else if (!isAuthorized) {
                                  return isOwner ? 'Click to view submission' : 'Only team leader can submit';
                                } else {
                                  return `Click to ${isSubmitted ? 'view submission' : 'submit assignment'}`;
                                }
                              })()}
                            </div>
                          </div>
                        );
                      })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Members List */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">All Members</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {workspaceData.members.map((member) => (
                <div key={member.id} className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  {member.photoURL ? (
                    <img
                      src={member.photoURL}
                      alt={member.name}
                      className="w-8 h-8 rounded-full border-2 border-gray-200"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-gray-400 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-medium">
                        {member.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-800 dark:text-gray-100 font-medium">{member.name}</span>
                      {member.isAuthenticated && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                          ✓ Verified
                        </span>
                      )}
                    </div>
                    {member.email && (
                      <span className="text-xs text-gray-500">{member.email}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fixed Pairs */}
          {workspaceData.fixedPairs.length > 0 && (
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Fixed Pairs</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {workspaceData.fixedPairs.map((pair) => (
                  <div key={pair.id} className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/30 rounded-lg">
                    <span className="text-purple-800 dark:text-purple-200">
                      {pair.members.join(' + ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Locked Teams */}
          {workspaceData.lockedTeams.length > 0 && (
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Locked Teams</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {workspaceData.lockedTeams.map((team) => (
                  <div key={team.id} className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/30 rounded-lg">
                    <span className="text-orange-800 dark:text-orange-200">
                      {team.members.join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && isOwner && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowSettingsModal(false)}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg p-6 w-96 max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">Team Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Team Name
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
                  placeholder="Enter Team Name"
                />
              </div>
              
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <p><strong>Created:</strong> {workspaceData && formatDate(workspaceData.createdAt)}</p>
                <p><strong>Members:</strong> {workspaceData?.members.length}</p>
                <p><strong>Teams:</strong> {workspaceData?.groups.length}</p>
              </div>
              
              <div className="flex space-x-2 pt-4">
                <button
                  onClick={updateWorkspaceTitle}
                  disabled={!editTitle.trim() || editTitle === workspaceData?.title || updatingTitle}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {updatingTitle ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Updating...</span>
                    </>
                  ) : (
                    <span>Update Title</span>
                  )}
                </button>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  disabled={updatingTitle}
                  className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              </div>
              
              {/* Workspace Visibility Section */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h4 className="text-md font-medium text-gray-900 dark:text-white mb-3">Workspace Visibility</h4>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div>
                    <span className="font-medium text-gray-900 dark:text-white">Public Access</span>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {workspaceData?.isPublic ? 'Anyone can view this workspace' : 'Only team members can view this workspace'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      console.log('Toggle clicked:', { workspaceData, accessResult, user });
                      
                      if (!workspaceData || !accessResult?.isOwner) {
                        console.log('Access denied:', { isOwner: accessResult?.isOwner, workspaceData: !!workspaceData });
                        setToastMessage('Only workspace owners can change visibility settings');
                        setShowToast(true);
                        return;
                      }
                      
                      const newIsPublic = !workspaceData.isPublic;
                      console.log('Updating visibility:', { current: workspaceData.isPublic, new: newIsPublic });
                      
                      try {
                        const workspaceRef = doc(db, 'workspaces', workspaceData.id);
                        await updateDoc(workspaceRef, {
                          isPublic: newIsPublic
                        });
                        
                        setWorkspaceData({
                          ...workspaceData,
                          isPublic: newIsPublic
                        });
                        
                        setToastMessage(`Workspace is now ${newIsPublic ? 'public' : 'private'}`);
                        setShowToast(true);
                        console.log('Visibility updated successfully');
                      } catch (error) {
                        console.error('Failed to update workspace visibility:', error);
                        setToastMessage('Failed to update workspace visibility');
                        setShowToast(true);
                      }
                    }}
                    disabled={!accessResult?.isOwner}
                    className={`relative inline-flex items-center focus:outline-none focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-800 rounded-full ${
                      accessResult?.isOwner ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                    }`}
                  >
                    <div className={`w-11 h-6 rounded-full transition-colors duration-200 ${
                      workspaceData?.isPublic 
                        ? 'bg-blue-600' 
                        : 'bg-gray-200 dark:bg-gray-700'
                    }`}>
                      <div className={`absolute top-[2px] left-[2px] bg-white border border-gray-300 rounded-full h-5 w-5 transition-transform duration-200 ease-in-out dark:border-gray-600 ${
                        workspaceData?.isPublic 
                          ? 'translate-x-5 border-white' 
                          : 'translate-x-0'
                      }`}></div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Lecture Note Settings Section */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h4 className="text-md font-medium text-gray-900 dark:text-white mb-3">Lecture Note Settings</h4>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Sort Order
                  </label>
                  <select
                    value={lectureNoteSortOrder}
                    onChange={async (e) => {
                      const newSortOrder = e.target.value as LectureNoteSortOrder;
                      setLectureNoteSortOrder(newSortOrder);
                      
                      if (user?.id) {
                        try {
                          await updateUserPreferences(user.id, { lectureNoteSortOrder: newSortOrder });
                          setToastMessage('Lecture note sort order updated!');
                          setShowToast(true);
                        } catch (error) {
                          console.error('Failed to update sort order:', error);
                          setToastMessage('Failed to update sort order');
                          setShowToast(true);
                        }
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
                  >
                    <option value="week-asc">Week (Ascending)</option>
                    <option value="week-desc">Week (Descending)</option>
                    <option value="created-asc">Created Date (Oldest First)</option>
                    <option value="created-desc">Created Date (Newest First)</option>
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Choose how lecture notes are sorted in the list
                  </p>
                </div>
              </div>

              {/* Team Leaders Section */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-3">Team Leaders</h4>
                <div className="space-y-3">
                  {workspaceData?.groups.map((group, index) => {
                    const leaderName = group.members[0] && group.members[0] !== '' ? group.members[0] : `Team ${index + 1} Leader`;
                    return (
                      <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="flex-1">
                          <span className="font-medium text-gray-900 dark:text-white">{`Team ${index + 1}`}</span>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Leader: {leaderName}</p>
                        </div>
                        <div className="flex-1">
                          <input
                            type="email"
                            placeholder="Enter leader's email"
                            value={teamLeaderEmails[group.id] || ''}
                            onChange={(e) => {
                              setTeamLeaderEmails({
                                ...teamLeaderEmails,
                                [group.id]: e.target.value
                              });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-600 dark:text-white text-sm"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3">
                  <button
                    onClick={saveTeamLeaderEmails}
                    disabled={savingEmails}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {savingEmails ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Team Leader Emails</span>
                    )}
                  </button>
                </div>
              </div>
              
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <button
                  onClick={deleteWorkspace}
                  className="w-full px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
                >
                  Delete Team
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assignment Creation Modal */}
      {showAssignmentModal && isOwner && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => {
            setShowAssignmentModal(false);
            setEditingAssignment(null);
            setNewAssignment({ title: '', description: '', startDate: '', endDate: '', maxPdfSize: 5, allowedFileTypes: ['pdf'] });
          }}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">
              {editingAssignment ? 'Edit Assignment' : 'Create Assignment'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Assignment Title
                </label>
                <input
                  type="text"
                  value={newAssignment.title}
                  onChange={(e) => setNewAssignment({ ...newAssignment, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Enter assignment title"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={newAssignment.description}
                  onChange={(e) => setNewAssignment({ ...newAssignment, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  rows={4}
                  placeholder="Enter assignment description"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Start Date (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={newAssignment.startDate}
                    onChange={(e) => setNewAssignment({ ...newAssignment, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    End Date (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={newAssignment.endDate}
                    onChange={(e) => setNewAssignment({ ...newAssignment, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Maximum PDF Size (MB)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={newAssignment.maxPdfSize}
                  onChange={(e) => setNewAssignment({ ...newAssignment, maxPdfSize: parseInt(e.target.value) || 5 })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Set the maximum file size for submissions (1-100 MB)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Allowed File Types
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {[
                    { value: 'pdf', label: 'PDF', icon: '📄' },
                    { value: 'doc', label: 'DOC', icon: '📝' },
                    { value: 'docx', label: 'DOCX', icon: '📝' },
                    { value: 'ppt', label: 'PPT', icon: '📊' },
                    { value: 'pptx', label: 'PPTX', icon: '📊' },
                    { value: 'txt', label: 'TXT', icon: '📄' },
                    { value: 'jpg', label: 'JPG', icon: '🖼️' },
                    { value: 'jpeg', label: 'JPEG', icon: '🖼️' },
                    { value: 'png', label: 'PNG', icon: '🖼️' },
                    { value: 'zip', label: 'ZIP', icon: '📦' }
                  ].map((fileType) => (
                    <label key={fileType.value} className="flex items-center space-x-2 p-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newAssignment.allowedFileTypes?.includes(fileType.value) || false}
                        onChange={(e) => {
                          const currentTypes = newAssignment.allowedFileTypes || [];
                          if (e.target.checked) {
                            setNewAssignment({
                              ...newAssignment,
                              allowedFileTypes: [...currentTypes, fileType.value]
                            });
                          } else {
                            setNewAssignment({
                              ...newAssignment,
                              allowedFileTypes: currentTypes.filter(type => type !== fileType.value)
                            });
                          }
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">{fileType.icon} {fileType.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Select the file types that students can submit for this assignment
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Team Leaders
                </label>
                <div className="space-y-2">
                  {workspaceData?.groups.map((group, index) => {
                    const leaderName = group.members[0] && group.members[0] !== '' ? group.members[0] : `Team ${index + 1} Leader`;
                    const leaderEmail = teamLeaderEmails[group.id] || '';
                    return (
                      <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="flex-1">
                          <span className="font-medium text-gray-900 dark:text-white">{`Team ${index + 1}`}</span>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Leader: {leaderName}</p>
                        </div>
                        <div className="flex-1">
                          {leaderEmail ? (
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              📧 {leaderEmail}
                            </div>
                          ) : (
                            <div className="text-sm text-yellow-600 dark:text-yellow-400">
                              ⚠️ Email not set in Settings
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {Object.values(teamLeaderEmails).some(email => !email) && (
                  <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      ⚠️ Some team leaders don't have email addresses set. Please configure them in Settings first.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="flex space-x-2 pt-4">
                <button
                  onClick={editingAssignment ? updateAssignment : createAssignment}
                  disabled={assignmentLoading || !newAssignment.title.trim() || Object.values(teamLeaderEmails).some(email => !email)}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center"
                >
                  {assignmentLoading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      {editingAssignment ? 'Updating...' : 'Creating...'}
                    </div>
                  ) : (
                    editingAssignment ? 'Update Assignment' : 'Create Assignment'
                  )}
                </button>
                {editingAssignment && (
                  <button
                    onClick={deleteAssignment}
                    disabled={assignmentLoading}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center"
                  >
                    {assignmentLoading ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Deleting...
                      </div>
                    ) : (
                      'Delete'
                    )}
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowAssignmentModal(false);
                    setEditingAssignment(null);
                    setNewAssignment({ title: '', description: '', startDate: '', endDate: '', maxPdfSize: 5, allowedFileTypes: ['pdf'] });
                  }}
                  disabled={assignmentLoading}
                  className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assignment Submission Modal */}
      {showSubmissionModal && selectedAssignment && selectedTeamLeader && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => {
            setShowSubmissionModal(false);
            setSelectedAssignment(null);
            setSelectedTeamLeader(null);
          }}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Assignment Submission
              </h3>
              <button
                onClick={() => {
                  setShowSubmissionModal(false);
                  setSelectedAssignment(null);
                  setSelectedTeamLeader(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>
            
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <h4 className="font-medium text-blue-900 dark:text-blue-200">{selectedAssignment.title}</h4>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">{selectedAssignment.description}</p>
            </div>

            {/* 이미 제출된 내용 표시 (관리자용) */}
            {(() => {
              const teamSubmissions = selectedAssignment.submissions?.filter(
                sub => sub.teamId === selectedTeamLeader.teamId
              ) || [];
              const existingSubmission = teamSubmissions.length > 0 
                ? teamSubmissions.reduce((latest, current) => 
                    current.submittedAt > latest.submittedAt ? current : latest
                  )
                : null;
              
              if (existingSubmission && isOwner) {
                return (
                  <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-green-900 dark:text-green-200">📄 Submitted Assignment</h4>
                      <span className="text-xs text-green-600 dark:text-green-400">
                        {formatDate(existingSubmission.submittedAt)}
                      </span>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Files:</p>
                        {(() => {
                          // 디버깅을 위한 로그
                          console.log('Submission data:', {
                            files: existingSubmission.files,
                            fileUrl: existingSubmission.fileUrl,
                            fileName: existingSubmission.fileName
                          });
                          
                          // files 배열이 있고 유효한 경우
                          if (existingSubmission.files && Array.isArray(existingSubmission.files) && existingSubmission.files.length > 0) {
                            return (
                              <div className="space-y-2">
                                {existingSubmission.files.map((file, index) => (
                                  <div key={index} className="flex items-center justify-between p-2 bg-white/50 dark:bg-gray-800/50 rounded border">
                                    <a 
                                      href={file.fileUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1 flex-1"
                                      onClick={(e) => {
                                        // CORS 오류를 무시하고 다운로드 허용
                                        console.log('Downloading file:', file.fileName);
                                      }}
                                    >
                                      <span>📎</span>
                                      <span>{file.fileName}</span>
                                    </a>
                                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                                      {(file.fileSize / 1024 / 1024).toFixed(2)} MB
                                    </span>
                                  </div>
                                ))}
                              </div>
                            );
                          }
                          
                          // fileUrl이 쉼표로 구분된 여러 URL인 경우
                          if (existingSubmission.fileUrl && existingSubmission.fileUrl.includes(',')) {
                            const urls = existingSubmission.fileUrl.split(', ');
                            const fileNames = existingSubmission.fileName ? existingSubmission.fileName.split(', ') : [];
                            
                            return (
                              <div className="space-y-2">
                                {urls.map((url, index) => {
                                  const fileName = fileNames[index] || `File ${index + 1}`;
                                  return (
                                    <div key={index} className="flex items-center justify-between p-2 bg-white/50 dark:bg-gray-800/50 rounded border">
                                      <a 
                                        href={url.trim()} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1 flex-1"
                                        onClick={(e) => {
                                          // CORS 오류를 무시하고 다운로드 허용
                                          console.log('Downloading file:', fileName.trim());
                                        }}
                                      >
                                        <span>📎</span>
                                        <span>{fileName.trim()}</span>
                                      </a>
                                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                                        File {index + 1}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          }
                          
                          // 단일 파일인 경우
                          return (
                            <a 
                              href={existingSubmission.fileUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1"
                              onClick={(e) => {
                                // CORS 오류를 무시하고 다운로드 허용
                                console.log('Downloading file:', existingSubmission.fileName);
                              }}
                            >
                              <span>📎</span>
                              <span>{existingSubmission.fileName}</span>
                            </a>
                          );
                        })()}
                      </div>
                      
                      {existingSubmission.description && (
                        <div>
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">📝 Additional Notes:</p>
                          <div className="p-3 bg-white/50 dark:bg-gray-800/50 rounded border-l-2 border-blue-400">
                            <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
                              {existingSubmission.description}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            <AssignmentSubmissionComponent
              assignmentId={selectedAssignment.id}
              teamId={selectedTeamLeader.teamId}
              teamName={selectedTeamLeader.teamName}
              leaderEmail={selectedTeamLeader.leaderEmail}
              leaderName={selectedTeamLeader.leaderName}
              maxPdfSize={selectedAssignment.maxPdfSize || 5}
              allowedFileTypes={selectedAssignment.allowedFileTypes || ['pdf']}
              existingSubmission={(() => {
                const teamSubmissions = selectedAssignment.submissions?.filter(
                  sub => sub.teamId === selectedTeamLeader.teamId
                ) || [];
                return teamSubmissions.length > 0 
                  ? teamSubmissions.reduce((latest, current) => 
                      current.submittedAt > latest.submittedAt ? current : latest
                    )
                  : undefined;
              })()}
              assignmentTitle={selectedAssignment.title}
              workspaceId={workspaceData?.id}
              onSubmissionSuccess={async () => {
                console.log('onSubmissionSuccess callback started');
                
                // 모달 먼저 닫기
                console.log('Closing submission modal...');
                setShowSubmissionModal(false);
                setSelectedAssignment(null);
                setSelectedTeamLeader(null);
                console.log('Submission modal closed');
                
                // 제출 성공 시 assignment 목록 새로고침
                console.log('Reloading assignments after submission...');
                await loadAssignments();
                
                console.log('onSubmissionSuccess callback completed');
              }}
            />
          </div>
        </div>
      )}

      {/* Team Member Email Management Modal */}
      {showTeamEmailModal && selectedTeamForEmail && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => {
            setShowTeamEmailModal(false);
            setSelectedTeamForEmail(null);
          }}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Manage Team Member Emails - {selectedTeamForEmail.name}
            </h3>
            
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Enter email addresses for team members. Leader email is set in Settings and cannot be modified here. These emails will be used for notifications and communication.
              </p>
              
              <div className="space-y-3">
                {selectedTeamForEmail.members.map((memberName, memberIndex) => {
                  const isLeader = memberIndex === 0; // 첫 번째 멤버가 리더
                  const leaderEmail = teamLeaderEmails[selectedTeamForEmail.id] || '';
                  
                  return (
                    <div key={memberName} className="space-y-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {memberName}
                        {isLeader && <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200 px-2 py-1 rounded-full">👑 Leader</span>}
                      </label>
                      {isLeader ? (
                        <div className="relative">
                          <input
                            type="email"
                            value={leaderEmail}
                            readOnly
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                            placeholder="Leader email set in Settings"
                          />
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          </div>
                        </div>
                      ) : (
                        <input
                          type="email"
                          placeholder="Enter email address"
                          value={teamMemberEmails[selectedTeamForEmail.id]?.[memberName] || ''}
                          onChange={(e) => {
                            setTeamMemberEmails(prev => ({
                              ...prev,
                              [selectedTeamForEmail.id]: {
                                ...prev[selectedTeamForEmail.id],
                                [memberName]: e.target.value
                              }
                            }));
                          }}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="flex space-x-2 pt-4">
              <button
                onClick={saveTeamMemberEmails}
                disabled={savingTeamEmails}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center"
              >
                {savingTeamEmails ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  'Save Emails'
                )}
              </button>
              <button
                onClick={() => {
                  setShowTeamEmailModal(false);
                  setSelectedTeamForEmail(null);
                }}
                disabled={savingTeamEmails}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back to Teams Button - Bottom */}
      <div className="flex justify-center mt-8 mb-6">
        {user && (
          <button
            onClick={() => {
              navigate('/workspaces');
            }}
            className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            ← Back to Workspaces
          </button>
        )}
      </div>

      {/* Add Team Member Modal (현재 비활성화됨) */}
      {/*
      {showAddMemberModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Add Team Member
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="Enter member's email"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Role
                </label>
                <select
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value as 'leader' | 'member')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
                >
                  <option value="member">Member</option>
                  <option value="leader">Leader</option>
                </select>
              </div>
            </div>
            
            <div className="flex space-x-2 pt-4">
              <button
                onClick={handleAddTeamMember}
                disabled={addingMember || !newMemberEmail.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center"
              >
                {addingMember ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Adding...
                  </>
                ) : (
                  'Add Member'
                )}
              </button>
              <button
                onClick={() => {
                  setShowAddMemberModal(false);
                  setNewMemberEmail('');
                  setNewMemberRole('member');
                }}
                disabled={addingMember}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      */}

      {/* Simple Lecture Note Modal */}
      <SimpleLectureNoteModal
        isOpen={showLectureNoteModal}
        onClose={() => {
          setShowLectureNoteModal(false);
          setEditingLectureNote(null);
        }}
        onSubmit={editingLectureNote ? handleUpdateLectureNote : handleCreateLectureNote}
        editingNote={editingLectureNote}
        loading={lectureNoteLoading}
      />

      {/* Assignment Evaluation Modal */}
      {selectedSubmissionForEvaluation && selectedAssignment && (
        <AssignmentEvaluationModal
          isOpen={showEvaluationModal}
          onClose={() => {
            setShowEvaluationModal(false);
            setSelectedSubmissionForEvaluation(null);
          }}
          submission={selectedSubmissionForEvaluation}
          assignmentId={selectedAssignment.id}
          assignmentTitle={selectedAssignment.title}
          isLectureAssignment={false}
          onEvaluationSuccess={handleEvaluationSuccess}
        />
      )}

      {/* Bulk Assignment Evaluation Modal */}
      {selectedAssignmentForBulkEvaluation && (
        <BulkAssignmentEvaluationModal
          isOpen={showBulkEvaluationModal}
          onClose={() => {
            setShowBulkEvaluationModal(false);
            setSelectedAssignmentForBulkEvaluation(null);
          }}
          assignment={selectedAssignmentForBulkEvaluation}
          teamLeaders={workspaceData?.groups?.map((group, index) => {
            // 첫 번째 멤버 이메일을 리더로 사용
            const leaderEmail = group.members[0] || '';
            console.log(`Team ${index + 1} - leaderEmail:`, leaderEmail);
            console.log('workspaceData.members:', workspaceData?.members);
            
            // workspaceData.members에서 해당 이메일의 멤버 정보 찾기
            const leaderMember = workspaceData?.members?.find(member => member.email === leaderEmail);
            console.log(`Team ${index + 1} - found leaderMember:`, leaderMember);
            
            return {
              teamId: group.id,
              teamName: `Team ${index + 1}`,
              leaderName: leaderMember?.name || leaderEmail || 'Unknown',
              leaderEmail: leaderEmail,
              isVerified: true
            };
          }) || []}
          onEvaluationSuccess={handleBulkEvaluationSuccess}
        />
      )}

      {/* Lecture Assignment Evaluation Modal은 제거됨 */}
      
    </div>
  );
}

export default WorkspacePage; 
