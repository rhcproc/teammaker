import { db } from '../services/firebase/config';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { User } from '../types';

export interface WorkspaceAccessResult {
  hasAccess: boolean;
  isOwner: boolean;
  isMember: boolean;
  isLeader: boolean;
  userRole?: 'owner' | 'member' | 'leader' | 'viewer';
  reason?: string;
}

/**
 * 사용자가 워크스페이스에 접근할 수 있는지 확인
 */
export const checkWorkspaceAccess = async (
  user: User | null,
  workspaceId: string,
  workspaceData?: any
): Promise<WorkspaceAccessResult> => {
  // 사용자가 로그인하지 않은 경우, public 워크스페이스인지 먼저 확인
  if (!user) {
    try {
      // 워크스페이스 정보 가져오기 (이미 전달된 경우 사용, 아니면 DB에서 조회)
      let workspaceInfo;
      if (workspaceData) {
        workspaceInfo = workspaceData;
      } else {
        const workspaceRef = doc(db, 'workspaces', workspaceId);
        const workspaceDoc = await getDoc(workspaceRef);
        
        if (!workspaceDoc.exists()) {
          return {
            hasAccess: false,
            isOwner: false,
            isMember: false,
            isLeader: false,
            reason: 'Workspace not found'
          };
        }

        workspaceInfo = workspaceDoc.data();
      }

      // public 워크스페이스인 경우 읽기 전용 접근 허용
      if (workspaceInfo.isPublic === true) {
        return {
          hasAccess: true,
          isOwner: false,
          isMember: false,
          isLeader: false,
          userRole: 'viewer'
        };
      }

      // public이 아닌 경우 접근 거부
      return {
        hasAccess: false,
        isOwner: false,
        isMember: false,
        isLeader: false,
        reason: 'User not logged in'
      };
    } catch (error) {
      console.error('Error checking public workspace access:', error);
      return {
        hasAccess: false,
        isOwner: false,
        isMember: false,
        isLeader: false,
        reason: 'Error checking access permissions'
      };
    }
  }

  try {
    // 워크스페이스 정보 가져오기 (이미 전달된 경우 사용, 아니면 DB에서 조회)
    let workspaceInfo;
    if (workspaceData) {
      workspaceInfo = workspaceData;
    } else {
      const workspaceRef = doc(db, 'workspaces', workspaceId);
      const workspaceDoc = await getDoc(workspaceRef);
      
      if (!workspaceDoc.exists()) {
        return {
          hasAccess: false,
          isOwner: false,
          isMember: false,
          isLeader: false,
          reason: 'Workspace not found'
        };
      }

      workspaceInfo = workspaceDoc.data();
    }

    // 1. Owner 권한 확인
    if (user.id === workspaceInfo.userId) {
      return {
        hasAccess: true,
        isOwner: true,
        isMember: true,
        isLeader: true,
        userRole: 'owner'
      };
    }

    // 2. 공개 워크스페이스인 경우 읽기 전용 접근 허용 (로그인한 사용자도 viewer 권한으로 접근 가능)
    if (workspaceInfo.isPublic === true) {
      return {
        hasAccess: true,
        isOwner: false,
        isMember: false,
        isLeader: false,
        userRole: 'viewer'
      };
    }

    // 3. 팀 멤버/리더 권한 확인 (비공개 워크스페이스)
    const groups = workspaceInfo.groups || [];
    let isMember = false;
    let isLeader = false;

    for (const group of groups) {
      const members = group.members || [];
      
      // 팀 멤버 확인
      if (members.includes(user.email)) {
        isMember = true;
        
        // 첫 번째 멤버가 리더인 경우
        if (members[0] === user.email) {
          isLeader = true;
        }
      }
    }

    if (isMember || isLeader) {
      return {
        hasAccess: true,
        isOwner: false,
        isMember,
        isLeader,
        userRole: isLeader ? 'leader' : 'member'
      };
    }

    // 4. 팀 리더 이메일로 확인 (이메일 기반)
    const teamLeaderEmails = workspaceInfo.teamLeaderEmails || {};
    for (const [teamId, leaderEmail] of Object.entries(teamLeaderEmails)) {
      if (leaderEmail === user.email) {
        return {
          hasAccess: true,
          isOwner: false,
          isMember: true,
          isLeader: true,
          userRole: 'leader'
        };
      }
    }

    // 5. 팀 멤버 이메일로 확인 (이메일 기반)
    const teamMemberEmails = workspaceInfo.teamMemberEmails || {};
    for (const [teamId, memberEmails] of Object.entries(teamMemberEmails)) {
      if (typeof memberEmails === 'object' && memberEmails !== null) {
        for (const [memberName, memberEmail] of Object.entries(memberEmails)) {
          if (memberEmail === user.email) {
            return {
              hasAccess: true,
              isOwner: false,
              isMember: true,
              isLeader: false,
              userRole: 'member'
            };
          }
        }
      }
    }

    return {
      hasAccess: false,
      isOwner: false,
      isMember: false,
      isLeader: false,
      reason: 'User is not a member of this workspace'
    };

  } catch (error) {
    console.error('Error checking workspace access:', error);
    return {
      hasAccess: false,
      isOwner: false,
      isMember: false,
      isLeader: false,
      reason: 'Error checking access permissions'
    };
  }
};

/**
 * 사용자가 특정 팀에 속해있는지 확인
 */
export const checkTeamMembership = async (
  user: User | null,
  workspaceId: string,
  teamId?: string
): Promise<boolean> => {
  if (!user || !teamId) return false;

  try {
    const workspaceRef = doc(db, 'workspaces', workspaceId);
    const workspaceDoc = await getDoc(workspaceRef);
    
    if (!workspaceDoc.exists()) return false;

    const workspaceData = workspaceDoc.data();
    const groups = workspaceData.groups || [];

    // 특정 팀에서 사용자 찾기
    const targetTeam = groups.find((group: any) => group.id === teamId);
    if (!targetTeam) return false;

    const members = targetTeam.members || [];
    return members.includes(user.email);

  } catch (error) {
    console.error('Error checking team membership:', error);
    return false;
  }
};
