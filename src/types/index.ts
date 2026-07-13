// User related types
export interface User {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: Date;
  lastLoginAt: Date;
  emailVerified?: boolean;
}

// Team related types
export interface Member {
  id: string;
  name: string;
  email?: string;
  userId?: string;
}

export interface FixedPair {
  id: string;
  members: string[];
}

export interface LockedTeam {
  id: string;
  members: string[];
}

export interface Group {
  id: string;
  members: string[];
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  members: Member[]; // 팀 멤버 객체 목록
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  // 팀 멤버십 정보 (이메일 기반)
  leaders: string[]; // 리더 이메일 목록
  memberEmails: string[]; // 멤버 이메일 목록 (members와 구분)
  // 기존 필드와의 호환성을 위해 유지
  teamLeaderEmails?: string[];
  teamMemberEmails?: string[];
}

// 팀 멤버십 관련 타입
export type TeamRole = 'creator' | 'leader' | 'member';

export interface TeamMembership {
  teamId: string;
  teamName: string;
  role: TeamRole;
  joinedAt: Date;
  createdBy?: string; // 팀 생성자 정보
}

export interface UserTeamInfo {
  teamId: string;
  teamName: string;
  role: TeamRole;
  joinedAt: Date;
  createdBy?: string;
  // 팀의 추가 정보
  description?: string;
  memberCount?: number;
  leaderCount?: number;
  // 팀 순서 지정
  displayOrder?: number;
  teamNumber?: number; // #1, #2 등의 번호
}

// Animation types
export interface AnimationStep {
  groups: Group[];
  step: number;
  totalSteps: number;
  description: string;
}

// Saved results types
export interface SavedResult {
  id: string;
  timestamp: number;
  groups: Group[];
  members: Member[];
  groupSize: number;
  fixedPairs: FixedPair[];
  lockedTeams: LockedTeam[];
  title: string;
  createdBy?: string;
}

// Chat related types
export interface Message {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  timestamp: Date;
  type: 'text' | 'image' | 'file';
  roomId: string;
}

export interface ChatRoom {
  id: string;
  name: string;
  description?: string;
  members: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt?: Date;
  lastMessage?: Message;
  unreadCount?: number;
}

// Auth related types
export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

// Firebase related types
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Component props types
export interface LandingPageProps {
  onLaunchApp: () => void;
}

export interface TeamMakerAppProps {
  onBackToLanding: () => void;
}

export interface ChatProps {
  roomId?: string;
}

export interface TeamManagementProps {
  teamId?: string;
}

// Assignment related types
export interface Assignment {
  id: string;
  title: string;
  description: string;
  workspaceId: string;
  createdBy: string;
  createdAt: number;
  startDate?: number;
  endDate?: number;
  maxPdfSize?: number;
  allowedFileTypes?: string[]; // 허용할 파일 타입들 (예: ['pdf', 'doc', 'docx', 'jpg', 'png'])
  teamLeaders: TeamLeader[];
  submissions: AssignmentSubmission[];
}

export interface TeamLeader {
  teamId: string;
  teamName: string;
  leaderName: string;
  leaderEmail: string;
  isVerified: boolean;
  verificationCode?: string;
  averageScore?: number; // 팀의 평균 점수
  totalAssignments?: number; // 총 과제 수
  evaluatedAssignments?: number; // 평가된 과제 수
}

export interface AssignmentSubmission {
  teamId: string;
  teamName: string;
  leaderEmail: string;
  leaderName: string;
  fileName: string;
  fileUrl: string;
  submittedAt: number;
  fileSize: number;
  description?: string; // Optional text description
  files?: Array<{
    fileName: string;
    fileUrl: string;
    fileSize: number;
  }>; // Optional array of individual file information
  // Evaluation fields
  score?: number; // 점수 (0-100)
  evaluatedAt?: number; // 평가 일시
  evaluatedBy?: string; // 평가자 이메일
  feedback?: string; // 피드백
}

// Plan related types
export type PlanType = 'free' | 'basic' | 'premium';

export interface PlanFeatures {
  [key: string]: {
    name: string;
    teamLimit: number;
    storageLimit: number;
    features: string[];
    color: string;
    price?: string;
  };
}

export interface UserPlan {
  userId: string;
  planType: PlanType;
  teamLimit: number;
  storageLimit: number;
  features: string[];
  isActive: boolean;
  createdAt: number;
  expiresAt?: number;
}

