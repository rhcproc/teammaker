import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  updateDoc, 
  query,
  limit
} from 'firebase/firestore';
import { db } from '../firebase/config';

export interface MigrationProgress {
  total: number;
  processed: number;
  success: number;
  failed: number;
  currentTeam?: string;
  errors: string[];
}

export interface TeamDataStructure {
  teamId: string;
  teamName: string;
  teamLeaderEmails: any; // 현재 구조 (객체/중첩객체)
  teamMemberEmails: any; // 현재 구조 (객체/중첩객체)
  leaders?: string[]; // 새 구조 (배열)
  memberEmails?: string[]; // 새 구조 (배열)
}

/**
 * 객체나 중첩 객체에서 이메일 배열을 추출하는 함수
 */
function extractEmailsFromObject(emailData: any): string[] {
  if (!emailData) return [];
  
  // 이미 배열인 경우
  if (Array.isArray(emailData)) {
    return emailData.filter(email => typeof email === 'string' && email.includes('@'));
  }
  
  // 객체인 경우 - 모든 값들을 추출
  if (typeof emailData === 'object') {
    const emails: string[] = [];
    
    // 직접 값들 추출
    Object.values(emailData).forEach(value => {
      if (typeof value === 'string' && value.includes('@')) {
        emails.push(value);
      } else if (typeof value === 'object' && value !== null) {
        // 중첩 객체인 경우 재귀적으로 추출
        emails.push(...extractEmailsFromObject(value));
      }
    });
    
    return Array.from(new Set(emails)); // 중복 제거
  }
  
  return [];
}

/**
 * 단일 팀의 데이터 구조를 정규화
 */
