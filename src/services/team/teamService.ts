import { 
  collection, 
  query, 
  where, 
  getDocs,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { TeamRole, UserTeamInfo, ApiResponse } from '../../types';
import { loadTeamOrder } from '../../utils/storageUtils';

/**
 * 사용자별 팀 목록 캐시 업데이트
 */
export const updateUserTeamCache = async (userEmail: string, firebaseUserId?: string): Promise<ApiResponse<void>> => {
  try {
    const userTeams = await getUserTeamsFromDatabase(userEmail, firebaseUserId);
    
    if (userTeams.success && userTeams.data) {
      const userRef = doc(db, 'users', firebaseUserId || userEmail);
      await updateDoc(userRef, {
        teams: userTeams.data,
        lastUpdated: new Date().toISOString()
      });
      console.log('✅ User team cache updated:', userEmail);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Failed to update user team cache:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update user team cache'
    };
  }
};

/**
 * 캐시된 사용자 팀 목록 조회
 */
export const getCachedUserTeams = async (userEmail: string, firebaseUserId?: string): Promise<ApiResponse<UserTeamInfo[]>> => {
  try {
    const userRef = doc(db, 'users', firebaseUserId || userEmail);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const userData = userSnap.data();
      const lastUpdated = userData.lastUpdated ? new Date(userData.lastUpdated) : null;
      const now = new Date();
      
      // 캐시가 5분 이내라면 사용
      if (lastUpdated && (now.getTime() - lastUpdated.getTime()) < 5 * 60 * 1000) {
        console.log('✅ Using cached user teams:', userEmail);
        return {
          success: true,
          data: userData.teams || []
        };
      }
    }
    
    // 캐시가 없거나 오래된 경우 데이터베이스에서 조회
    console.log('🔄 Cache miss or expired, fetching from database:', userEmail);
    return await getUserTeamsFromDatabase(userEmail, firebaseUserId);
  } catch (error) {
    console.error('Failed to get cached user teams:', error);
    return await getUserTeamsFromDatabase(userEmail, firebaseUserId);
  }
};

/**
 * 데이터베이스에서 사용자 팀 목록 조회 (내부 함수)
 */
