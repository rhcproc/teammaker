import React from 'react';
import { LectureTeamAssignment } from '../../types';

interface LectureTeamScoreCardProps {
  team: LectureTeamAssignment;
  showDetails?: boolean;
}

const LectureTeamScoreCard: React.FC<LectureTeamScoreCardProps> = ({ team, showDetails = false }) => {
  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-50 dark:bg-green-900/20';
    if (score >= 80) return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20';
    if (score >= 70) return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
    if (score >= 60) return 'text-orange-600 bg-orange-50 dark:bg-orange-900/20';
    return 'text-red-600 bg-red-50 dark:bg-red-900/20';
  };

  const getScoreGrade = (score: number) => {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  };

  if (team.averageScore === undefined || team.totalAssignments === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              {team.teamName}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {team.leaderName}
            </p>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400">No scores yet</div>
            {showDetails && (
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {team.totalAssignments || 0} assignments
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            {team.teamName}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {team.leaderName}
          </p>
        </div>
        <div className="text-center">
          <div className={`inline-flex items-center px-2 py-1 rounded-full text-sm font-semibold ${getScoreColor(team.averageScore)}`}>
            <span className="mr-1">{team.averageScore.toFixed(1)}</span>
            <span className="text-xs opacity-75">({getScoreGrade(team.averageScore)})</span>
          </div>
          {showDetails && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {team.evaluatedAssignments || 0}/{team.totalAssignments || 0} evaluated
            </div>
          )}
        </div>
      </div>
      
      {showDetails && team.evaluatedAssignments && team.evaluatedAssignments > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Progress:</span>
            <span>{Math.round(((team.evaluatedAssignments || 0) / (team.totalAssignments || 1)) * 100)}%</span>
          </div>
          <div className="mt-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
              style={{
                width: `${((team.evaluatedAssignments || 0) / (team.totalAssignments || 1)) * 100}%`
              }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LectureTeamScoreCard;