export async function normalizeTeamData(teamId: string): Promise<{
  success: boolean;
  changes: string[];
  error?: string;
}> {
  try {
    console.log(`🔄 Normalizing team data for: ${teamId}`);
    
    const teamRef = doc(db, 'workspaces', teamId);
    const teamDoc = await getDoc(teamRef);
    
    if (!teamDoc.exists()) {
      return { success: false, changes: [], error: 'Team not found' };
    }
    
    const teamData = teamDoc.data();
    const changes: string[] = [];
    
    // 디버깅: 원본 데이터 구조 확인
    console.log(`📊 Team ${teamId} original data:`, {
      teamName: teamData.title,
      teamLeaderEmails: teamData.teamLeaderEmails,
      teamMemberEmails: teamData.teamMemberEmails,
      existingLeaders: teamData.leaders,
      existingMemberEmails: teamData.memberEmails
    });
    
    // teamLeaderEmails 정규화
    const currentLeaders = extractEmailsFromObject(teamData.teamLeaderEmails);
    const existingLeaders = Array.isArray(teamData.leaders) ? teamData.leaders : [];
    
    console.log(`🔍 Extracted leaders for team ${teamId}:`, currentLeaders);
    
    if (currentLeaders.length > 0 && JSON.stringify(currentLeaders.sort()) !== JSON.stringify(existingLeaders.sort())) {
      changes.push(`Updated leaders: ${existingLeaders.length} → ${currentLeaders.length}`);
    }
    
    // teamMemberEmails 정규화
    const currentMembers = extractEmailsFromObject(teamData.teamMemberEmails);
    const existingMembers = Array.isArray(teamData.memberEmails) ? teamData.memberEmails : [];
    
    console.log(`🔍 Extracted members for team ${teamId}:`, currentMembers);
    
    if (currentMembers.length > 0 && JSON.stringify(currentMembers.sort()) !== JSON.stringify(existingMembers.sort())) {
      changes.push(`Updated members: ${existingMembers.length} → ${currentMembers.length}`);
    }
    
    // 변경사항이 있는 경우에만 업데이트
    if (changes.length > 0) {
      const updateData: any = {
        dataMigrated: true,
        migrationDate: new Date().toISOString()
      };
      
      // 새 구조 추가 (array-contains 쿼리용)
      if (currentLeaders.length > 0) {
        updateData.leaders = currentLeaders;
      }
      if (currentMembers.length > 0) {
        updateData.memberEmails = currentMembers;
      }
      
      // 기존 구조 유지 (UI 호환성용)
      if (teamData.teamLeaderEmails) {
        updateData.teamLeaderEmails = teamData.teamLeaderEmails;
      }
      if (teamData.teamMemberEmails) {
        updateData.teamMemberEmails = teamData.teamMemberEmails;
      }
      
      await updateDoc(teamRef, updateData);
      
      console.log(`✅ Team ${teamId} normalized:`, changes);
      return { success: true, changes };
    } else {
      console.log(`ℹ️ Team ${teamId} already normalized`);
      return { success: true, changes: ['No changes needed'] };
    }
    
  } catch (error) {
    console.error(`❌ Failed to normalize team ${teamId}:`, error);
    return { 
      success: false, 
      changes: [], 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * 잘못된 leaders 배열을 초기화하고 올바르게 재구성
 */
export async function fixCorruptedLeadersData(
  batchSize: number = 10,
  onProgress?: (progress: MigrationProgress) => void
): Promise<MigrationProgress> {
  console.log('🔧 Starting FIX for corrupted leaders data...');
  
  const progress: MigrationProgress = {
    total: 0,
    processed: 0,
    success: 0,
    failed: 0,
    errors: []
  };
  
  try {
    // Firebase의 모든 팀 조회
    console.log('🔍 Scanning Firebase for all teams...');
    const allTeamsSnapshot = await getDocs(collection(db, 'workspaces'));
    progress.total = allTeamsSnapshot.size;
    
    console.log(`📊 Found ${progress.total} teams in Firebase to fix`);
    
    if (progress.total === 0) {
      console.log('ℹ️ No teams found in Firebase');
      return progress;
    }
    
    // 배치 단위로 처리
    const teams = allTeamsSnapshot.docs;
    const batches = [];
    
    for (let i = 0; i < teams.length; i += batchSize) {
      batches.push(teams.slice(i, i + batchSize));
    }
    
    console.log(`📦 Processing ${batches.length} batches of ${batchSize} teams each`);
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`🔄 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} teams)`);
      
      const batchPromises = batch.map(async (teamDoc) => {
        const teamId = teamDoc.id;
        const teamData = teamDoc.data();
        progress.currentTeam = teamData.title || `Team-${teamId.substring(0, 8)}`;
        
        console.log(`🔧 Fixing team: ${progress.currentTeam} (${teamId})`);
        
        try {
          const teamRef = doc(db, 'workspaces', teamId);
          
          // teamLeaderEmails에서 올바른 리더들 추출
          const correctLeaders = extractEmailsFromObject(teamData.teamLeaderEmails);
          const correctMembers = extractEmailsFromObject(teamData.teamMemberEmails);
          
          console.log(`📊 Team ${teamId} correct data:`, {
            teamName: teamData.title,
            correctLeaders,
            correctMembers,
            currentLeaders: teamData.leaders,
            currentMemberEmails: teamData.memberEmails
          });
          
          // 올바른 데이터로 업데이트
          await updateDoc(teamRef, {
            leaders: correctLeaders,
            memberEmails: correctMembers,
            dataFixed: true,
            fixDate: new Date().toISOString()
          });
          
          progress.success++;
          console.log(`✅ Successfully fixed: ${progress.currentTeam}`);
          
        } catch (error) {
          progress.failed++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          progress.errors.push(`${progress.currentTeam} (${teamId}): ${errorMsg}`);
          console.log(`❌ Failed to fix: ${progress.currentTeam} - ${errorMsg}`);
        }
        
        progress.processed++;
        
        // 진행 상황 콜백 호출
        if (onProgress) {
          onProgress({ ...progress });
        }
      });
      
      // 배치 완료 대기
      await Promise.all(batchPromises);
      
      const percentage = Math.round((progress.processed / progress.total) * 100);
      console.log(`📈 Fix Progress: ${progress.processed}/${progress.total} (${percentage}%)`);
      console.log(`   ✅ Success: ${progress.success} | ❌ Failed: ${progress.failed}`);
    }
    
    console.log('🎉 LEADERS DATA FIX COMPLETED!', {
      total: progress.total,
      success: progress.success,
      failed: progress.failed,
      successRate: `${Math.round((progress.success / progress.total) * 100)}%`,
      errors: progress.errors.length
    });
    
    return progress;
    
  } catch (error) {
    console.error('❌ Leaders data fix failed:', error);
    progress.errors.push(`Fix failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return progress;
  }
}

/**
 * Firebase의 모든 팀 데이터 구조를 최적화 (전체 팀 대상)
 */
export async function optimizeAllTeamsInFirebase(
  batchSize: number = 10,
  onProgress?: (progress: MigrationProgress) => void
): Promise<MigrationProgress> {
  console.log('🚀 Starting FULL FIREBASE optimization for ALL teams...');
  
  const progress: MigrationProgress = {
    total: 0,
    processed: 0,
    success: 0,
    failed: 0,
    errors: []
  };
  
  try {
    // Firebase의 모든 팀 조회
    console.log('🔍 Scanning Firebase for all teams...');
    const allTeamsSnapshot = await getDocs(collection(db, 'workspaces'));
    progress.total = allTeamsSnapshot.size;
    
    console.log(`📊 Found ${progress.total} teams in Firebase to optimize`);
    
    if (progress.total === 0) {
      console.log('ℹ️ No teams found in Firebase');
      return progress;
    }
    
    // 배치 단위로 처리 (메모리 효율성)
    const teams = allTeamsSnapshot.docs;
    const batches = [];
    
    for (let i = 0; i < teams.length; i += batchSize) {
      batches.push(teams.slice(i, i + batchSize));
    }
    
    console.log(`📦 Processing ${batches.length} batches of ${batchSize} teams each`);
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`🔄 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} teams)`);
      
      const batchPromises = batch.map(async (teamDoc) => {
        const teamId = teamDoc.id;
        const teamData = teamDoc.data();
        progress.currentTeam = teamData.title || `Team-${teamId.substring(0, 8)}`;
        
        console.log(`⚙️ Optimizing team: ${progress.currentTeam} (${teamId})`);
        
        const result = await normalizeTeamData(teamId);
        progress.processed++;
        
        if (result.success) {
          progress.success++;
          console.log(`✅ Successfully optimized: ${progress.currentTeam}`);
        } else {
          progress.failed++;
          if (result.error) {
            progress.errors.push(`${progress.currentTeam} (${teamId}): ${result.error}`);
            console.log(`❌ Failed to optimize: ${progress.currentTeam} - ${result.error}`);
          }
        }
        
        // 진행 상황 콜백 호출
        if (onProgress) {
          onProgress({ ...progress });
        }
        
        return result;
      });
      
      // 배치 완료 대기
      await Promise.all(batchPromises);
      
      const percentage = Math.round((progress.processed / progress.total) * 100);
      console.log(`📈 Firebase Optimization Progress: ${progress.processed}/${progress.total} (${percentage}%)`);
      console.log(`   ✅ Success: ${progress.success} | ❌ Failed: ${progress.failed}`);
    }
    
    console.log('🎉 FULL FIREBASE OPTIMIZATION COMPLETED!', {
      total: progress.total,
      success: progress.success,
      failed: progress.failed,
      successRate: `${Math.round((progress.success / progress.total) * 100)}%`,
      errors: progress.errors.length
    });
    
    return progress;
    
  } catch (error) {
    console.error('❌ Full Firebase optimization failed:', error);
    progress.errors.push(`Full optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return progress;
  }
}