const getUserTeamsFromDatabase = async (userEmail: string, firebaseUserId?: string): Promise<ApiResponse<UserTeamInfo[]>> => {
  try {
    console.log('=== getUserTeams START ===');
    console.log('User Email:', userEmail);
    console.log('Firebase UID:', firebaseUserId);
    console.log('Extracted User ID:', userEmail.split('@')[0]);
    console.log('========================');
    
    const userTeams: UserTeamInfo[] = [];
    const userId = userEmail.split('@')[0]; // 이메일에서 사용자명 추출
    
    // 모든 쿼리를 한 번에 병렬로 실행 (최대 최적화)
    console.log('🚀 ULTRA OPTIMIZED: Running all queries in parallel...');
    
    // 모든 쿼리 정의
    const allQueries = [
      // Creator 쿼리들
      ...(firebaseUserId ? [{ query: query(collection(db, 'workspaces'), where('userId', '==', firebaseUserId)), type: 'creator', subtype: 'firebase-uid' }] : []),
      { query: query(collection(db, 'workspaces'), where('userId', '==', userId)), type: 'creator', subtype: 'user-id' },
      { query: query(collection(db, 'workspaces'), where('userId', '==', userEmail)), type: 'creator', subtype: 'full-email' },
      
      // Leader 쿼리들 (마이그레이션된 배열 필드만 사용)
      { query: query(collection(db, 'workspaces'), where('leaders', 'array-contains', userEmail)), type: 'leader', subtype: 'leaders' },
      
      // Member 쿼리들 (마이그레이션된 배열 필드만 사용)
      { query: query(collection(db, 'workspaces'), where('memberEmails', 'array-contains', userEmail)), type: 'member', subtype: 'memberEmails' }
    ];
    
    console.log('Total queries to execute:', allQueries.length);
    
    // 모든 쿼리를 병렬로 실행
    const allPromises = allQueries.map(async ({ query: q, type, subtype }, index) => {
      try {
        console.log(`Executing ${type} query ${index + 1}/${allQueries.length} (${subtype})...`);
        const snapshot = await getDocs(q);
        console.log(`✅ ${type} query (${subtype}) result:`, snapshot.size, 'teams found');
        
        const teams: UserTeamInfo[] = [];
        snapshot.forEach(docSnap => {
          const workspaceData = docSnap.data();
          console.log(`🎯 Found ${type} team:`, {
            teamId: docSnap.id,
            teamName: workspaceData.title,
            type,
            subtype,
            userEmail
          });
          
          const teamInfo: UserTeamInfo = {
            teamId: docSnap.id,
            teamName: workspaceData.title || 'Untitled Team',
            role: type as TeamRole,
            joinedAt: new Date(workspaceData.createdAt || Date.now()),
            createdBy: workspaceData.userId,
            description: workspaceData.description,
            memberCount: calculateMemberCount(workspaceData),
            leaderCount: calculateLeaderCount(workspaceData)
          };
          teams.push(teamInfo);
        });
        return teams;
      } catch (error) {
        console.log(`❌ ${type} query (${subtype}) failed:`, error);
        return [];
      }
    });
    
    // 모든 쿼리 결과를 병렬로 기다림
    const allResults = await Promise.all(allPromises);
    
    // 결과를 합치고 중복 제거
    const allTeams = new Map<string, UserTeamInfo>();
    allResults.forEach(teams => {
      teams.forEach(team => {
        if (!allTeams.has(team.teamId)) {
          allTeams.set(team.teamId, team);
          console.log(`✅ Added ${team.role} team to results:`, team.teamName);
        } else {
          console.log(`⚠️ Team already exists, skipping duplicate:`, team.teamName);
        }
      });
    });
    
    // Map을 배열로 변환
    userTeams.push(...Array.from(allTeams.values()));
    
    console.log(`📊 All queries completed. Total unique teams found: ${userTeams.length}`);
    
    // 4. Fallback 제거 - 효율적인 쿼리만 사용
    if (userTeams.length === 0) {
      console.log('🔍 No teams found with efficient queries. User may not be a member of any teams.');
    }
    
    
    // localStorage에서 저장된 팀 순서 불러오기
    const savedTeamOrder = loadTeamOrder(userEmail);
    
    if (savedTeamOrder && savedTeamOrder.length > 0) {
      console.log('📋 Applying saved team order from localStorage:', savedTeamOrder);
      
      // 저장된 순서에 따라 팀 정보 업데이트
      const teamOrderMap = new Map(savedTeamOrder.map(order => [order.teamId, order]));
      
      userTeams.forEach(team => {
        const savedOrder = teamOrderMap.get(team.teamId);
        if (savedOrder) {
          team.displayOrder = savedOrder.displayOrder;
          team.teamNumber = savedOrder.teamNumber;
        }
      });
      
      // displayOrder 기준으로 정렬
      userTeams.sort((a, b) => {
        const aOrder = a.displayOrder ?? userTeams.indexOf(a);
        const bOrder = b.displayOrder ?? userTeams.indexOf(b);
        return aOrder - bOrder;
      });
      
      console.log('✅ Teams sorted by saved display order');
    } else {
      // 저장된 순서가 없으면 최근 참여한 팀부터 정렬
      userTeams.sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime());
      
      // 기본 displayOrder와 teamNumber 설정
      userTeams.forEach((team, index) => {
        team.displayOrder = index;
        team.teamNumber = index + 1;
      });
      
      console.log('📋 No saved team order found, using default order by joinedAt');
    }
    
    console.log('=== getUserTeamsFromDatabase FINAL RESULTS ===');
    console.log('Total teams found:', userTeams.length);
    console.log('Teams:', userTeams.map(team => ({
      teamId: team.teamId,
      teamName: team.teamName,
      role: team.role,
      memberCount: team.memberCount,
      leaderCount: team.leaderCount,
      displayOrder: team.displayOrder,
      teamNumber: team.teamNumber
    })));
    console.log('===============================================');
    
    return {
      success: true,
      data: userTeams
    };
  } catch (error) {
    console.error('Failed to get user teams from database:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get user teams from database'
    };
  }
};

/**
 * 사용자가 참여한 모든 팀 목록 조회 (캐싱 시스템 사용)
 * 효율적인 Firebase 쿼리 + 캐싱 사용
 */
export const getUserTeams = async (userEmail: string, firebaseUserId?: string): Promise<ApiResponse<UserTeamInfo[]>> => {
  try {
    console.log('=== getUserTeams (with caching) START ===');
    console.log('User Email:', userEmail);
    console.log('Firebase UID:', firebaseUserId);
    console.log('==========================================');
    
    // 캐시된 데이터 사용
    const result = await getCachedUserTeams(userEmail, firebaseUserId);
    
    if (result.success && result.data) {
      console.log('=== getUserTeams FINAL RESULTS ===');
      console.log('Total teams found:', result.data.length);
      console.log('Teams:', result.data.map(team => ({
        teamId: team.teamId,
        teamName: team.teamName,
        role: team.role,
        memberCount: team.memberCount,
        leaderCount: team.leaderCount
      })));
      console.log('===================================');
    }
    
    return result;
  } catch (error) {
    console.error('Failed to get user teams:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get user teams'
    };
  }
};

