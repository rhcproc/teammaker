import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { SimpleLectureNote } from '../../types';

interface SimpleLectureNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    description: string;
    week: number;
    date?: string;
    hasTask: boolean;
    taskData?: {
      title: string;
      description: string;
      deadline?: number | null;
      maxFileSize?: number;
      allowedFileTypes?: string[];
    };
  }) => Promise<void>;
  editingNote?: SimpleLectureNote | null;
  loading?: boolean;
}

const SimpleLectureNoteModal: React.FC<SimpleLectureNoteModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editingNote = null,
  loading = false
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [week, setWeek] = useState(1);
  const [selectedDate, setSelectedDate] = useState('');
  const [showWeekField, setShowWeekField] = useState(false);
  const [useCustomWeek, setUseCustomWeek] = useState(false);
  const [hasTask, setHasTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState('Task Assignment');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [maxFileSize, setMaxFileSize] = useState(5);
  const [allowedFileTypes, setAllowedFileTypes] = useState(['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png']);
  const [assignmentType, setAssignmentType] = useState<'team' | 'individual'>('team');

  // Edit 모드일 때 기존 데이터로 폼 초기화
  useEffect(() => {
    if (editingNote) {
      setTitle(editingNote.title || '');
      setDescription(editingNote.description || '');
      setWeek(editingNote.week || 1);
      setSelectedDate(editingNote.date || '');
      setHasTask(editingNote.hasTask || false);
      setTaskTitle(editingNote.taskTitle || 'Task Assignment');
      setTaskDescription(editingNote.taskDescription || '');
      setTaskDeadline(editingNote.taskDeadline ? new Date(editingNote.taskDeadline).toISOString().slice(0, 16) : '');
      setMaxFileSize(editingNote.maxFileSize || 5);
      setAllowedFileTypes(editingNote.allowedFileTypes || ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png']);
      setAssignmentType(editingNote.assignmentType || 'team');
      setUseCustomWeek(true);
      setShowWeekField(true);
    } else {
      // Create 모드일 때 폼 초기화
      setTitle('');
      setDescription('');
      setWeek(1);
      setSelectedDate('');
      setHasTask(false);
      setTaskTitle('Task Assignment');
      setTaskDescription('');
      setTaskDeadline('');
      setMaxFileSize(5);
      setAllowedFileTypes(['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png']);
      setUseCustomWeek(false);
      setShowWeekField(false);
    }
  }, [editingNote, isOpen]);

  // 날짜로부터 Week 계산 (학기 시작일을 기준으로)
  const calculateWeekFromDate = (dateString: string) => {
    if (!dateString) return 1;
    
    // 학기 시작일 (예: 2025년 3월 3일)
    const semesterStart = new Date('2025-03-03');
    const selectedDate = new Date(dateString);
    
    // 날짜 차이 계산 (밀리초)
    const timeDiff = selectedDate.getTime() - semesterStart.getTime();
    
    // 일 단위로 변환
    const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));
    
    // 주차 계산 (7일 = 1주)
    const calculatedWeek = Math.max(1, Math.floor(daysDiff / 7) + 1);
    
    return calculatedWeek;
  };

  // 날짜를 월/일 형식으로 포맷팅
  const formatDateToMonthDay = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateValue = e.target.value;
    setSelectedDate(dateValue);
    
    // 날짜가 선택되고 커스텀 Week를 사용하지 않는 경우에만 자동으로 Week 계산
    if (dateValue && !useCustomWeek) {
      const calculatedWeek = calculateWeekFromDate(dateValue);
      setWeek(calculatedWeek);
    }
  };

  const handleShowWeekToggle = () => {
    setShowWeekField(!showWeekField);
    if (!showWeekField) {
      // Week 필드를 보여줄 때 커스텀 Week 모드로 전환
      setUseCustomWeek(true);
    } else {
      // Week 필드를 숨길 때 자동 계산 모드로 전환
      setUseCustomWeek(false);
      if (selectedDate) {
        const calculatedWeek = calculateWeekFromDate(selectedDate);
        setWeek(calculatedWeek);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      alert('Please enter a title');
      return;
    }

    if (hasTask && !taskTitle.trim()) {
      alert('Please enter a task title');
      return;
    }

    const data = {
      title: title.trim(),
      description: description.trim(),
      week,
      date: selectedDate || undefined,
      hasTask,
      assignmentType: hasTask ? assignmentType : undefined,
      taskData: hasTask ? {
        title: taskTitle.trim(),
        description: taskDescription.trim(),
        deadline: taskDeadline ? new Date(taskDeadline).getTime() : null,
        maxFileSize,
        allowedFileTypes
      } : undefined
    };

    try {
      await onSubmit(data);
      handleClose();
    } catch (error) {
      console.error('Failed to create lecture note:', error);
    }
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setWeek(1);
    setSelectedDate('');
    setShowWeekField(false);
    setUseCustomWeek(false);
    setHasTask(false);
    setTaskTitle('Task Assignment');
    setTaskDescription('');
    setTaskDeadline('');
    setMaxFileSize(5);
    setAllowedFileTypes(['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png']);
    setAssignmentType('team');
    onClose();
  };

  const handleFileTypeChange = (type: string, checked: boolean) => {
    if (checked) {
      setAllowedFileTypes(prev => [...prev, type]);
    } else {
      setAllowedFileTypes(prev => prev.filter(t => t !== type));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="2xl">
      <div className="p-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          {editingNote ? 'Edit Lecture Note' : 'Create Lecture Note'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Basic Information</h3>
            
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Title *
              </label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="Enter lecture note title"
                required
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="Enter lecture note description"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Date
                </label>
                <button
                  type="button"
                  onClick={handleShowWeekToggle}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                >
                  {showWeekField ? 'Hide Week' : 'Show Week'}
                </button>
              </div>
              <input
                type="date"
                id="date"
                value={selectedDate}
                onChange={handleDateChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {selectedDate 
                  ? `Selected: ${formatDateToMonthDay(selectedDate)}${showWeekField ? ` (Week ${week})` : ''}`
                  : 'Select a date to set the lecture date'
                }
              </p>
            </div>
            
            {showWeekField && (
              <div>
                <label htmlFor="week" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Week
                </label>
                <input
                  type="number"
                  id="week"
                  value={week}
                  onChange={(e) => setWeek(parseInt(e.target.value) || 1)}
                  min="1"
                  max="20"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {useCustomWeek 
                    ? 'You can manually set the week number'
                    : 'Week is automatically calculated from the selected date'
                  }
                </p>
              </div>
            )}
          </div>

          {/* Task Section */}
          <div className="space-y-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="hasTask"
                checked={hasTask}
                onChange={(e) => setHasTask(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="hasTask" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                Include Task Assignment
              </label>
            </div>

            {hasTask && (
              <div className="pl-6 border-l-2 border-blue-200 dark:border-blue-800 space-y-4">
                <h4 className="text-md font-semibold text-gray-900 dark:text-white">Task Details</h4>
                
                <div>
                  <label htmlFor="taskTitle" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Task Title *
                  </label>
                  <input
                    type="text"
                    id="taskTitle"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="Enter task title"
                    required={hasTask}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Submission Type
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="assignmentType"
                        value="team"
                        checked={assignmentType === 'team'}
                        onChange={(e) => setAssignmentType(e.target.value as 'team' | 'individual')}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                        Team Submission (조장이 대표로 제출)
                      </span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="assignmentType"
                        value="individual"
                        checked={assignmentType === 'individual'}
                        onChange={(e) => setAssignmentType(e.target.value as 'team' | 'individual')}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                        Individual Submission (각 조원이 개별 제출)
                      </span>
                    </label>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {assignmentType === 'team' 
                      ? '조장이 팀을 대표하여 과제를 제출합니다.'
                      : '각 조원이 개별적으로 과제를 제출하며, 모든 조원이 제출하면 팀 완료로 표시됩니다.'
                    }
                  </p>
                </div>

                <div>
                  <label htmlFor="taskDescription" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Task Description
                  </label>
                  <textarea
                    id="taskDescription"
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="Enter task description"
                  />
                </div>

                <div>
                  <label htmlFor="taskDeadline" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Deadline (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    id="taskDeadline"
                    value={taskDeadline}
                    onChange={(e) => setTaskDeadline(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>

                <div>
                  <label htmlFor="maxFileSize" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Max File Size (MB)
                  </label>
                  <input
                    type="number"
                    id="maxFileSize"
                    value={maxFileSize}
                    onChange={(e) => setMaxFileSize(parseInt(e.target.value) || 5)}
                    min="1"
                    max="100"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Allowed File Types
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {['pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png', 'gif', 'ppt', 'pptx'].map((type) => (
                      <label key={type} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={allowedFileTypes.includes(type)}
                          onChange={(e) => handleFileTypeChange(type, e.target.checked)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 uppercase">{type}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (editingNote ? 'Updating...' : 'Creating...') : (editingNote ? 'Update Lecture Note' : 'Create Lecture Note')}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default SimpleLectureNoteModal;
