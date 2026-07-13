import React, { useState, useEffect } from 'react';
import Header from '../components/layout/Header';
import { db } from '../services/firebase/config';
import { collection, addDoc, query, where, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import Toast from '../components/common/Toast';
import AuthModal from '../components/auth/AuthModal';
import { useNavigate } from '../lib/router';
import { createTeamUrl, getUserIdFromEmail } from '../utils/urlUtils';

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

interface AnimationStep {
  groups: Group[];
  step: number;
  totalSteps: number;
  description: string;
}

interface SavedResult {
  id: string;
  timestamp: number;
  groups: Group[];
  members: Member[];
  groupSize: number;
  fixedPairs: FixedPair[];
  lockedTeams: LockedTeam[];
  title: string;
}

interface TeamMakerAppProps {
  darkMode: boolean;
  setDarkMode: (value: boolean | ((val: boolean) => boolean)) => void;
}

function TeamMakerApp({ darkMode, setDarkMode }: TeamMakerAppProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [groupSize, setGroupSize] = useState<number>(4);
  const [fixedPairs, setFixedPairs] = useState<FixedPair[]>([]);
  const [lockedTeams, setLockedTeams] = useState<LockedTeam[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isShuffling, setIsShuffling] = useState<boolean>(false);
  const [showFixedPairModal, setShowFixedPairModal] = useState<boolean>(false);
  const [showLockedTeamModal, setShowLockedTeamModal] = useState<boolean>(false);
  const [showBulkAddModal, setShowBulkAddModal] = useState<boolean>(false);
  const [newFixedPair, setNewFixedPair] = useState<string[]>([]);
  const [newLockedTeam, setNewLockedTeam] = useState<string[]>([]);
  const [bulkMembersText, setBulkMembersText] = useState<string>('');
  const [animationSteps, setAnimationSteps] = useState<AnimationStep[]>([]);
  const [currentAnimationStep, setCurrentAnimationStep] = useState<number>(0);
  const [savedResults, setSavedResults] = useState<SavedResult[]>([]);
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
  const [saveTitle, setSaveTitle] = useState<string>('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [workspaceLink, setWorkspaceLink] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  // Load saved results from localStorage
  useEffect(() => {
    const loadSavedResults = async () => {
      if (!user) return;
      try {
        const q = query(collection(db, 'workspaces'), where('userId', '==', user.id));
        const snapshot = await getDocs(q);
        const results: SavedResult[] = [];
        snapshot.forEach(docSnap => {
          results.push({ id: docSnap.id, ...docSnap.data() } as SavedResult);
        });
        // 최신순(내림차순) 정렬
        results.sort((a, b) => b.timestamp - a.timestamp);
        setSavedResults(results);
      } catch (error) {
        console.error('Failed to load saved results:', error);
      }
    };
    loadSavedResults();
  }, [user]);

  const addMember = () => {
    const newMember: Member = {
      id: Date.now().toString(),
      name: `Member ${members.length + 1}`
    };
    setMembers([...members, newMember]);
  };

  const addBulkMembers = () => {
    if (!bulkMembersText.trim()) return;

    const memberNames = bulkMembersText
      .split('\n')
      .map(name => name.trim())
      .filter(name => name.length > 0);

    const newMembers: Member[] = memberNames.map((name, index) => ({
      id: `${Date.now()}-${index}`,
      name: name || `Member ${members.length + index + 1}`
    }));

    setMembers([...members, ...newMembers]);
    setBulkMembersText('');
    setShowBulkAddModal(false);
  };

  const removeMember = (id: string) => {
    setMembers(members.filter(member => member.id !== id));
  };

  const updateMemberName = (id: string, name: string) => {
    setMembers(members.map(member => 
      member.id === id ? { ...member, name } : member
    ));
  };

  const addFixedPair = () => {
    if (newFixedPair.length === 2) {
      const newPair: FixedPair = {
        id: Date.now().toString(),
        members: newFixedPair
      };
      setFixedPairs([...fixedPairs, newPair]);
      setNewFixedPair([]);
      setShowFixedPairModal(false);
    }
  };

  const removeFixedPair = (id: string) => {
    setFixedPairs(fixedPairs.filter(pair => pair.id !== id));
  };

  const addLockedTeam = () => {
    if (newLockedTeam.length >= 1) {
      const newTeam: LockedTeam = {
        id: Date.now().toString(),
        members: newLockedTeam
      };
      setLockedTeams([...lockedTeams, newTeam]);
      setNewLockedTeam([]);
      setShowLockedTeamModal(false);
    }
  };

  const removeLockedTeam = (id: string) => {
    setLockedTeams(lockedTeams.filter(team => team.id !== id));
  };

  const saveResult = async () => {
    if (!saveTitle.trim() || groups.length === 0 || !user) return;
    // 중복 title 체크
    const isDuplicate = savedResults.some(result => result.title.trim() === saveTitle.trim());
    if (isDuplicate) {
      setToastMessage('A result with the same title already exists. Please use a different title.');
      setShowToast(true);
      return;
    }
    try {
      const docRef = await addDoc(collection(db, 'workspaces'), {
        userId: user.id,
        timestamp: Date.now(),
        createdAt: Date.now(),
        groups,
        members,
        groupSize,
        fixedPairs,
        lockedTeams,
        title: saveTitle.trim(),
        // 팀 멤버십 정보 추가
        leaders: [], // 초기에는 빈 배열
        memberEmails: [], // 멤버 이메일 목록 (members와 구분)
        teamLeaderEmails: [], // 기존 필드와의 호환성
        teamMemberEmails: [] // 기존 필드와의 호환성
      });
      setShowSaveModal(false);
      setSaveTitle('');
      setToastMessage('Team created successfully!');
      setShowToast(true);
      
      // 팀 생성 후 새로운 URL 구조로 팀 상세 페이지로 이동
      const newUrl = await createTeamUrl(
        user.email ? getUserIdFromEmail(user.email) : '',
        saveTitle.trim(),
        docRef.id,
        db
      );
      navigate(newUrl);

      // 저장 후 Firestore에서 다시 불러오기
      const q = query(collection(db, 'workspaces'), where('userId', '==', user.id));
      const snapshot = await getDocs(q);
      const results: SavedResult[] = [];
      snapshot.forEach(docSnap => {
        results.push({ id: docSnap.id, ...docSnap.data() } as SavedResult);
      });
      // 최신순(내림차순) 정렬
      results.sort((a, b) => b.timestamp - a.timestamp);
      setSavedResults(results);
    } catch (error) {
      setToastMessage('Failed to save result. Please try again.');
      setShowToast(true);
    }
  };

  const deleteSavedResult = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'workspaces', id));
      setToastMessage('Result deleted successfully!');
      setShowToast(true);

      // 삭제 후 Firestore에서 다시 불러오기
      const q = query(collection(db, 'workspaces'), where('userId', '==', user.id));
      const snapshot = await getDocs(q);
      const results: SavedResult[] = [];
      snapshot.forEach(docSnap => {
        results.push({ id: docSnap.id, ...docSnap.data() } as SavedResult);
      });
      // 최신순(내림차순) 정렬
      results.sort((a, b) => b.timestamp - a.timestamp);
      setSavedResults(results);
    } catch (error) {
      setToastMessage('Failed to delete result. Please try again.');
      setShowToast(true);
    }
  };

  const loadSavedResult = (result: SavedResult) => {
    setMembers(result.members);
    setGroupSize(result.groupSize);
    setFixedPairs(result.fixedPairs);
    setLockedTeams(result.lockedTeams);
    setGroups(result.groups);
  };

  const handleCreateWorkspace = async () => {
    if (!user || groups.length === 0) return;
    try {
      const teamTitle = saveTitle.trim() || `Workspace ${new Date().toLocaleString()}`;
      const docRef = await addDoc(collection(db, 'workspaces'), {
        userId: user.id,
        createdAt: Date.now(),
        groups,
        members,
        groupSize,
        fixedPairs,
        lockedTeams,
        title: teamTitle,
        // 팀 멤버십 정보 추가 (새로운 구조)
        leaders: [], // 초기에는 빈 배열
        memberEmails: [], // 멤버 이메일 목록 (members와 구분)
        teamLeaderEmails: [], // 기존 필드와의 호환성
        teamMemberEmails: [] // 기존 필드와의 호환성
      });
      
      // 새로운 URL 형식으로 링크 생성
      const newUrl = await createTeamUrl(
        user.email ? getUserIdFromEmail(user.email) : '',
        teamTitle,
        docRef.id,
        db
      );
      const link = `${window.location.origin}${newUrl}`;
      setWorkspaceLink(link);
      setToastMessage('Workspace link created!');
      setShowToast(true);
    } catch (error) {
      setToastMessage('Failed to create workspace. Please try again.');
      setShowToast(true);
    }
  };

  const generateAnimationSteps = (finalGroups: Group[]): AnimationStep[] => {
    const steps: AnimationStep[] = [];
    const totalSteps = 15;
    
    // Initial state (all members in one group)
    const allMembers = members.map(m => m.name);
    steps.push({
      groups: [{
        id: 'initial',
        members: allMembers
      }],
      step: 0,
      totalSteps,
      description: "Collecting members..."
    });

    // First shuffle phase
    for (let i = 1; i <= 3; i++) {
      const shuffledMembers = [...allMembers].sort(() => Math.random() - 0.5);
      const tempGroups: Group[] = [];
      
      for (let j = 0; j < shuffledMembers.length; j += groupSize) {
        const groupMembers = shuffledMembers.slice(j, j + groupSize);
        tempGroups.push({
          id: `temp-${i}-${j}`,
          members: groupMembers
        });
      }
      
      steps.push({
        groups: tempGroups,
        step: i,
        totalSteps,
        description: "First shuffling phase..."
      });
    }

    // Fixed pairs processing
    if (fixedPairs.length > 0) {
      steps.push({
        groups: finalGroups,
        step: 4,
        totalSteps,
        description: "Placing fixed pairs..."
      });
    }

    // Second shuffle phase
    for (let i = 5; i <= 8; i++) {
      const shuffledMembers = [...allMembers].sort(() => Math.random() - 0.5);
      const tempGroups: Group[] = [];
      
      for (let j = 0; j < shuffledMembers.length; j += groupSize) {
        const groupMembers = shuffledMembers.slice(j, j + groupSize);
        tempGroups.push({
          id: `temp-${i}-${j}`,
          members: groupMembers
        });
      }
      
      steps.push({
        groups: tempGroups,
        step: i,
        totalSteps,
        description: "Second shuffling phase..."
      });
    }

    // Locked teams processing
    if (lockedTeams.length > 0) {
      steps.push({
        groups: finalGroups,
        step: 9,
        totalSteps,
        description: "Placing locked teams..."
      });
    }

    // Third shuffle phase
    for (let i = 10; i <= 12; i++) {
      const shuffledMembers = [...allMembers].sort(() => Math.random() - 0.5);
      const tempGroups: Group[] = [];
      
      for (let j = 0; j < shuffledMembers.length; j += groupSize) {
        const groupMembers = shuffledMembers.slice(j, j + groupSize);
        tempGroups.push({
          id: `temp-${i}-${j}`,
          members: groupMembers
        });
      }
      
      steps.push({
        groups: tempGroups,
        step: i,
        totalSteps,
        description: "Third shuffling phase..."
      });
    }

    // Final optimization
    steps.push({
      groups: finalGroups,
      step: 13,
      totalSteps,
      description: "Optimizing group balance..."
    });

    // Final result
    steps.push({
      groups: finalGroups,
      step: 14,
      totalSteps,
      description: "Complete!"
    });

    return steps;
  };

  const shuffleGroups = () => {
    if (members.length === 0) return;

    // 팀 수가 멤버 수보다 많으면 오류
    if (groupSize > members.length) {
      setToastMessage(`Cannot create ${groupSize} teams with only ${members.length} members. Please reduce the number of teams or add more members.`);
      setShowToast(true);
      return;
    }

    setIsShuffling(true);
    setCurrentAnimationStep(0);
    
    const allMemberNames = members.map(m => m.name);
    
    // Step 1: Create groups array
    const finalGroups: Group[] = [];
    const usedMembers = new Set<string>();
    
    // Step 2: Add locked teams first (these are separate groups)
    lockedTeams.forEach((team) => {
      finalGroups.push({
        id: `locked-team-${team.id}`,
        members: ['', ...team.members] // 빈 문자열을 첫 번째에 추가하여 리더 없음을 표시
      });
      team.members.forEach(member => usedMembers.add(member));
    });

    // Step 3: Add fixed pairs to usedMembers
    fixedPairs.forEach(pair => pair.members.forEach(member => usedMembers.add(member)));

    // Step 4: Calculate how many groups we still need
    const groupsNeeded = groupSize - lockedTeams.length;

    // Step 5: Prepare empty groups for remaining members, with target sizes
    const remainingMembers = allMemberNames.filter(name => !usedMembers.has(name));
    const shuffledRemaining = [...remainingMembers].sort(() => Math.random() - 0.5);
    const totalToDistribute = fixedPairs.length * 2 + shuffledRemaining.length;
    const baseSize = Math.floor(totalToDistribute / groupsNeeded);
    const extra = totalToDistribute % groupsNeeded;
    const groupTargetSizes = Array.from({ length: groupsNeeded }, (_, i) => baseSize + (i < extra ? 1 : 0));
    const groupsArr: string[][] = Array.from({ length: groupsNeeded }, () => []);

    // Step 6: Distribute fixed pairs to groups (one pair per group, if any)
    fixedPairs.forEach((pair, idx) => {
      if (groupsArr[idx % groupsArr.length]) {
        groupsArr[idx % groupsArr.length].push(...pair.members);
      }
    });

    // Step 7: Distribute remaining members to meet each group's target size
    let groupIdx = 0;
    shuffledRemaining.forEach(member => {
      // Skip to next group if this one is full
      while (groupsArr[groupIdx].length >= groupTargetSizes[groupIdx]) {
        groupIdx = (groupIdx + 1) % groupsArr.length;
      }
      groupsArr[groupIdx].push(member);
      groupIdx = (groupIdx + 1) % groupsArr.length;
    });

    // Step 8: Add these groups to finalGroups
    groupsArr.forEach((members, idx) => {
      if (members.length > 0) {
        finalGroups.push({
          id: `group-${finalGroups.length + 1}`,
          members: ['', ...members] // 빈 문자열을 첫 번째에 추가하여 리더 없음을 표시
        });
      }
    });

    // Step 6: Optimize group balance (but respect fixed pairs and locked teams)
    const targetGroupSize = Math.ceil(allMemberNames.length / groupSize);
    const optimizedGroups = optimizeGroupBalance(finalGroups, targetGroupSize);

    // === [Allow solo teams - no error message] ===
    // 1명 팀도 허용하여 더 유연한 팀 구성 가능
    // ================================================

    // Generate animation steps
    const steps = generateAnimationSteps(optimizedGroups);
    setAnimationSteps(steps);
    
    // Start animation
    let stepIndex = 0;
    const animationInterval = setInterval(() => {
      if (stepIndex < steps.length) {
        setGroups(steps[stepIndex].groups);
        setCurrentAnimationStep(stepIndex);
        stepIndex++;
      } else {
        clearInterval(animationInterval);
        setIsShuffling(false);
        setAnimationSteps([]);
        setCurrentAnimationStep(0);
      }
    }, 400);
  };

  const optimizeGroupBalance = (groups: Group[], targetSize: number): Group[] => {
    // Don't optimize if we have fixed pairs or locked teams to preserve their integrity
    const hasFixedPairs = fixedPairs.length > 0;
    const hasLockedTeams = lockedTeams.length > 0;
    
    if (hasFixedPairs || hasLockedTeams) {
      return groups;
    }
    
    // Sort groups by size
    const sortedGroups = [...groups].sort((a, b) => a.members.length - b.members.length);
    
    // Find groups that are too small or too large
    const smallGroups = sortedGroups.filter(g => g.members.length < targetSize - 1);
    const largeGroups = sortedGroups.filter(g => g.members.length > targetSize + 1);
    
    // Redistribute members to balance groups
    for (const smallGroup of smallGroups) {
      for (const largeGroup of largeGroups) {
        if (smallGroup.members.length < targetSize && largeGroup.members.length > targetSize) {
          const memberToMove = largeGroup.members.pop();
          if (memberToMove) {
            smallGroup.members.push(memberToMove);
          }
        }
      }
    }
    
    return groups;
  };

  const getProgressPercentage = () => {
    if (animationSteps.length === 0) return 0;
    return ((currentAnimationStep + 1) / animationSteps.length) * 100;
  };

  // const formatDate = (timestamp: number) => {
  //   return new Date(timestamp).toLocaleString('en-US');
  // };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Toast message={toastMessage} show={showToast} onClose={() => setShowToast(false)} />
      <Header onBackToLanding={() => navigate('/')} darkMode={darkMode} setDarkMode={setDarkMode} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Shuffling Progress Overlay */}
        {isShuffling && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
              <div className="text-center">
                <div className="text-6xl mb-4 animate-bounce">🎲</div>
                <h3 className="text-xl font-semibold text-gray-800 mb-4">
                  Shuffling...
                </h3>
                <p className="text-gray-600 mb-6">
                  {animationSteps[currentAnimationStep]?.description || "Processing..."}
                </p>
                
                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
                  <div 
                    className="bg-gradient-to-r from-purple-500 to-blue-500 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${getProgressPercentage()}%` }}
                  ></div>
                </div>
                
                <p className="text-sm text-gray-500">
                  {currentAnimationStep + 1} / {animationSteps.length} steps
                </p>
                
                {/* Animated Dots */}
                <div className="flex justify-center space-x-1 mt-4">
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Team Formation</h2>
          
          {/* Members Section */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Members ({members.length})</h3>
              <div className="flex space-x-2">
                <button
                  onClick={addMember}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Add Member
                </button>
                <button
                  onClick={() => setShowBulkAddModal(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Bulk Add
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {members.map((member, index) => (
                <div key={member.id} className="flex items-center space-x-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <input
                    type="text"
                    value={member.name}
                    onChange={(e) => updateMemberName(member.id, e.target.value)}
                    className="flex-1 px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-300"
                    placeholder={`Member ${index + 1}`}
                  />
                  <button
                    onClick={() => removeMember(member.id)}
                    className="px-2 py-1 text-red-600 hover:text-red-800 transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Number of Teams Section */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Number of Teams</h3>
            <div className="flex items-center space-x-4">
              <label className="text-gray-700 dark:text-gray-200">Teams to create:</label>
              <input
                type="number"
                min="2"
                max="10"
                value={groupSize}
                onChange={(e) => setGroupSize(parseInt(e.target.value) || 4)}
                className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800"
              />
            </div>
          </div>

          {/* Fixed Pairs Section */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Fixed Pairs ({fixedPairs.length})</h3>
              <button
                onClick={() => setShowFixedPairModal(true)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                Add Fixed Pair
              </button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {fixedPairs.map((pair) => (
                <div key={pair.id} className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/30 rounded-lg">
                  <span className="text-purple-800 dark:text-purple-200">
                    {pair.members.join(' + ')}
                  </span>
                  <button
                    onClick={() => removeFixedPair(pair.id)}
                    className="px-2 py-1 text-red-600 hover:text-red-800 transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Locked Teams Section */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Locked Teams ({lockedTeams.length})</h3>
              <button
                onClick={() => setShowLockedTeamModal(true)}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
              >
                Add Locked Team
              </button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {lockedTeams.map((team) => (
                <div key={team.id} className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/30 rounded-lg">
                  <span className="text-orange-800 dark:text-orange-200">
                    {team.members.join(', ')}
                  </span>
                  <button
                    onClick={() => removeLockedTeam(team.id)}
                    className="px-2 py-1 text-red-600 hover:text-red-800 transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Shuffle Button */}
          <div className="mb-6">
            <button
              onClick={shuffleGroups}
              disabled={members.length === 0 || isShuffling}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-lg dark:from-blue-700 dark:to-purple-800"
            >
              {isShuffling ? 'Shuffling...' : 'Shuffle Teams!'}
            </button>
          </div>
        </div>

        {/* Results Section */}
        {groups.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white"></h2>
              <div className="flex space-x-2">
                <button
                  onClick={async () => {
                    if (user) {
                      setShowSaveModal(true);
                    } else {
                      // AuthModal 열기
                      setShowAuthModal(true);
                    }
                  }}
                  className={`px-6 py-2 rounded-lg transition-colors font-semibold ${
                    user 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-gray-400 text-white hover:bg-gray-500'
                  }`}
                >
                  {user ? 'Create Team' : 'Login to Create Team'}
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groups.map((group, index) => (
                <div key={group.id} className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/40 dark:to-purple-900/40 rounded-lg p-4 border border-blue-200 dark:border-blue-900/40">
                  <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-200 mb-3">Team {index + 1}</h3>
                  <ul className="space-y-2">
                    {group.members.filter(member => member.trim() !== '').map((memberName, memberIndex) => (
                      <li key={memberIndex} className="flex items-center space-x-2">
                        <span className="w-6 h-6 bg-blue-600 dark:bg-blue-800 text-white rounded-full flex items-center justify-center text-sm font-medium">
                          {memberIndex + 1}
                        </span>
                        <span className="text-gray-800 dark:text-gray-100">{memberName}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}



        {/* Modals */}
        {/* Fixed Pair Modal */}
        {showFixedPairModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-96 max-w-md">
              <h3 className="text-lg font-semibold mb-4">Add Fixed Pair</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select two members:</label>
                  <div className="grid grid-cols-2 gap-2">
                    {members.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => {
                          if (newFixedPair.includes(member.name)) {
                            setNewFixedPair(newFixedPair.filter(name => name !== member.name));
                          } else if (newFixedPair.length < 2) {
                            setNewFixedPair([...newFixedPair, member.name]);
                          }
                        }}
                        className={`p-2 rounded border transition-colors ${
                          newFixedPair.includes(member.name)
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                        }`}
                      >
                        {member.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={addFixedPair}
                    disabled={newFixedPair.length !== 2}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                  >
                    Add Pair
                  </button>
                  <button
                    onClick={() => {
                      setShowFixedPairModal(false);
                      setNewFixedPair([]);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Locked Team Modal */}
        {showLockedTeamModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-96 max-w-md">
              <h3 className="text-lg font-semibold mb-4">Add Locked Team</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select team members (1 or more):</label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {members.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => {
                          if (newLockedTeam.includes(member.name)) {
                            setNewLockedTeam(newLockedTeam.filter(name => name !== member.name));
                          } else {
                            setNewLockedTeam([...newLockedTeam, member.name]);
                          }
                        }}
                        className={`p-2 rounded border transition-colors ${
                          newLockedTeam.includes(member.name)
                            ? 'bg-orange-600 text-white border-orange-600'
                            : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                        }`}
                      >
                        {member.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={addLockedTeam}
                    disabled={newLockedTeam.length < 1}
                    className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
                  >
                    Add Team
                  </button>
                  <button
                    onClick={() => {
                      setShowLockedTeamModal(false);
                      setNewLockedTeam([]);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Add Modal */}
        {showBulkAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-96 max-w-md">
              <h3 className="text-lg font-semibold mb-4">Bulk Add Members</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Enter member names (one per line):
                  </label>
                  <textarea
                    value={bulkMembersText}
                    onChange={(e) => setBulkMembersText(e.target.value)}
                    className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="John Doe&#10;Jane Smith&#10;Bob Johnson"
                  />
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={addBulkMembers}
                    disabled={!bulkMembersText.trim()}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    Add Members
                  </button>
                  <button
                    onClick={() => {
                      setShowBulkAddModal(false);
                      setBulkMembersText('');
                    }}
                    className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Save Modal */}
        {showSaveModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-96 max-w-md">
              <h3 className="text-lg font-semibold mb-4">Create Team</h3>
              {user ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Team name:</label>
                    <input
                      type="text"
                      value={saveTitle}
                      onChange={(e) => setSaveTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      placeholder="Enter a name for your team"
                    />
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={saveResult}
                      disabled={!saveTitle.trim() || savedResults.some(result => result.title.trim() === saveTitle.trim())}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => {
                        setShowSaveModal(false);
                        setSaveTitle('');
                      }}
                      className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                  {savedResults.some(result => result.title.trim() === saveTitle.trim()) && (
                    <div className="text-red-600 text-sm mt-2">이미 저장된 이름입니다.</div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-6xl mb-4">🔐</div>
                    <p className="text-gray-600 dark:text-gray-300 mb-6">
                      You need to sign in to create and save teams.
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        setShowSaveModal(false);
                        setShowAuthModal(true);
                      }}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => {
                        setShowSaveModal(false);
                      }}
                      className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      {/* 워크스페이스 링크 Toast */}
      {workspaceLink && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded shadow-lg z-50 flex items-center space-x-4">
          <span>Workspace Link:</span>
          <a href={workspaceLink} target="_blank" rel="noopener noreferrer" className="underline text-blue-300">{workspaceLink}</a>
          <button
            className="ml-2 px-2 py-1 bg-blue-500 rounded text-white text-sm"
            onClick={() => { navigator.clipboard.writeText(workspaceLink); setToastMessage('Link copied!'); setShowToast(true); }}
          >
            Copy
          </button>
          <button className="ml-2 text-sm underline" onClick={() => setWorkspaceLink(null)}>닫기</button>
        </div>
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        initialMode="login"
      />
      </div>
    </div>
  );
}

export default TeamMakerApp;