/**
 * 멤버 수 계산 헬퍼 함수
 */
const calculateMemberCount = (workspaceData: any): number => {
  const allMembers = new Set();
  
  // members 배열에서 추가
  if (Array.isArray(workspaceData.members)) {
    workspaceData.members.forEach((member: any) => {
      if (member.email) allMembers.add(member.email);
      else if (typeof member === 'string') allMembers.add(member);
    });
  }
  
  // teamMemberEmails 배열에서 추가 (기존 구조)
  if (Array.isArray(workspaceData.teamMemberEmails)) {
    workspaceData.teamMemberEmails.forEach((email: string) => allMembers.add(email));
  }
  
  // memberEmails 배열에서 추가 (새 구조)
  if (Array.isArray(workspaceData.memberEmails)) {
    workspaceData.memberEmails.forEach((email: string) => allMembers.add(email));
  }
  
  // teamMemberEmails가 객체인 경우 (중첩된 구조 처리)
  if (workspaceData.teamMemberEmails && typeof workspaceData.teamMemberEmails === 'object' && !Array.isArray(workspaceData.teamMemberEmails)) {
    Object.values(workspaceData.teamMemberEmails).forEach(group => {
      if (typeof group === 'object' && group !== null) {
        // group이 객체인 경우 (예: { "Member 1": "email@example.com" })
        Object.values(group).forEach((email: any) => {
          if (typeof email === 'string') {
            allMembers.add(email);
          }
        });
      } else if (typeof group === 'string') {
        // group이 직접 이메일인 경우
        allMembers.add(group);
      }
    });
  }
  
  // teamMembers 배열에서 추가
  if (Array.isArray(workspaceData.teamMembers)) {
    workspaceData.teamMembers.forEach((member: any) => {
      if (member.email) allMembers.add(member.email);
      else if (typeof member === 'string') allMembers.add(member);
    });
  }
  
  return allMembers.size;
};

/**
 * 리더 수 계산 헬퍼 함수
 */
const calculateLeaderCount = (workspaceData: any): number => {
  const allLeaders = new Set();
  
  // teamLeaderEmails 배열에서 추가 (기존 구조)
  if (Array.isArray(workspaceData.teamLeaderEmails)) {
    workspaceData.teamLeaderEmails.forEach((email: string) => allLeaders.add(email));
  }
  
  // leaders 배열에서 추가 (새 구조)
  if (Array.isArray(workspaceData.leaders)) {
    workspaceData.leaders.forEach((email: string) => allLeaders.add(email));
  }
  
  // teamLeaderEmails가 객체인 경우 (중첩된 구조 처리)
  if (workspaceData.teamLeaderEmails && typeof workspaceData.teamLeaderEmails === 'object' && !Array.isArray(workspaceData.teamLeaderEmails)) {
    Object.values(workspaceData.teamLeaderEmails).forEach(group => {
      if (typeof group === 'object' && group !== null) {
        // group이 객체인 경우 (예: { "Leader 1": "email@example.com" })
        Object.values(group).forEach((email: any) => {
          if (typeof email === 'string') {
            allLeaders.add(email);
          }
        });
      } else if (typeof group === 'string') {
        // group이 직접 이메일인 경우
        allLeaders.add(group);
      }
    });
  }
  
  // teamLeaders 배열에서 이메일 추출
  if (Array.isArray(workspaceData.teamLeaders)) {
    workspaceData.teamLeaders.forEach((leader: any) => {
      if (leader.leaderEmail) allLeaders.add(leader.leaderEmail);
      if (leader.email) allLeaders.add(leader.email);
    });
  }
  
  return allLeaders.size;
};

/**
 * 팀의 데이터 구조를 최적화 (객체를 배열로 변환)
 */
export const optimizeTeamDataStructure = async (teamId: string): Promise<ApiResponse<void>> => {
  try {
    // 새로운 마이그레이션 서비스 사용
    const { normalizeTeamData } = await import('./dataMigrationService');
    const result = await normalizeTeamData(teamId);
    
    return {
      success: result.success,
      error: result.error
    };
  } catch (error) {
    console.error('Failed to optimize team data structure:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to optimize team data structure'
    };
  }
};

/**
 * 팀에 사용자를 리더로 추가
 */
