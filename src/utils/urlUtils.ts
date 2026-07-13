// URL 관련 유틸리티 함수들

/**
 * 이메일에서 사용자 ID 추출 (이메일의 @ 앞부분)
 */
export const getUserIdFromEmail = (email: string): string => {
  return email.split('@')[0];
};

/**
 * 고유한 사용자 ID 생성 (중복 시 번호 추가)
 */
export const createUniqueUserId = async (baseUserId: string, db: any): Promise<string> => {
  let finalUserId = baseUserId;
  let counter = 1;
  
  // 중복 체크를 위해 기존 사용자 ID들을 확인
  while (true) {
    const isDuplicate = await checkUserIdExists(finalUserId, db);
    
    if (!isDuplicate) {
      break;
    }
    
    counter++;
    finalUserId = `${baseUserId}${counter}`;
  }
  
  return finalUserId;
};

/**
 * 사용자 ID가 이미 존재하는지 확인
 */
const checkUserIdExists = async (userId: string, db: any): Promise<boolean> => {
  try {
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    const q = query(collection(db, 'workspaces'));
    const snapshot = await getDocs(q);
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      // workspace의 userId가 해당 사용자 ID로 시작하는지 확인
      if (data.userId && data.userId.startsWith(userId)) {
        // 정확히 일치하거나 번호가 붙은 형태인지 확인
        if (data.userId === userId || data.userId.startsWith(userId) && /^\d+$/.test(data.userId.substring(userId.length))) {
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking user ID exists:', error);
    return false;
  }
};

/**
 * URL에 사용할 수 있는 팀 이름 생성 (모든 언어 지원)
 */
export const createUrlSafeTeamName = (teamName: string): string => {
  return teamName
    .toLowerCase()
    // 유니코드 문자 클래스를 사용하여 모든 언어 문자 허용
    .replace(/[^\p{L}\p{N}\s-]/gu, '') // 문자(\p{L}), 숫자(\p{N}), 공백, 하이픈만 허용
    .replace(/\s+/g, '-') // 공백을 하이픈으로 변경
    .replace(/-+/g, '-') // 연속된 하이픈을 하나로 변경
    .replace(/^-|-$/g, ''); // 앞뒤 하이픈 제거
};

/**
 * 프로젝트명 중복성 검사
 */
export const checkProjectNameExists = async (projectName: string, currentWorkspaceId: string, db: any): Promise<boolean> => {
  try {
    const { collection, query, getDocs } = await import('firebase/firestore');
    const q = query(collection(db, 'workspaces'));
    const snapshot = await getDocs(q);
    
    const urlSafeName = createUrlSafeTeamName(projectName);
    
    for (const doc of snapshot.docs) {
      if (doc.id === currentWorkspaceId) continue;
      
      const data = doc.data();
      const existingUrlSafeName = createUrlSafeTeamName(data.title);
      
      if (existingUrlSafeName === urlSafeName) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking project name exists:', error);
    return false;
  }
};

/**
 * 워크스페이스 URL 생성.
 * Firestore 문서 ID를 사용하면 전체 워크스페이스 목록 조회 없이 안전하게 열 수 있다.
 */
export const createTeamUrl = async (_baseUserId: string, _teamName: string, workspaceId: string, _db: any): Promise<string> => {
  return `/workspace/${encodeURIComponent(workspaceId)}`;
};

/**
 * 팀 URL이 이미 존재하는지 확인 (현재 팀 제외)
 */
const checkTeamUrlExists = async (url: string, currentWorkspaceId: string, db: any): Promise<boolean> => {
  try {
    // URL에서 teamName 추출
    const pathParts = url.split('/').filter(Boolean);
    if (pathParts.length < 2 || pathParts[0] !== 'teams') {
      return false;
    }
    
    const teamName = pathParts[1];
    
    // 모든 팀을 조회하여 같은 URL을 가진 팀이 있는지 확인
    const { collection, query, getDocs } = await import('firebase/firestore');
    const q = query(collection(db, 'workspaces'));
    const snapshot = await getDocs(q);
    
    // 현재 팀을 제외하고 같은 URL을 가진 팀이 있는지 확인
    for (const doc of snapshot.docs) {
      if (doc.id === currentWorkspaceId) continue;
      
      const data = doc.data();
      const existingUrl = await generateTeamUrlFromData(data.title, doc.id);
      if (existingUrl === url) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking team URL exists:', error);
    return false;
  }
};

/**
 * 팀 데이터로부터 URL 생성 (중복 체크 없이)
 */
const generateTeamUrlFromData = async (teamName: string, workspaceId: string): Promise<string> => {
  const baseUrlSafeTeamName = createUrlSafeTeamName(teamName);
  return `/workspaces/${baseUrlSafeTeamName}`;
};

/**
 * 워크스페이스 URL에서 정보 추출
 */
export const parseTeamUrl = (pathname: string) => {
  const pathParts = pathname.split('/').filter(Boolean);
  
  if (pathParts.length >= 2 && pathParts[0] === 'workspaces') {
    const teamName = pathParts[1];
    
    return {
      teamName
    };
  }
  
  return null;
};

/**
 * 팀 URL로부터 workspaceId 찾기
 */
export const findWorkspaceIdByUrl = async (teamName: string, db: any): Promise<string | null> => {
  try {
    console.log('findWorkspaceIdByUrl called with:', { teamName });
    const { collection, query, getDocs } = await import('firebase/firestore');
    
    // 모든 workspace를 가져와서 URL 매칭 확인
    const q = query(collection(db, 'workspaces'));
    const snapshot = await getDocs(q);
    
    console.log('Total workspaces found:', snapshot.size);
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const dataTeamName = createUrlSafeTeamName(data.title);
      
      console.log('Checking workspace:', { 
        id: doc.id, 
        title: data.title, 
        urlSafeName: dataTeamName, 
        requestedName: teamName
      });
      
      // 팀 이름 매칭 확인
      const teamNameMatches = dataTeamName === teamName || teamName.startsWith(dataTeamName + '-');
      
      if (teamNameMatches) {
        console.log('Team name match found!', doc.id);
        return doc.id;
      }
    }
    
    console.log('No matching workspace found');
    return null;
  } catch (error) {
    console.error('Error finding workspace ID by URL:', error);
    return null;
  }
};

/**
 * 기존 workspace URL을 새로운 team URL로 리다이렉트
 */
export const redirectToTeamUrl = async (workspaceId: string, teamName: string, userEmail: string, db: any) => {
  const userId = getUserIdFromEmail(userEmail);
  const newUrl = await createTeamUrl(userId, teamName, workspaceId, db);
  return newUrl;
};
