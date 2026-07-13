import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Assignment, TeamLeader } from '../../types';
import { evaluateAssignmentSubmission } from '../../services/assignment/evaluationService';
import Modal from '../common/Modal';
import Button from '../common/Button';

interface BulkAssignmentEvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: Assignment;
  teamLeaders: TeamLeader[];
  onEvaluationSuccess: () => Promise<void>;
}

interface TeamScore {
  teamId: string;
  teamName: string;
  leaderName: string;
  score: number;
  feedback: string;
}

const BulkAssignmentEvaluationModal: React.FC<BulkAssignmentEvaluationModalProps> = ({
  isOpen,
  onClose,
  assignment,
  teamLeaders,
  onEvaluationSuccess
}) => {
  const { user } = useAuth();
  const [maxScore, setMaxScore] = useState<number>(100);
  const [teamScores, setTeamScores] = useState<TeamScore[]>([]);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // 팀별 점수 초기화 및 이전 설정값 복원
  useEffect(() => {
    if (teamLeaders && isOpen) {
      // 이전 maxScore 복원 (localStorage에서)
      const savedMaxScore = localStorage.getItem(`bulk-eval-maxscore-${assignment.id}`);
      if (savedMaxScore) {
        setMaxScore(parseInt(savedMaxScore, 10));
      }

      const initialScores = teamLeaders.map(leader => {
        // 기존 제출물에서 점수 정보 가져오기
        const existingSubmission = assignment.submissions?.find(sub => sub.teamId === leader.teamId);
        return {
          teamId: leader.teamId,
          teamName: leader.teamName,
          leaderName: leader.leaderName,
          score: existingSubmission?.score || 0,
          feedback: existingSubmission?.feedback || ''
        };
      });
      setTeamScores(initialScores);
    }
  }, [teamLeaders, assignment.submissions, isOpen, assignment.id]);

  // maxScore 변경 시 localStorage에 저장
  useEffect(() => {
    if (isOpen && maxScore !== 100) { // 기본값이 아닐 때만 저장
      localStorage.setItem(`bulk-eval-maxscore-${assignment.id}`, maxScore.toString());
    }
  }, [maxScore, isOpen, assignment.id]);

  const handleScoreChange = (teamId: string, score: number) => {
    setTeamScores(prev => {
      const updated = prev.map(team => {
        if (team.teamId === teamId) {
          const newScore = Math.min(Math.max(score, 0), maxScore);
          return { ...team, score: newScore };
        }
        return team;
      });
      return updated;
    });
  };

  const handleFeedbackChange = (teamId: string, feedback: string) => {
    setTeamScores(prev => prev.map(team => 
      team.teamId === teamId ? { ...team, feedback } : team
    ));
  };

  const handleSubmit = async () => {
    if (!user) {
      setError('User not authenticated');
      return;
    }

    // 입력한 팀들만 필터링 (점수가 0보다 크거나 피드백이 있는 팀)
    const teamsToEvaluate = teamScores.filter(teamScore => 
      teamScore.score > 0 || (teamScore.feedback && teamScore.feedback.trim() !== '')
    );

    if (teamsToEvaluate.length === 0) {
      setError('Please enter scores or feedback for at least one team');
      return;
    }

    setEvaluating(true);
    setError(null);

    try {
      console.log('Starting evaluation for teams:', teamsToEvaluate);
      
      const evaluationPromises = teamsToEvaluate.map(async (teamScore) => {
        console.log(`Evaluating team ${teamScore.teamName} (${teamScore.teamId}):`, {
          assignmentId: assignment.id,
          teamId: teamScore.teamId,
          score: teamScore.score,
          feedback: teamScore.feedback,
          evaluatorEmail: user.email
        });
        
        try {
          // 입력한 팀들만 평가
          const result = await evaluateAssignmentSubmission(
            assignment.id,
            teamScore.teamId,
            teamScore.score,
            teamScore.feedback,
            user.email
          );
          
          console.log(`Evaluation result for team ${teamScore.teamName}:`, result);
          
          return { 
            teamId: teamScore.teamId, 
            teamName: teamScore.teamName,
            success: result.success,
            error: result.error 
          };
        } catch (error) {
          console.error(`Error evaluating team ${teamScore.teamName}:`, error);
          return { 
            teamId: teamScore.teamId, 
            teamName: teamScore.teamName,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });

      const results = await Promise.all(evaluationPromises);
      console.log('All evaluation results:', results);
      
      const failedEvaluations = results.filter(result => !result.success);
      
      if (failedEvaluations.length > 0) {
        console.error('Failed evaluations:', failedEvaluations);
        const errorDetails = failedEvaluations.map(f => `${f.teamName}: ${f.error}`).join(', ');
        setError(`Failed to evaluate ${failedEvaluations.length} teams: ${errorDetails}`);
      } else {
        setSuccess(true);
        await onEvaluationSuccess();
        
        // 성공 메시지 표시 후 모달 유지 (닫지 않음)
        setTimeout(() => {
          setSuccess(false);
        }, 2000);
      }
    } catch (error) {
      console.error('Bulk evaluation error:', error);
      setError(`An unexpected error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setEvaluating(false);
    }
  };

  const handleClose = () => {
    if (!evaluating) {
      // 모달이 완전히 닫힐 때 localStorage 정리 (선택사항)
      // localStorage.removeItem(`bulk-eval-maxscore-${assignment.id}`);
      onClose();
      setError(null);
      setSuccess(false);
    }
  };

  const getScoreColor = (score: number) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 90) return 'text-green-600';
    if (percentage >= 80) return 'text-blue-600';
    if (percentage >= 70) return 'text-yellow-600';
    if (percentage >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  const getScoreGrade = (score: number) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 90) return 'A';
    if (percentage >= 80) return 'B';
    if (percentage >= 70) return 'C';
    if (percentage >= 60) return 'D';
    return 'F';
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        size="3xl"
        title={`Bulk Evaluation - ${assignment.title}`}
      >
        <div className="max-h-[80vh] overflow-y-auto space-y-6 pr-2">
          {/* Assignment Info */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Assignment Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">Title:</span>
                <span className="ml-2 text-gray-900 dark:text-white">{assignment.title}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">Created:</span>
                <span className="ml-2 text-gray-900 dark:text-white">
                  {new Date(assignment.createdAt).toLocaleString()}
                </span>
              </div>
              {assignment.endDate && (
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Deadline:</span>
                  <span className="ml-2 text-gray-900 dark:text-white">
                    {new Date(assignment.endDate).toLocaleString()}
                  </span>
                </div>
              )}
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">Teams:</span>
                <span className="ml-2 text-gray-900 dark:text-white">{teamLeaders.length}</span>
              </div>
            </div>
          </div>

          {/* Max Score Setting */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-3">
              Evaluation Settings
            </h4>
            <div className="flex items-center space-x-4">
              <label htmlFor="maxScore" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Maximum Score:
              </label>
              <input
                type="number"
                id="maxScore"
                min="1"
                max="1000"
                value={maxScore}
                onChange={(e) => setMaxScore(Number(e.target.value))}
                className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">points</span>
            </div>
          </div>

          {/* Team Scores */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900 dark:text-white">
              Team Evaluations ({teamScores.filter(ts => ts.score > 0).length}/{teamScores.length} evaluated)
            </h4>
            
            <div className="max-h-80 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {teamScores.map((teamScore) => {
                const submission = assignment.submissions?.find(sub => sub.teamId === teamScore.teamId);
                const hasSubmission = !!submission;
                
                return (
                  <div key={teamScore.teamId} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    {/* 팀 정보 헤더 */}
                    <div className="mb-4 pb-3 border-b border-gray-200 dark:border-gray-600">
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="text-lg font-semibold text-gray-900 dark:text-white">{teamScore.teamName}</h5>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{teamScore.leaderName}</p>
                        </div>
                        <div className="text-right">
                          {hasSubmission ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                              Submitted
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400">
                              No Submission
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Score Input - 모든 팀에 대해 표시 */}
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Score (0-{maxScore})
                      </label>
                      <div className="flex items-center space-x-3">
                        <input
                          key={`score-${teamScore.teamId}`}
                          type="number"
                          min="0"
                          max={maxScore}
                          value={teamScore.score}
                          onChange={(e) => handleScoreChange(teamScore.teamId, Number(e.target.value))}
                          className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                          placeholder="0"
                        />
                        <span className="text-sm text-gray-600 dark:text-gray-400">/ {maxScore}</span>
                        {teamScore.score > 0 && (
                          <span className={`text-sm font-medium ${getScoreColor(teamScore.score)}`}>
                            ({getScoreGrade(teamScore.score)})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Feedback Input - 모든 팀에 대해 표시 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Feedback <span className="text-gray-500 dark:text-gray-400">(Optional)</span>
                      </label>
                      <textarea
                        key={`feedback-${teamScore.teamId}`}
                        rows={2}
                        value={teamScore.feedback}
                        onChange={(e) => handleFeedbackChange(teamScore.teamId, e.target.value)}
                        placeholder={hasSubmission ? "Provide feedback for this team..." : "Provide feedback (no submission)"}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-3">
              <p className="text-sm text-green-600 dark:text-green-400">
                ✅ Evaluations saved successfully! You can continue evaluating other teams.
              </p>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              disabled={evaluating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              onClick={handleSubmit}
              disabled={evaluating}
              className="min-w-[120px]"
            >
              {evaluating ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </div>
              ) : (
                'Save All Evaluations'
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default BulkAssignmentEvaluationModal;