// Notification related types
export type NotificationType = 
  | 'assignment_created'
  | 'assignment_submitted'
  | 'assignment_deadline_reminder'
  | 'team_member_joined'
  | 'workspace_invited'
  | 'storage_warning'
  | 'system_announcement';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: number;
  data?: {
    workspaceId?: string;
    assignmentId?: string;
    teamName?: string;
    usagePercentage?: number;
    [key: string]: any;
  };
}

export interface NotificationSettings {
  id?: string;
  userId: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  assignmentDeadlineReminders: boolean;
  teamActivityNotifications: boolean;
  systemAnnouncements: boolean;
}

// Lecture Note related types
export interface LectureNote {
  id: string;
  title: string;
  description?: string;
  week: number;
  workspaceId: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  content?: string; // 텍스트 내용
  attachments: LectureAttachment[];
  isPublished: boolean;
  // 과제 관련 필드
  hasAssignment: boolean;
  assignmentTitle?: string;
  assignmentDescription?: string;
  assignmentDeadline?: number;
  maxFileSize?: number;
  allowedFileTypes?: string[];
  teamAssignments: LectureTeamAssignment[];
}

// 새로운 간단한 Lecture Note 타입
export interface SimpleLectureNote {
  id: string;
  title: string;
  description?: string;
  week: number;
  date?: string; // YYYY-MM-DD 형식의 날짜
  workspaceId: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  isPublished: boolean;
  // 간단한 첨부파일
  attachments: SimpleAttachment[];
  // 간단한 과제
  hasTask: boolean;
  taskTitle?: string;
  taskDescription?: string;
  taskDeadline?: number | null;
  maxFileSize?: number;
  allowedFileTypes?: string[];
  // 과제 제출 방식 (team: 팀별 제출, individual: 개별 제출)
  assignmentType?: 'team' | 'individual';
  // 팀별 제출물 (간단한 구조)
  teamSubmissions: SimpleTeamSubmission[];
  // 개별 제출물 (새로 추가)
  individualSubmissions: SimpleIndividualSubmission[];
}

export interface SimpleAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  uploadedAt: number;
  uploadedBy: string;
}

export interface SimpleTeamSubmission {
  teamId: string;
  teamName: string;
  leaderEmail: string;
  leaderName: string;
  files: SimpleSubmissionFile[];
  submittedAt: number;
  description?: string;
  submissionCount?: number; // 제출 횟수 (1, 2, 3...)
}

export interface SimpleSubmissionFile {
  fileName: string;
  fileUrl: string;
  fileSize: number;
}

export interface SimpleIndividualSubmission {
  userId: string;
  userEmail: string;
  userName: string;
  teamId: string; // 어느 팀에 속하는지
  teamName: string;
  files: SimpleSubmissionFile[];
  submittedAt: number;
  description?: string;
  submissionCount?: number; // 제출 횟수 (1, 2, 3...)
}

export interface LectureTeamAssignment {
  teamId: string;
  teamName: string;
  leaderName: string;
  leaderEmail: string;
  isVerified: boolean;
  verificationCode?: string;
  submissions: LectureAssignmentSubmission[];
  averageScore?: number; // 팀의 평균 점수
  totalAssignments?: number; // 총 과제 수
  evaluatedAssignments?: number; // 평가된 과제 수
}

export interface LectureAssignmentSubmission {
  teamId: string;
  teamName: string;
  leaderEmail: string;
  leaderName: string;
  fileName: string;
  fileUrl: string;
  submittedAt: number;
  fileSize: number;
  description?: string;
  files?: Array<{
    fileName: string;
    fileUrl: string;
    fileSize: number;
  }>;
  // Evaluation fields
  score?: number; // 점수 (0-100)
  evaluatedAt?: number; // 평가 일시
  evaluatedBy?: string; // 평가자 이메일
  feedback?: string; // 피드백
}

export interface LectureAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
  uploadedAt: number;
}

// User preferences types
export type LectureNoteSortOrder = 'week-asc' | 'week-desc' | 'created-asc' | 'created-desc';

export interface UserPreferences {
  id?: string;
  userId: string;
  lectureNoteSortOrder: LectureNoteSortOrder;
  updatedAt: number;
}
