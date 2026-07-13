import React, { useState, useRef } from 'react';
import { LectureNote } from '../../types';

interface LectureNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string;
    description: string;
    week: number;
    content: string;
    hasAssignment: boolean;
    assignmentData?: {
      title: string;
      description: string;
      deadline?: number;
      maxFileSize: number;
      allowedFileTypes: string[];
    };
  }) => Promise<void>;
  editingNote?: LectureNote | null;
  loading?: boolean;
}

const LectureNoteModal: React.FC<LectureNoteModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingNote,
  loading = false
}) => {
  const [title, setTitle] = useState(editingNote?.title || '');
  const [description, setDescription] = useState(editingNote?.description || '');
  const [week, setWeek] = useState(editingNote?.week || 1);
  const [content, setContent] = useState(editingNote?.content || '');
  const [hasAssignment, setHasAssignment] = useState(editingNote?.hasAssignment || false);
  const [assignmentTitle, setAssignmentTitle] = useState(editingNote?.assignmentTitle || '');
  const [assignmentDescription, setAssignmentDescription] = useState(editingNote?.assignmentDescription || '');
  const [assignmentDeadline, setAssignmentDeadline] = useState(
    editingNote?.assignmentDeadline ? new Date(editingNote.assignmentDeadline).toISOString().slice(0, 16) : ''
  );
  const [maxFileSize, setMaxFileSize] = useState(editingNote?.maxFileSize || 5);
  const [allowedFileTypes, setAllowedFileTypes] = useState<string[]>(editingNote?.allowedFileTypes || ['pdf']);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 유효성 검사
    const newErrors: {[key: string]: string} = {};
    
    if (!title.trim()) {
      newErrors.title = 'Title is required';
    }
    
    if (week < 1 || week > 52) {
      newErrors.week = 'Week must be between 1 and 52';
    }
    
    // Assignment Title은 선택사항으로 변경 (자동 생성됨)
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setErrors({});
    
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        week,
        content: content.trim(),
        hasAssignment,
        assignmentData: hasAssignment ? {
          title: assignmentTitle.trim() || `Week ${week} Assignment`,
          description: assignmentDescription.trim(),
          deadline: assignmentDeadline ? new Date(assignmentDeadline).getTime() : undefined,
          maxFileSize,
          allowedFileTypes
        } : undefined
      });
      
      // 성공 시 폼 초기화
      if (!editingNote) {
        setTitle('');
        setDescription('');
        setWeek(1);
        setContent('');
        setHasAssignment(false);
        setAssignmentTitle('');
        setAssignmentDescription('');
        setAssignmentDeadline('');
        setMaxFileSize(5);
        setAllowedFileTypes(['pdf']);
      }
    } catch (error) {
      console.error('Failed to save lecture note:', error);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setErrors({});
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {editingNote ? 'Edit Lecture Note' : 'Create Lecture Note'}
            </h2>
            <button
              onClick={handleClose}
              disabled={loading}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                  errors.title ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter lecture note title"
                disabled={loading}
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.title}</p>
              )}
            </div>

            {/* Week */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Week *
              </label>
              <input
                type="number"
                min="1"
                max="52"
                value={week}
                onChange={(e) => setWeek(parseInt(e.target.value) || 1)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                  errors.week ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={loading}
              />
              {errors.week && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.week}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="Enter lecture note description (optional)"
                disabled={loading}
              />
            </div>

            {/* Content */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Content
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="Enter lecture note content (optional)"
                disabled={loading}
              />
            </div>

            {/* Assignment Section */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  id="hasAssignment"
                  checked={hasAssignment}
                  onChange={(e) => setHasAssignment(e.target.checked)}
                  disabled={loading}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <label htmlFor="hasAssignment" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Include Assignment
                </label>
              </div>

              {hasAssignment && (
                <div className="space-y-4 pl-6 border-l-2 border-blue-200 dark:border-blue-800">
                  {/* Assignment Title */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Assignment Title
                    </label>
                    <input
                      type="text"
                      value={assignmentTitle}
                      onChange={(e) => setAssignmentTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder={`Week ${week} Assignment (optional - will auto-generate if empty)`}
                      disabled={loading}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Leave empty to auto-generate "Week {week} Assignment"
                    </p>
                  </div>

                  {/* Assignment Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Assignment Description (Optional)
                    </label>
                    <textarea
                      value={assignmentDescription}
                      onChange={(e) => setAssignmentDescription(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder="Brief description of what students need to submit (optional)"
                      disabled={loading}
                    />
                  </div>

                  {/* Assignment Deadline */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Deadline (Optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={assignmentDeadline}
                      onChange={(e) => setAssignmentDeadline(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      disabled={loading}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Leave empty for no deadline
                    </p>
                  </div>

                  {/* File Settings */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Max File Size (MB)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={maxFileSize}
                        onChange={(e) => setMaxFileSize(parseInt(e.target.value) || 5)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        disabled={loading}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Allowed File Types
                      </label>
                      <select
                        multiple
                        value={allowedFileTypes}
                        onChange={(e) => {
                          const selected = Array.from(e.target.selectedOptions, option => option.value);
                          setAllowedFileTypes(selected);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        disabled={loading}
                      >
                        <option value="pdf">PDF</option>
                        <option value="doc">DOC</option>
                        <option value="docx">DOCX</option>
                        <option value="txt">TXT</option>
                        <option value="jpg">JPG</option>
                        <option value="png">PNG</option>
                        <option value="gif">GIF</option>
                        <option value="ppt">PPT</option>
                        <option value="pptx">PPTX</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {loading && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                {editingNote ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LectureNoteModal;