export const addTeamLeader = async (teamId: string, userEmail: string): Promise<ApiResponse<void>> => {
  try {
    const teamRef = doc(db, 'workspaces', teamId);
    const teamSnap = await getDoc(teamRef);
    
    if (!teamSnap.exists()) {
      return {
        success: false,
        error: 'Team not found'
      };
    }
    
    const teamData = teamSnap.data();
    
    // 기존 필드 업데이트 (호환성 유지)
    if (Array.isArray(teamData.teamLeaderEmails) && !teamData.teamLeaderEmails.includes(userEmail)) {
      await updateDoc(teamRef, {
        teamLeaderEmails: arrayUnion(userEmail)
      });
    } else if (!Array.isArray(teamData.teamLeaderEmails)) {
      await updateDoc(teamRef, {
        teamLeaderEmails: [userEmail]
      });
    }
    
    // 새 필드 업데이트 (array-contains 쿼리용)
    if (Array.isArray(teamData.leaders) && !teamData.leaders.includes(userEmail)) {
      await updateDoc(teamRef, {
        leaders: arrayUnion(userEmail)
      });
    } else if (!Array.isArray(teamData.leaders)) {
      await updateDoc(teamRef, {
        leaders: [userEmail]
      });
    }
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to add team leader:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add team leader'
    };
  }
};

/**
 * 팀에 사용자를 멤버로 추가
 */
export const addTeamMember = async (teamId: string, userEmail: string): Promise<ApiResponse<void>> => {
  try {
    const teamRef = doc(db, 'workspaces', teamId);
    const teamSnap = await getDoc(teamRef);
    
    if (!teamSnap.exists()) {
      return {
        success: false,
        error: 'Team not found'
      };
    }
    
    const teamData = teamSnap.data();
    
    // 기존 필드 업데이트 (호환성 유지)
    if (Array.isArray(teamData.teamMemberEmails) && !teamData.teamMemberEmails.includes(userEmail)) {
      await updateDoc(teamRef, {
        teamMemberEmails: arrayUnion(userEmail)
      });
    } else if (!Array.isArray(teamData.teamMemberEmails)) {
      await updateDoc(teamRef, {
        teamMemberEmails: [userEmail]
      });
    }
    
    // 새 필드 업데이트 (array-contains 쿼리용)
    if (Array.isArray(teamData.memberEmails) && !teamData.memberEmails.includes(userEmail)) {
      await updateDoc(teamRef, {
        memberEmails: arrayUnion(userEmail)
      });
    } else if (!Array.isArray(teamData.memberEmails)) {
      await updateDoc(teamRef, {
        memberEmails: [userEmail]
      });
    }
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to add team member:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add team member'
    };
  }
};

/**
 * 팀에서 사용자 제거
 */
export const removeTeamMember = async (teamId: string, userEmail: string): Promise<ApiResponse<void>> => {
  try {
    const teamRef = doc(db, 'workspaces', teamId);
    const teamSnap = await getDoc(teamRef);
    
    if (!teamSnap.exists()) {
      return {
        success: false,
        error: 'Team not found'
      };
    }
    
    const teamData = teamSnap.data();
    const updates: any = {};
    
    // 기존 필드에서 제거 (호환성 유지)
    if (Array.isArray(teamData.teamLeaderEmails) && teamData.teamLeaderEmails.includes(userEmail)) {
      updates.teamLeaderEmails = arrayRemove(userEmail);
    }
    if (Array.isArray(teamData.teamMemberEmails) && teamData.teamMemberEmails.includes(userEmail)) {
      updates.teamMemberEmails = arrayRemove(userEmail);
    }
    
    // 새 필드에서 제거 (array-contains 쿼리용)
    if (Array.isArray(teamData.leaders) && teamData.leaders.includes(userEmail)) {
      updates.leaders = arrayRemove(userEmail);
    }
    if (Array.isArray(teamData.memberEmails) && teamData.memberEmails.includes(userEmail)) {
      updates.memberEmails = arrayRemove(userEmail);
    }
    
    if (Object.keys(updates).length > 0) {
      await updateDoc(teamRef, updates);
    }
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to remove team member:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove team member'
    };
  }
};

/**
 * 팀 리더 변경 및 동기화
 */