/**
 * 모든 팀의 데이터 구조를 정규화 (배치 처리) - 기존 함수와 호환성 유지
 * @deprecated Use optimizeAllTeamsInFirebase instead
 */
export async function migrateAllTeamsData(
  batchSize: number = 10,
  onProgress?: (progress: MigrationProgress) => void
): Promise<MigrationProgress> {
  return optimizeAllTeamsInFirebase(batchSize, onProgress);
}

/**
 * 팀 데이터 구조 분석 (마이그레이션 전 상태 확인)
 */
export async function analyzeTeamDataStructures(): Promise<{
  totalTeams: number;
  needsMigration: number;
  alreadyNormalized: number;
  structureTypes: {
    leaders: { array: number; object: number; missing: number };
    members: { array: number; object: number; missing: number };
  };
  sampleTeams: TeamDataStructure[];
}> {
  console.log('🔍 Analyzing team data structures...');
  
  const allTeamsSnapshot = await getDocs(collection(db, 'workspaces'));
  const teams = allTeamsSnapshot.docs;
  
  const analysis = {
    totalTeams: teams.length,
    needsMigration: 0,
    alreadyNormalized: 0,
    structureTypes: {
      leaders: { array: 0, object: 0, missing: 0 },
      members: { array: 0, object: 0, missing: 0 }
    },
    sampleTeams: [] as TeamDataStructure[]
  };
  
  teams.forEach((teamDoc, index) => {
    const data = teamDoc.data();
    const teamId = teamDoc.id;
    
    // Leaders 구조 분석
    if (Array.isArray(data.leaders)) {
      analysis.structureTypes.leaders.array++;
    } else if (data.leaders && typeof data.leaders === 'object') {
      analysis.structureTypes.leaders.object++;
    } else {
      analysis.structureTypes.leaders.missing++;
    }
    
    // Members 구조 분석
    if (Array.isArray(data.memberEmails)) {
      analysis.structureTypes.members.array++;
    } else if (data.memberEmails && typeof data.memberEmails === 'object') {
      analysis.structureTypes.members.object++;
    } else {
      analysis.structureTypes.members.missing++;
    }
    
    // 마이그레이션 필요 여부 판단
    const needsMigration = 
      (data.teamLeaderEmails && !Array.isArray(data.leaders)) ||
      (data.teamMemberEmails && !Array.isArray(data.memberEmails));
    
    if (needsMigration) {
      analysis.needsMigration++;
    } else {
      analysis.alreadyNormalized++;
    }
    
    // 샘플 팀 데이터 수집 (처음 5개)
    if (index < 5) {
      analysis.sampleTeams.push({
        teamId,
        teamName: data.title || 'Untitled',
        teamLeaderEmails: data.teamLeaderEmails,
        teamMemberEmails: data.teamMemberEmails,
        leaders: data.leaders,
        memberEmails: data.memberEmails
      });
    }
  });
  
  console.log('📊 Analysis completed:', analysis);
  return analysis;
}

