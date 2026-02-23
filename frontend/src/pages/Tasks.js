import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DndContext,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Plus,
  Search,
  Trash2,
  Edit2,
  Clock,
  Calendar,
  User,
  Flag,
  MessageSquare,
  Paperclip,
  Send,
  Download,
  X,
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PRIORITY_STYLES = {
  Low: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800' },
  Medium: { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-800' },
  High: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-800' },
};

const STATUS_COLORS = {
  Pending: { bg: 'bg-gray-50', border: 'border-gray-200', header: 'bg-gray-100', dark: 'text-gray-800' },
  'In Progress': { bg: 'bg-blue-50', border: 'border-blue-200', header: 'bg-blue-100', dark: 'text-blue-800' },
  Completed: { bg: 'bg-green-50', border: 'border-green-200', header: 'bg-green-100', dark: 'text-green-800' },
  Overdue: { bg: 'bg-red-50', border: 'border-red-200', header: 'bg-red-100', dark: 'text-red-800' },
};

// Task Card Component
const TaskCard = ({ task, onClick }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const [isHovering, setIsHovering] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isOverdue = task.due_date < new Date().toISOString().split('T')[0] && task.status !== 'Completed';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${PRIORITY_STYLES[task.priority].bg} border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all ${isHovering && !isDragging ? 'scale-105' : ''}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="h-1 cursor-grab active:cursor-grabbing hover:bg-opacity-100 transition-colors"
        style={{
          background: isDragging ? 'rgba(59, 130, 246, 0.5)' : isHovering ? 'rgba(59, 130, 246, 0.3)' : 'rgba(200, 200, 200, 0.2)',
        }}
      />

      {/* Clickable Content */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="p-3 cursor-pointer"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">{task.task_id}</p>
            <h4 className="text-sm font-semibold text-gray-800 line-clamp-2">{task.title}</h4>
          </div>
          <span className={`${PRIORITY_STYLES[task.priority].badge} text-xs font-semibold px-2 py-1 rounded flex-shrink-0`}>
            {task.priority[0]}
          </span>
        </div>

        {task.priority === 'High' && <Flag className="h-3 w-3 text-red-500 fill-red-500 mb-2" />}

        <div className="space-y-1 text-xs text-gray-600">
          {task.assigned_to_name && (
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span className="truncate">{task.assigned_to_name}</span>
            </div>
          )}
          <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-semibold' : ''}`}>
            <Calendar className="h-3 w-3" />
            <span>{task.due_date}</span>
          </div>
          {task.completion_percentage > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">Progress</span>
                <span className="text-xs font-semibold">{task.completion_percentage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div 
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${task.completion_percentage}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Kanban Column
const KanbanColumn = ({ status, tasks, onCardClick }) => {
  const { setNodeRef } = useSortable({ id: status });
  const color = STATUS_COLORS[status];

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col flex-1 min-h-[600px] ${color.bg} border ${color.border} rounded-lg p-4`}
    >
      <div className={`${color.header} rounded p-2 mb-4 sticky top-0 z-10`}>
        <h2 className={`${color.dark} font-bold text-sm flex items-center justify-between`}>
          <span>{status}</span>
          <span className="bg-white px-2 py-1 rounded text-xs font-semibold">{tasks.length}</span>
        </h2>
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3 flex-1 overflow-y-auto">
          {tasks.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">No tasks</div>
          ) : (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onClick={() => onCardClick(task)}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
};

// Task Details Modal Component
const TaskDetailsModal = ({ task, isOpen, onClose, onUpdate, user }) => {
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    priority: task?.priority || 'Medium',
    status: task?.status || 'Pending',
    due_date: task?.due_date || '',
    assigned_to_employee_id: task?.assigned_to_employee_id || '',
    completion_percentage: task?.completion_percentage || 0,
  });
  const [comments, setComments] = useState([]);
  const [timeLogs, setTimeLogs] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [newTimeLog, setNewTimeLog] = useState({ time_spent_minutes: '', description: '', log_date: new Date().toISOString().split('T')[0] });
  const [loadingComments, setLoadingComments] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [loadingAttachments, setLoadingAttachments] = useState(false);

  useEffect(() => {
    if (isOpen && task) {
      fetchComments();
      fetchTimeLogs();
      fetchAttachments();
    }
  }, [isOpen, task]);

  const fetchComments = async () => {
    if (!task) return;
    setLoadingComments(true);
    try {
      const response = await axios.get(`${API}/tasks/${task.id}/comments`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setComments(response.data);
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoadingComments(false);
    }
  };

  const fetchTimeLogs = async () => {
    if (!task) return;
    setLoadingLogs(true);
    try {
      const response = await axios.get(`${API}/tasks/${task.id}/time-logs`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setTimeLogs(response.data);
    } catch (error) {
      console.error('Error fetching time logs:', error);
    } finally {
      setLoadingLogs(false);
    }
  };

  const fetchAttachments = async () => {
    if (!task) return;
    setLoadingAttachments(true);
    try {
      const response = await axios.get(`${API}/tasks/${task.id}/attachments`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setAttachments(response.data);
    } catch (error) {
      console.error('Error fetching attachments:', error);
    } finally {
      setLoadingAttachments(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !task) return;

    try {
      await axios.post(
        `${API}/tasks/${task.id}/comments`,
        { content: newComment },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }
      );
      toast.success('Comment added');
      setNewComment('');
      await fetchComments();
    } catch (error) {
      toast.error('Failed to add comment');
    }
  };

  const handleAddTimeLog = async () => {
    if (!newTimeLog.time_spent_minutes || !task) return;

    try {
      await axios.post(
        `${API}/tasks/${task.id}/time-logs`,
        newTimeLog,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }
      );
      toast.success('Time logged');
      setNewTimeLog({ time_spent_minutes: '', description: '', log_date: new Date().toISOString().split('T')[0] });
      await fetchTimeLogs();
    } catch (error) {
      toast.error('Failed to log time');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !task) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post(
        `${API}/tasks/${task.id}/attachments`,
        formData,
        {
          headers: { 
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      toast.success('File uploaded');
      await fetchAttachments();
    } catch (error) {
      toast.error('Failed to upload file');
    }
  };

  const handleSaveEdit = async () => {
    if (!task) return;

    try {
      await axios.put(
        `${API}/tasks/${task.id}`,
        editForm,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }
      );
      toast.success('Task updated');
      setEditMode(false);
      onUpdate();
    } catch (error) {
      toast.error('Failed to update task');
    }
  };

  if (!task || !isOpen) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:w-[600px] bg-white border-l border-gray-200 overflow-y-auto" side="right">
        <SheetHeader className="sticky top-0 z-20 bg-white pb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <SheetTitle className="text-2xl font-bold">{task.task_id}</SheetTitle>
              <p className="text-sm text-gray-600 mt-1">{task.title}</p>
            </div>
            {editMode && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>
                  Cancel
                </Button>
                <Button size="sm" className="bg-blue-600 text-white" onClick={handleSaveEdit}>
                  Save
                </Button>
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-8">
          {/* Details Section */}
          <div>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900">
              <span>Task Details</span>
            </h3>
            
            {!editMode && (
              <Button
                size="sm"
                onClick={() => setEditMode(true)}
                className="mb-4 bg-blue-600 text-white hover:bg-blue-700"
              >
                <Edit2 className="h-4 w-4 mr-2" />
                Edit Task
              </Button>
            )}

            {editMode ? (
              <div className="space-y-4 border border-gray-300 rounded-lg p-4 bg-gray-50">
                  <div>
                    <Label className="text-sm font-medium text-gray-900">Title</Label>
                    <Input
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      className="mt-1 text-gray-900"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-900">Description</Label>
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      rows={4}
                      className="w-full mt-1 border border-gray-300 rounded-lg p-2 text-sm text-gray-900"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-900">Priority</Label>
                      <select
                        value={editForm.priority}
                        onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                        className="w-full mt-1 border border-gray-300 rounded-lg p-2 text-sm text-gray-900 bg-white"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-900">Status</Label>
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                        className="w-full mt-1 border border-gray-300 rounded-lg p-2 text-sm text-gray-900 bg-white"
                      >
                        <option value="Pending">Pending</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                        <option value="Overdue">Overdue</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-900">Due Date</Label>
                    <Input
                      type="date"
                      value={editForm.due_date}
                      onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                      className="mt-1 text-gray-900"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-900">Completion Percentage</Label>
                    <div className="flex items-center gap-3 mt-1">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={editForm.completion_percentage}
                        onChange={(e) => setEditForm({ ...editForm, completion_percentage: parseInt(e.target.value) })}
                        className="flex-1 h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <span className="text-sm font-semibold text-gray-900 min-w-[50px]">{editForm.completion_percentage}%</span>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" className="bg-blue-600 text-white" onClick={handleSaveEdit}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 font-medium uppercase">Status</p>
                    <p className="text-sm font-semibold mt-1 text-gray-900">{task.status || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium uppercase">Priority</p>
                    <p className="text-sm font-semibold mt-1 text-gray-900">{task.priority || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium uppercase">Due Date</p>
                    <p className="text-sm font-semibold mt-1 text-gray-900">{task.due_date || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium uppercase">Completion</p>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={task.completion_percentage || 0}
                        onChange={async (e) => {
                          const newValue = parseInt(e.target.value);
                          try {
                            const response = await axios.put(
                              `${API}/tasks/${task.id}`,
                              { completion_percentage: newValue },
                              { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
                            );
                            if (response.status === 200) {
                              toast.success('Completion updated');
                              onUpdate();
                            }
                          } catch (error) {
                            console.error('Completion update error:', error.response?.data);
                            toast.error(error.response?.data?.detail || 'Failed to update');
                          }
                        }}
                        className="flex-1 h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <span className="text-sm font-bold text-gray-900 min-w-[45px]">{task.completion_percentage || 0}%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium uppercase">Assigned To</p>
                    <p className="text-sm font-semibold mt-1 text-gray-900">{task.assigned_to_name || 'Unassigned'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium uppercase">Created By</p>
                    <p className="text-sm font-semibold mt-1 text-gray-900">{task.created_by_name || 'Unknown'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500 font-medium uppercase">Created At</p>
                    <p className="text-sm font-semibold mt-1 text-gray-900">{task.created_at ? new Date(task.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not available'}</p>
                  </div>
                </div>
              )}

              {task.description && !editMode && (
                <div className="bg-gray-50 p-4 rounded-lg mt-4">
                  <p className="text-xs text-gray-600 font-medium uppercase mb-2">Description</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
                </div>
              )}
          </div>

          {/* Comments Section */}
          <div className="border-t pt-8">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900">
              <MessageSquare className="h-5 w-5" />
              <span>Comments</span>
            </h3>
            
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="text-gray-900"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
                />
                <Button size="sm" onClick={handleAddComment} className="bg-blue-600 text-white">
                  <Send className="h-4 w-4" />
                </Button>
              </div>

              {loadingComments ? (
                <div className="text-center py-4 text-gray-400">Loading comments...</div>
              ) : comments.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">No comments yet</div>
              ) : (
                <div className="space-y-3">
                  {comments.map((comment) => (
                    <div key={comment.id} className="bg-gray-50 p-3 rounded-lg">
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-sm font-semibold text-gray-900">{comment.author_name}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(comment.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <p className="text-sm text-gray-700">{comment.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Time Logs Section */}
          <div className="border-t pt-8">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900">
              <Clock className="h-5 w-5" />
              <span>Time Logs</span>
            </h3>

            <div className="space-y-4">
              <div className="border border-gray-300 rounded-lg p-4 space-y-3 bg-gray-50">
                <h4 className="font-semibold text-sm text-gray-900">Log Time</h4>
                <div>
                  <Label className="text-xs text-gray-900 font-medium">Date</Label>
                  <Input
                    type="date"
                    value={newTimeLog.log_date}
                    onChange={(e) => setNewTimeLog({ ...newTimeLog, log_date: e.target.value })}
                    className="mt-1 text-sm text-gray-900"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-900 font-medium">Time Spent (minutes)</Label>
                  <Input
                    type="number"
                    value={newTimeLog.time_spent_minutes}
                    onChange={(e) => setNewTimeLog({ ...newTimeLog, time_spent_minutes: e.target.value })}
                    placeholder="e.g., 60"
                    className="mt-1 text-sm text-gray-900"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-900 font-medium">Description</Label>
                  <Input
                    value={newTimeLog.description}
                    onChange={(e) => setNewTimeLog({ ...newTimeLog, description: e.target.value })}
                    placeholder="What did you work on?"
                    className="mt-1 text-sm text-gray-900"
                  />
                </div>
                <Button onClick={handleAddTimeLog} className="w-full bg-blue-600 text-white text-sm">
                  Log Time
                </Button>
              </div>

              {loadingLogs ? (
                <div className="text-center py-4 text-gray-400">Loading time logs...</div>
              ) : timeLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">No time logs yet</div>
              ) : (
                <div className="space-y-3">
                  {timeLogs.map((log) => (
                    <div key={log.id} className="bg-gray-50 p-3 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{log.logged_by_name}</p>
                          <p className="text-xs text-gray-500 mt-1">{log.log_date}</p>
                          <p className="text-sm text-gray-700 mt-2">{log.time_spent_minutes} minutes</p>
                          {log.description && (
                            <p className="text-xs text-gray-600 mt-1">{log.description}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Attachments Section */}
          <div className="border-t pt-8">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900">
              <Paperclip className="h-5 w-5" />
              <span>Attachments</span>
            </h3>

            <div className="space-y-4">
              <label className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:bg-gray-50 transition">
                <Paperclip className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">Click to upload or drag files</p>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              {loadingAttachments ? (
                <div className="text-center py-4 text-gray-400">Loading attachments...</div>
              ) : attachments.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">No attachments yet</div>
              ) : (
                <div className="space-y-2">
                  {attachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{attachment.file_name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {attachment.uploaded_by_name} • {new Date(attachment.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <a
                        href={attachment.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-blue-600 hover:text-blue-800"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

// Main Tasks Component
export const Tasks = () => {
  const { user } = useAuth();
  const [boardData, setBoardData] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState('');
  const [viewMode, setViewMode] = useState('board'); // 'board' or 'dashboard'
  const [dashboardStats, setDashboardStats] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'Medium',
    assigned_to_employee_id: '',
    due_date: '',
    estimated_time_minutes: '',
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      distance: 50,
      delay: 100,
    }),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    fetchEmployees();
    if (viewMode === 'dashboard') {
      fetchDashboardData();
    } else {
      fetchBoardData();
    }
  }, [viewMode, selectedEmployeeFilter]);

  const fetchBoardData = async () => {
    try {
      const params = {};
      if (searchTerm) params.search = searchTerm;
      if (selectedEmployeeFilter && (user?.role === 'Admin' || user?.role === 'Manager')) {
        params.employee_id = selectedEmployeeFilter;
      }
      const response = await axios.get(`${API}/tasks/board`, {
        params,
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setBoardData(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching board:', error);
      toast.error('Failed to load board');
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const response = await axios.get(`${API}/employees`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setEmployees(response.data);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedEmployeeFilter && (user?.role === 'Admin' || user?.role === 'Manager')) {
        params.employee_id = selectedEmployeeFilter;
      }
      const response = await axios.get(`${API}/tasks/dashboard`, {
        params,
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setDashboardStats(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
      toast.error('Failed to load dashboard');
      setLoading(false);
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    let task = null;
    let oldStatus = null;

    for (const column of boardData?.columns || []) {
      const foundTask = column.tasks.find((t) => t.id === active.id);
      if (foundTask) {
        task = foundTask;
        oldStatus = column.status;
        break;
      }
    }

    if (!task) return;

    let newStatus = oldStatus;
    for (const column of boardData?.columns || []) {
      if (column.status === over.id) {
        newStatus = column.status;
        break;
      }
      if (column.tasks.some((t) => t.id === over.id)) {
        newStatus = column.status;
        break;
      }
    }

    if (newStatus === oldStatus) return;

    try {
      await axios.put(
        `${API}/tasks/${task.id}/status`,
        { status: newStatus },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }
      );
      toast.success(`Task moved to ${newStatus}`);
      await fetchBoardData();
    } catch (error) {
      console.error('Error updating task status:', error);
      toast.error('Failed to move task');
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();

    if (!formData.title || !formData.assigned_to_employee_id || !formData.due_date) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      await axios.post(`${API}/tasks`, formData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      toast.success('Task created successfully');
      setCreateDialogOpen(false);
      resetForm();
      await fetchBoardData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create task');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      priority: 'Medium',
      assigned_to_employee_id: '',
      due_date: '',
      estimated_time_minutes: '',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
          <p className="text-gray-600">Loading Kanban board...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-6 sticky top-0 z-20">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Task Board</h1>
              <p className="text-gray-600 text-sm mt-1">
                {boardData?.total_tasks || dashboardStats?.total_tasks || 0} total • {boardData?.user_tasks || 0} assigned to you
              </p>
            </div>

            <div className="flex gap-2 flex-wrap">
              {(user?.role === 'Admin' || user?.role === 'Manager') && (
                <select
                  value={selectedEmployeeFilter}
                  onChange={(e) => setSelectedEmployeeFilter(e.target.value)}
                  className="h-10 border border-gray-300 rounded-lg px-3 text-sm"
                >
                  <option value="">All Employees</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.employee_id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              )}

              <div className="relative flex-1 md:flex-0 md:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search tasks..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-10"
                  onKeyUp={() => setTimeout(() => fetchBoardData(), 300)}
                />
              </div>

              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-blue-600 text-white hover:bg-blue-700 h-10">
                    <Plus className="h-4 w-4 mr-2" />
                    New Task
                  </Button>
                </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create New Task</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateTask} className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">Task Title *</Label>
                    <Input
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g., Implement user authentication"
                      required
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium">Description</Label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Task details..."
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-sm font-medium">Priority *</Label>
                      <select
                        value={formData.priority}
                        onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </div>

                    <div>
                      <Label className="text-sm font-medium">Due Date *</Label>
                      <Input
                        type="date"
                        value={formData.due_date}
                        onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                        required
                      />
                    </div>

                    <div>
                      <Label className="text-sm font-medium">Est. Time (min)</Label>
                      <Input
                        type="number"
                        value={formData.estimated_time_minutes}
                        onChange={(e) => setFormData({ ...formData, estimated_time_minutes: e.target.value })}
                        placeholder="e.g., 60"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium">Assign To *</Label>
                    <select
                      value={formData.assigned_to_employee_id}
                      onChange={(e) => setFormData({ ...formData, assigned_to_employee_id: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                      required
                    >
                      <option value="">Select employee</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.employee_id}>
                          {emp.name} ({emp.employee_id})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-2 justify-end pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-blue-600 text-white hover:bg-blue-700">
                      Create Task
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            </div>
          </div>

          {/* View Mode Tabs */}
          {(user?.role === 'Admin' || user?.role === 'Manager') && (
            <div className="flex gap-2 border-b border-gray-200">
              <button
                onClick={() => setViewMode('board')}
                className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors ${
                  viewMode === 'board'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Board
              </button>
              <button
                onClick={() => setViewMode('dashboard')}
                className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors ${
                  viewMode === 'dashboard'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Dashboard
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Dashboard View */}
      {viewMode === 'dashboard' && dashboardStats && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-xs text-gray-600 font-medium uppercase">Total Tasks</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{dashboardStats.total_tasks}</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-xs text-gray-600 font-medium uppercase">Pending</p>
                <p className="text-3xl font-bold text-orange-600 mt-2">{dashboardStats.pending_count}</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-xs text-gray-600 font-medium uppercase">In Progress</p>
                <p className="text-3xl font-bold text-blue-600 mt-2">{dashboardStats.in_progress_count}</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-xs text-gray-600 font-medium uppercase">Completed</p>
                <p className="text-3xl font-bold text-green-600 mt-2">{dashboardStats.completed_count}</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-xs text-gray-600 font-medium uppercase">Overdue</p>
                <p className="text-3xl font-bold text-red-600 mt-2">{dashboardStats.overdue_count}</p>
              </div>
            </div>

            {/* Employee Details */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Task Details by Employee</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">Employee</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">Total</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">Pending</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">In Progress</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">Completed</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">Overdue</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">Avg Completion %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardStats.employees?.map((emp, idx) => (
                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm font-medium text-gray-900">{emp.name}</td>
                        <td className="py-3 px-4 text-sm text-gray-600">{emp.total_tasks}</td>
                        <td className="py-3 px-4 text-sm text-orange-600 font-medium">{emp.pending}</td>
                        <td className="py-3 px-4 text-sm text-blue-600 font-medium">{emp.in_progress}</td>
                        <td className="py-3 px-4 text-sm text-green-600 font-medium">{emp.completed}</td>
                        <td className="py-3 px-4 text-sm text-red-600 font-medium">{emp.overdue}</td>
                        <td className="py-3 px-4 text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full"
                                style={{ width: `${emp.avg_completion_percentage}%` }}
                              ></div>
                            </div>
                            <span className="font-semibold text-gray-700 min-w-[45px]">{Math.round(emp.avg_completion_percentage)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Task List by Employee (if filtered) */}
            {selectedEmployeeFilter && dashboardStats.tasks && (
              <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">
                  Tasks for {employees.find(e => e.employee_id === selectedEmployeeFilter)?.name}
                </h2>
                <div className="space-y-2">
                  {dashboardStats.tasks.map((task) => (
                    <div 
                      key={task.id} 
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                      onClick={() => {
                        setSelectedTask(task);
                        setDetailsOpen(true);
                      }}
                    >
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{task.title}</p>
                        <p className="text-sm text-gray-600">{task.task_id} • {task.status}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${task.completion_percentage}%` }}
                            ></div>
                          </div>
                          <span className="font-semibold text-gray-700 min-w-[45px]">{task.completion_percentage}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Kanban Board View */}
      {viewMode === 'board' && boardData && (
        <div className="flex-1 overflow-x-auto p-6">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-6 min-w-max lg:min-w-full">
              {boardData.columns.map((column) => (
                <div key={column.status} className="flex-1 min-w-[350px]">
                  <KanbanColumn
                    status={column.status}
                    tasks={column.tasks}
                    onCardClick={(task) => {
                      setSelectedTask(task);
                      setDetailsOpen(true);
                    }}
                  />
                </div>
              ))}
            </div>
          </DndContext>
        </div>
      )}

      {/* Task Details Modal */}
      <TaskDetailsModal
        task={selectedTask}
        isOpen={detailsOpen}
        onClose={() => {
          setDetailsOpen(false);
          setSelectedTask(null);
        }}
        onUpdate={fetchBoardData}
        user={user}
      />
    </div>
  );
};

export default Tasks;