export const changeTeamLeader = async (
  teamId: string, 
  teamIndex: number, 
  newLeaderName: string,
  newLeaderEmail?: string
): Promise<ApiResponse<void>> => {
  try {
    const teamRef = doc(db, 'workspaces', teamId);
    const teamSnap = await getDoc(teamRef);
    
    if (!teamSnap.exists()) {
      return {
        success: false,
        error: 'Team not found'
      };
    }
    
    const teamData = teamSnap.data();
    const groups = [...(teamData.groups || [])];
    
    if (teamIndex >= groups.length) {
      return {
        success: false,
        error: 'Invalid team index'
      };
    }
    
    const team = groups[teamIndex];
    const teamId_key = team.id;
    
    // 팀 멤버 순서 업데이트
    if (newLeaderName === '') {
      // 리더 해제 - 멤버 순서를 랜덤하게 재배치하고 첫 번째에 빈 문자열 추가
      const shuffledMembers = [...team.members].sort(() => Math.random() - 0.5);
      groups[teamIndex] = {
        ...team,
        members: ['', ...shuffledMembers]
      };
    } else {
      // 새 리더 설정 - 리더를 맨 앞으로, 나머지 멤버들을 뒤로
      const currentMembers = team.members.filter((m: string) => m !== '');
      const otherMembers = currentMembers.filter((m: string) => m !== newLeaderName);
      const newTeamMembers = [newLeaderName, ...otherMembers];
      
      groups[teamIndex] = {
        ...team,
        members: newTeamMembers
      };
    }
    
    // teamLeaderEmails 맵 업데이트
    const teamLeaderEmails = { ...(teamData.teamLeaderEmails || {}) };
    
    if (newLeaderName === '') {
      // 리더 해제
      delete teamLeaderEmails[teamId_key];
    } else if (newLeaderEmail) {
      // 새 리더 이메일 설정
      teamLeaderEmails[teamId_key] = newLeaderEmail;
    }
    
    // leaders 배열 업데이트
    const leaders = [...(teamData.leaders || [])];
    const currentLeaderEmail = teamLeaderEmails[teamId_key];
    
    // 기존 리더 이메일 제거
    const oldLeaderEmail = teamData.teamLeaderEmails?.[teamId_key];
    if (oldLeaderEmail && leaders.includes(oldLeaderEmail)) {
      const index = leaders.indexOf(oldLeaderEmail);
      leaders.splice(index, 1);
    }
    
    // 새 리더 이메일 추가
    if (currentLeaderEmail && !leaders.includes(currentLeaderEmail)) {
      leaders.push(currentLeaderEmail);
    }
    
    // Firebase 업데이트
    await updateDoc(teamRef, {
      groups,
      teamLeaderEmails,
      leaders
    });
    
    console.log(`✅ Team leader changed for team ${teamIndex + 1}:`, {
      teamId: teamId_key,
      newLeaderName,
      newLeaderEmail: currentLeaderEmail,
      updatedTeamLeaderEmails: teamLeaderEmails,
      updatedLeaders: leaders
    });
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to change team leader:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to change team leader'
    };
  }
};

/**
 * 팀 멤버 변경 및 동기화
 */
export const changeTeamMembers = async (
  teamId: string,
  teamIndex: number,
  newMembers: string[],
  memberEmails?: Record<string, string>
): Promise<ApiResponse<void>> => {
  try {
    const teamRef = doc(db, 'workspaces', teamId);
    const teamSnap = await getDoc(teamRef);
    
    if (!teamSnap.exists()) {
      return {
        success: false,
        error: 'Team not found'
      };
    }
    
    const teamData = teamSnap.data();
    const groups = [...(teamData.groups || [])];
    
    if (teamIndex >= groups.length) {
      return {
        success: false,
        error: 'Invalid team index'
      };
    }
    
    const team = groups[teamIndex];
    const teamId_key = team.id;
    
    // 팀 멤버 업데이트
    groups[teamIndex] = {
      ...team,
      members: newMembers
    };
    
    // teamMemberEmails 맵 업데이트
    const teamMemberEmails = { ...(teamData.teamMemberEmails || {}) };
    
    if (newMembers.length > 0) {
      teamMemberEmails[teamId_key] = memberEmails || {};
    } else {
      delete teamMemberEmails[teamId_key];
    }
    
    // memberEmails 배열 업데이트
    const memberEmailsArray = [...(teamData.memberEmails || [])];
    
    // 기존 팀 멤버 이메일들 제거
    const oldMemberEmails = teamData.teamMemberEmails?.[teamId_key];
    if (oldMemberEmails && typeof oldMemberEmails === 'object') {
      Object.values(oldMemberEmails).forEach((email: any) => {
        const index = memberEmailsArray.indexOf(email);
        if (index > -1) {
          memberEmailsArray.splice(index, 1);
        }
      });
    }
    
    // 새 팀 멤버 이메일들 추가
    if (memberEmails) {
      Object.values(memberEmails).forEach((email: string) => {
        if (!memberEmailsArray.includes(email)) {
          memberEmailsArray.push(email);
        }
      });
    }
    
    // Firebase 업데이트
    await updateDoc(teamRef, {
      groups,
      teamMemberEmails,
      memberEmails: memberEmailsArray
    });
    
    console.log(`✅ Team members changed for team ${teamIndex + 1}:`, {
      teamId: teamId_key,
      newMembers,
      updatedTeamMemberEmails: teamMemberEmails,
      updatedMemberEmails: memberEmailsArray
    });
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to change team members:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to change team members'
    };
  }
};