/**
 * 특정 팀의 데이터 구조 미리보기
 */
export async function previewTeamMigration(teamId: string): Promise<{
  current: any;
  normalized: {
    leaders: string[];
    memberEmails: string[];
  };
  changes: string[];
}> {
  const teamRef = doc(db, 'workspaces', teamId);
  const teamDoc = await getDoc(teamRef);
  
  if (!teamDoc.exists()) {
    throw new Error('Team not found');
  }
  
  const data = teamDoc.data();
  const changes: string[] = [];
  
  const normalizedLeaders = extractEmailsFromObject(data.teamLeaderEmails);
  const normalizedMembers = extractEmailsFromObject(data.teamMemberEmails);
  
  const currentLeaders = Array.isArray(data.leaders) ? data.leaders : [];
  const currentMembers = Array.isArray(data.memberEmails) ? data.memberEmails : [];
  
  if (JSON.stringify(normalizedLeaders.sort()) !== JSON.stringify(currentLeaders.sort())) {
    changes.push(`Leaders: ${currentLeaders.length} → ${normalizedLeaders.length}`);
  }
  
  if (JSON.stringify(normalizedMembers.sort()) !== JSON.stringify(currentMembers.sort())) {
    changes.push(`Members: ${currentMembers.length} → ${normalizedMembers.length}`);
  }
  
  return {
    current: {
      teamLeaderEmails: data.teamLeaderEmails,
      teamMemberEmails: data.teamMemberEmails,
      leaders: data.leaders,
      memberEmails: data.memberEmails
    },
    normalized: {
      leaders: normalizedLeaders,
      memberEmails: normalizedMembers
    },
    changes
  };
}
