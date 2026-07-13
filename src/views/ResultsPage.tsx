import React, { useState, useEffect } from 'react';
import { useNavigate } from '../lib/router';
import { db, COLLECTIONS } from '../services/firebase/config';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/layout/Header';
import Toast from '../components/common/Toast';

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

interface SavedResult {
  id: string;
  userId: string;
  timestamp: number;
  groups: Group[];
  members: Member[];
  groupSize: number;
  fixedPairs: FixedPair[];
  lockedTeams: LockedTeam[];
  title: string;
}

interface ResultsPageProps {
  darkMode: boolean;
  setDarkMode: (value: boolean | ((val: boolean) => boolean)) => void;
}

function ResultsPage({ darkMode, setDarkMode }: ResultsPageProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [savedResults, setSavedResults] = useState<SavedResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const loadSavedResults = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const q = query(collection(db, COLLECTIONS.SAVED_RESULTS), where('userId', '==', user.id));
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
        setToastMessage('Failed to load saved results');
        setShowToast(true);
      } finally {
        setLoading(false);
      }
    };
    loadSavedResults();
  }, [user]);

  const deleteSavedResult = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, COLLECTIONS.SAVED_RESULTS, id));
      setSavedResults(savedResults.filter(result => result.id !== id));
      setToastMessage('Result deleted successfully!');
      setShowToast(true);
    } catch (error) {
      setToastMessage('Failed to delete result. Please try again.');
      setShowToast(true);
    }
  };

  const loadSavedResult = (result: SavedResult) => {
    // TeamMakerApp으로 이동하면서 결과 데이터를 전달
    navigate('/app', { state: { loadResult: result } });
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <Header onBackToLanding={() => navigate('/')} darkMode={darkMode} setDarkMode={setDarkMode} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="text-6xl mb-4 animate-bounce">📊</div>
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                Loading Results...
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Toast message={toastMessage} show={showToast} onClose={() => setShowToast(false)} />
      <Header onBackToLanding={() => navigate('/')} darkMode={darkMode} setDarkMode={setDarkMode} onNavToggle={setNavOpen} />
      <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-all duration-300 ease-in-out ${
        navOpen ? 'ml-56' : 'ml-0'
      }`}>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Saved Results
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                Your previously saved team formations
              </p>
            </div>
            <button
              onClick={() => navigate('/app')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create New Result
            </button>
          </div>

          {savedResults.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📊</div>
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                No saved results yet
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Create and save your first team formation to see it here.
              </p>
              <button
                onClick={() => navigate('/app')}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create Your First Result
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {savedResults.map((result) => (
                <div key={result.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow bg-white dark:bg-gray-700">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{result.title}</h3>
                    <button
                      onClick={() => deleteSavedResult(result.id)}
                      className="text-red-600 hover:text-red-800 transition-colors p-1"
                      title="Delete result"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="text-sm text-gray-600 dark:text-gray-300 mb-4 space-y-1">
                    <p>Members: {result.members.length}</p>
                    <p>Teams: {result.groups.length}</p>
                    <p>Group Size: {result.groupSize}</p>
                    <p>Fixed Pairs: {result.fixedPairs.length}</p>
                    <p>Locked Teams: {result.lockedTeams.length}</p>
                    <p>Saved: {formatDate(result.timestamp)}</p>
                  </div>
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={() => loadSavedResult(result)}
                      className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                      Load Result
                    </button>
                    <button
                      onClick={() => {
                        // 결과를 워크스페이스로 변환
                        navigate('/app', { 
                          state: { 
                            loadResult: result,
                            createWorkspace: true 
                          } 
                        });
                      }}
                      className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                      title="Create workspace from this result"
                    >
                      Create Workspace
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResultsPage; 