/**
 * 팀 리더와 멤버 동기화 (기존 데이터 보존)
 */
export const syncTeamStructure = async (teamId: string): Promise<ApiResponse<void>> => {
  try {
    const teamRef = doc(db, 'workspaces', teamId);
    const teamSnap = await getDoc(teamRef);
    
    if (!teamSnap.exists()) {
      return {
        success: false,
        error: 'Team not found'
      };
    }
    
    const teamData = teamSnap.data();
    const groups = teamData.groups || [];
    
    // 기존 데이터 보존
    const existingTeamLeaderEmails = { ...(teamData.teamLeaderEmails || {}) };
    const existingTeamMemberEmails = { ...(teamData.teamMemberEmails || {}) };
    const existingLeaders = [...(teamData.leaders || [])];
    const existingMemberEmails = [...(teamData.memberEmails || [])];
    
    // 새로운 데이터만 추가/업데이트
    const updatedTeamLeaderEmails = { ...existingTeamLeaderEmails };
    const updatedTeamMemberEmails = { ...existingTeamMemberEmails };
    const updatedLeaders = [...existingLeaders];
    const updatedMemberEmails = [...existingMemberEmails];
    
    let changesMade = false;
    
    groups.forEach((group: any) => {
      const groupId = group.id;
      const members = group.members || [];
      
      // 리더 동기화
      if (members.length > 0 && members[0] !== '') {
        const leaderName = members[0];
        const memberData = teamData.members?.find((m: any) => m.name === leaderName);
        
        if (memberData?.email) {
          const currentLeaderEmail = updatedTeamLeaderEmails[groupId];
          
          // 리더 이메일이 없거나 변경된 경우에만 업데이트
          if (!currentLeaderEmail || currentLeaderEmail !== memberData.email) {
            updatedTeamLeaderEmails[groupId] = memberData.email;
            
            // 기존 리더 이메일 제거
            if (currentLeaderEmail && updatedLeaders.includes(currentLeaderEmail)) {
              const index = updatedLeaders.indexOf(currentLeaderEmail);
              updatedLeaders.splice(index, 1);
            }
            
            // 새 리더 이메일 추가
            if (!updatedLeaders.includes(memberData.email)) {
              updatedLeaders.push(memberData.email);
            }
            
            changesMade = true;
            console.log(`🔄 Updated leader for ${groupId}: ${currentLeaderEmail} → ${memberData.email}`);
          }
        }
      }
      
      // 멤버 이메일 동기화 (기존 데이터 보존하면서 누락된 것만 추가)
      members.forEach((memberName: string) => {
        if (memberName !== '') {
          const memberData = teamData.members?.find((m: any) => m.name === memberName);
          
          if (memberData?.email) {
            // 팀별 멤버 이메일 맵 업데이트
            if (!updatedTeamMemberEmails[groupId]) {
              updatedTeamMemberEmails[groupId] = {};
            }
            
            const currentMemberEmail = updatedTeamMemberEmails[groupId][memberName];
            if (!currentMemberEmail || currentMemberEmail !== memberData.email) {
              updatedTeamMemberEmails[groupId][memberName] = memberData.email;
              
              // 전체 멤버 이메일 배열에 추가
              if (!updatedMemberEmails.includes(memberData.email)) {
                updatedMemberEmails.push(memberData.email);
              }
              
              changesMade = true;
              console.log(`🔄 Updated member email for ${memberName}: ${currentMemberEmail} → ${memberData.email}`);
            }
          }
        }
      });
    });
    
    // 변경사항이 있는 경우에만 업데이트
    if (changesMade) {
      await updateDoc(teamRef, {
        leaders: updatedLeaders,
        memberEmails: updatedMemberEmails,
        teamLeaderEmails: updatedTeamLeaderEmails,
        teamMemberEmails: updatedTeamMemberEmails
      });
      
      console.log(`✅ Team structure synchronized with changes:`, {
        teamId,
        leaders: updatedLeaders,
        members: updatedMemberEmails,
        teamLeaderEmails: updatedTeamLeaderEmails,
        teamMemberEmails: updatedTeamMemberEmails
      });
    } else {
      console.log(`ℹ️ No changes needed for team structure synchronization`);
    }
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to sync team structure:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync team structure'
    };
  }
};

/**
 * 팀 데이터 복구 (members 배열에서 이메일 정보 복구)
 */
