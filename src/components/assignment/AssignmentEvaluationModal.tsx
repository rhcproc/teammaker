import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AssignmentSubmission, LectureAssignmentSubmission } from '../../types';
import { evaluateAssignmentSubmission, evaluateLectureAssignmentSubmission } from '../../services/assignment/evaluationService';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Toast from '../common/Toast';

interface AssignmentEvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  submission: AssignmentSubmission | LectureAssignmentSubmission;
  assignmentId: string;
  assignmentTitle: string;
  isLectureAssignment?: boolean;
  onEvaluationSuccess: () => Promise<void>;
}

const AssignmentEvaluationModal: React.FC<AssignmentEvaluationModalProps> = ({
  isOpen,
  onClose,
  submission,
  assignmentId,
  assignmentTitle,
  isLectureAssignment = false,
  onEvaluationSuccess
}) => {
  const { user } = useAuth();
  const [score, setScore] = useState<number>(submission.score || 0);
  const [feedback, setFeedback] = useState<string>(submission.feedback || '');
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      setError('User not authenticated');
      return;
    }

    if (score < 0 || score > 100) {
      setError('Score must be between 0 and 100');
      return;
    }

    setEvaluating(true);
    setError(null);

    try {
      let result;
      
      if (isLectureAssignment) {
        result = await evaluateLectureAssignmentSubmission(
          assignmentId,
          submission.teamId,
          score,
          feedback,
          user.email
        );
      } else {
        result = await evaluateAssignmentSubmission(
          assignmentId,
          submission.teamId,
          score,
          feedback,
          user.email
        );
      }

      if (result.success) {
        setSuccess(true);
        await onEvaluationSuccess();
        
        // 2초 후 모달 닫기
        setTimeout(() => {
          onClose();
          setSuccess(false);
          setScore(0);
          setFeedback('');
        }, 2000);
      } else {
        setError(result.error || 'Failed to evaluate submission');
      }
    } catch (error) {
      console.error('Evaluation error:', error);
      setError('An unexpected error occurred');
    } finally {
      setEvaluating(false);
    }
  };

  const handleClose = () => {
    if (!evaluating) {
      onClose();
      setScore(submission.score || 0);
      setFeedback(submission.feedback || '');
      setError(null);
      setSuccess(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 80) return 'text-blue-600';
    if (score >= 70) return 'text-yellow-600';
    if (score >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        size="lg"
        title={`Evaluate Submission - ${assignmentTitle}`}
      >
        <div className="space-y-6">
          {/* Submission Info */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Submission Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">Team:</span>
                <span className="ml-2 text-gray-900 dark:text-white">{submission.teamName}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">Leader:</span>
                <span className="ml-2 text-gray-900 dark:text-white">{submission.leaderName}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">Submitted:</span>
                <span className="ml-2 text-gray-900 dark:text-white">{formatDate(submission.submittedAt)}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">File:</span>
                <span className="ml-2 text-gray-900 dark:text-white">{submission.fileName}</span>
              </div>
              {submission.description && (
                <div className="md:col-span-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Description:</span>
                  <p className="mt-1 text-gray-900 dark:text-white">{submission.description}</p>
                </div>
              )}
              {submission.score !== undefined && (
                <div className="md:col-span-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Current Score:</span>
                  <span className={`ml-2 font-semibold ${getScoreColor(submission.score)}`}>
                    {submission.score}/100
                  </span>
                  {submission.evaluatedAt && (
                    <span className="ml-2 text-gray-500 dark:text-gray-400">
                      (Evaluated on {formatDate(submission.evaluatedAt)})
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* File Download */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Download Submission</h4>
            <a
              href={submission.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {submission.fileName}
            </a>
          </div>

          {/* Evaluation Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="score" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Score (0-100)
              </label>
              <div className="flex items-center space-x-4">
                <input
                  type="number"
                  id="score"
                  min="0"
                  max="100"
                  value={score}
                  onChange={(e) => setScore(Number(e.target.value))}
                  className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  required
                />
                <div className="flex-1">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={score}
                    onChange={(e) => setScore(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${score}%, #e5e7eb ${score}%, #e5e7eb 100%)`
                    }}
                  />
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                    <span>0</span>
                    <span>25</span>
                    <span>50</span>
                    <span>75</span>
                    <span>100</span>
                  </div>
                </div>
                <div className={`text-lg font-semibold ${getScoreColor(score)}`}>
                  {score}/100
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="feedback" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Feedback (Optional)
              </label>
              <textarea
                id="feedback"
                rows={4}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Provide feedback for this submission..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {success && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-3">
                <p className="text-sm text-green-600 dark:text-green-400">
                  ✅ Evaluation saved successfully!
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
                disabled={evaluating}
                className="min-w-[100px]"
              >
                {evaluating ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </div>
                ) : (
                  'Save Evaluation'
                )}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

    </>
  );
};

export default AssignmentEvaluationModal;