export const recoverTeamData = async (teamId: string): Promise<ApiResponse<void>> => {
  try {
    const teamRef = doc(db, 'workspaces', teamId);
    const teamSnap = await getDoc(teamRef);
    
    if (!teamSnap.exists()) {
      return {
        success: false,
        error: 'Team not found'
      };
    }
    
    const teamData = teamSnap.data();
    const groups = teamData.groups || [];
    const members = teamData.members || [];
    
    // members 배열에서 이메일 정보를 추출하여 복구
    const recoveredTeamLeaderEmails: Record<string, string> = {};
    const recoveredTeamMemberEmails: Record<string, Record<string, string>> = {};
    const recoveredLeaders: string[] = [];
    const recoveredMemberEmails: string[] = [];
    
    groups.forEach((group: any) => {
      const groupId = group.id;
      const groupMembers = group.members || [];
      
      // 리더 복구 (첫 번째 멤버)
      if (groupMembers.length > 0 && groupMembers[0] !== '') {
        const leaderName = groupMembers[0];
        const leaderData = members.find((m: any) => m.name === leaderName);
        
        if (leaderData?.email) {
          recoveredTeamLeaderEmails[groupId] = leaderData.email;
          if (!recoveredLeaders.includes(leaderData.email)) {
            recoveredLeaders.push(leaderData.email);
          }
        }
      }
      
      // 멤버 이메일 복구
      const groupMemberEmails: Record<string, string> = {};
      groupMembers.forEach((memberName: string) => {
        if (memberName !== '') {
          const memberData = members.find((m: any) => m.name === memberName);
          if (memberData?.email) {
            groupMemberEmails[memberName] = memberData.email;
            if (!recoveredMemberEmails.includes(memberData.email)) {
              recoveredMemberEmails.push(memberData.email);
            }
          }
        }
      });
      
      if (Object.keys(groupMemberEmails).length > 0) {
        recoveredTeamMemberEmails[groupId] = groupMemberEmails;
      }
    });
    
    // 복구된 데이터로 업데이트
    await updateDoc(teamRef, {
      teamLeaderEmails: recoveredTeamLeaderEmails,
      teamMemberEmails: recoveredTeamMemberEmails,
      leaders: recoveredLeaders,
      memberEmails: recoveredMemberEmails,
      dataRecovered: true,
      recoveryDate: new Date().toISOString()
    });
    
    console.log(`✅ Team data recovered from members array:`, {
      teamId,
      leaders: recoveredLeaders,
      members: recoveredMemberEmails,
      teamLeaderEmails: recoveredTeamLeaderEmails,
      teamMemberEmails: recoveredTeamMemberEmails
    });
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to recover team data:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to recover team data'
    };
  }
};

/**
 * 긴급 데이터 복구 (과제 제출 데이터에서 이메일 정보 복구)
 */
export const emergencyRecoverTeamData = async (teamId: string): Promise<ApiResponse<void>> => {
  try {
    const teamRef = doc(db, 'workspaces', teamId);
    const teamSnap = await getDoc(teamRef);
    
    if (!teamSnap.exists()) {
      return {
        success: false,
        error: 'Team not found'
      };
    }
    
    const teamData = teamSnap.data();
    const groups = teamData.groups || [];
    
    // 과제 데이터에서 이메일 정보 수집
    const recoveredEmails: Record<string, string> = {}; // 이름 -> 이메일 매핑
    const recoveredLeaders: string[] = [];
    const recoveredMembers: string[] = [];
    const recoveredTeamLeaderEmails: Record<string, string> = {};
    const recoveredTeamMemberEmails: Record<string, Record<string, string>> = {};
    
    // 1. 과제 제출 데이터에서 이메일 수집
    if (teamData.assignments && Array.isArray(teamData.assignments)) {
      teamData.assignments.forEach((assignment: any) => {
        if (assignment.submissions && Array.isArray(assignment.submissions)) {
          assignment.submissions.forEach((submission: any) => {
            if (submission.leaderEmail && submission.leaderName) {
              recoveredEmails[submission.leaderName] = submission.leaderEmail;
              if (!recoveredLeaders.includes(submission.leaderEmail)) {
                recoveredLeaders.push(submission.leaderEmail);
              }
            }
          });
        }
      });
    }
    
    // 2. 강의 노트 과제 제출 데이터에서 이메일 수집
    const { collection, getDocs } = await import('firebase/firestore');
    const lectureNotesRef = collection(db, 'lectureNotes');
    const lectureNotesSnap = await getDocs(lectureNotesRef);
    
    lectureNotesSnap.forEach((lectureDoc) => {
      const lectureData = lectureDoc.data();
      
      // teamAssignments에서 이메일 정보 수집
      if (lectureData.teamAssignments) {
        let teamAssignments;
        if (Array.isArray(lectureData.teamAssignments)) {
          teamAssignments = lectureData.teamAssignments;
        } else if (typeof lectureData.teamAssignments === 'object') {
          teamAssignments = Object.values(lectureData.teamAssignments);
        }
        
        if (teamAssignments) {
          teamAssignments.forEach((teamAssignment: any) => {
            if (teamAssignment.leaderEmail && teamAssignment.leaderName) {
              recoveredEmails[teamAssignment.leaderName] = teamAssignment.leaderEmail;
              if (!recoveredLeaders.includes(teamAssignment.leaderEmail)) {
                recoveredLeaders.push(teamAssignment.leaderEmail);
              }
            }
            
            // 제출 데이터에서도 이메일 수집
            if (teamAssignment.submissions && Array.isArray(teamAssignment.submissions)) {
              teamAssignment.submissions.forEach((submission: any) => {
                if (submission.leaderEmail && submission.leaderName) {
                  recoveredEmails[submission.leaderName] = submission.leaderEmail;
                  if (!recoveredLeaders.includes(submission.leaderEmail)) {
                    recoveredLeaders.push(submission.leaderEmail);
                  }
                }
              });
            }
          });
        }
      }
    });
    
    // 3. 수집된 이메일 정보로 팀 데이터 복구
    groups.forEach((group: any) => {
      const groupId = group.id;
      const members = group.members || [];
      
      // 리더 복구 (첫 번째 멤버)
      if (members.length > 0 && members[0] !== '') {
        const leaderName = members[0];
        const leaderEmail = recoveredEmails[leaderName];
        
        if (leaderEmail) {
          recoveredTeamLeaderEmails[groupId] = leaderEmail;
          if (!recoveredLeaders.includes(leaderEmail)) {
            recoveredLeaders.push(leaderEmail);
          }
        }
      }
      
      // 멤버 이메일 복구
      const groupMemberEmails: Record<string, string> = {};
      members.forEach((memberName: string) => {
        if (memberName !== '') {
          const memberEmail = recoveredEmails[memberName];
          if (memberEmail) {
            groupMemberEmails[memberName] = memberEmail;
            if (!recoveredMembers.includes(memberEmail)) {
              recoveredMembers.push(memberEmail);
            }
          }
        }
      });
      
      if (Object.keys(groupMemberEmails).length > 0) {
        recoveredTeamMemberEmails[groupId] = groupMemberEmails;
      }
    });
    
    // 4. 복구된 데이터로 업데이트
    await updateDoc(teamRef, {
      teamLeaderEmails: recoveredTeamLeaderEmails,
      teamMemberEmails: recoveredTeamMemberEmails,
      leaders: recoveredLeaders,
      memberEmails: recoveredMembers,
      emergencyRecovered: true,
      recoveryDate: new Date().toISOString(),
      recoverySource: 'assignment_submissions'
    });
    
    console.log(`🚨 Emergency team data recovery completed:`, {
      teamId,
      recoveredEmails: Object.keys(recoveredEmails).length,
      leaders: recoveredLeaders.length,
      members: recoveredMembers.length,
      teamLeaderEmails: Object.keys(recoveredTeamLeaderEmails).length,
      teamMemberEmails: Object.keys(recoveredTeamMemberEmails).length,
      recoveredEmailsMap: recoveredEmails
    });
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to emergency recover team data:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to emergency recover team data'
    };
  }
};

/**
 * 사용자의 팀에서의 역할 확인
 */
export const getUserTeamRole = async (teamId: string, userEmail: string): Promise<ApiResponse<TeamRole | null>> => {
  try {
    const teamRef = doc(db, 'workspaces', teamId);
    const teamSnap = await getDoc(teamRef);
    
    if (!teamSnap.exists()) {
      return {
        success: false,
        error: 'Team not found'
      };
    }
    
    const teamData = teamSnap.data();
    const userId = userEmail.split('@')[0];
    
    // 팀 생성자인지 확인
    if (teamData.userId === userId) {
      return {
        success: true,
        data: 'creator'
      };
    }
    
    // 리더인지 확인 (기존 구조 + 새 구조 모두 확인)
    if (
      (Array.isArray(teamData.teamLeaderEmails) && teamData.teamLeaderEmails.includes(userEmail)) ||
      (Array.isArray(teamData.leaders) && teamData.leaders.includes(userEmail))
    ) {
      return {
        success: true,
        data: 'leader'
      };
    }
    
    // 멤버인지 확인 (기존 구조 + 새 구조 모두 확인)
    if (
      (Array.isArray(teamData.teamMemberEmails) && teamData.teamMemberEmails.includes(userEmail)) ||
      (Array.isArray(teamData.memberEmails) && teamData.memberEmails.includes(userEmail))
    ) {
      return {
        success: true,
        data: 'member'
      };
    }
    
    return {
      success: true,
      data: null
    };
  } catch (error) {
    console.error('Failed to get user team role:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get user team role'
    };
  }
};
