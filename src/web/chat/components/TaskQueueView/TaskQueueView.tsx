import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Square, Plus, Edit, Trash2, X } from 'lucide-react';
import { Button } from '@/web/chat/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/web/chat/components/ui/tooltip';
import { TaskQueueHeader } from './TaskQueueHeader';
import { TaskQueueTaskList } from './TaskQueueTaskList';
import { TaskEditor } from './TaskEditor';
import { MessageList } from '../MessageList/MessageList';
import { ConversationHeader } from '../ConversationHeader/ConversationHeader';
import { api } from '../../services/api';
import { useConversationMessages } from '../../hooks';
import type { TaskQueue, Task } from '../../types';

export function TaskQueueView() {
  const { queueId } = useParams<{ queueId: string }>();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<TaskQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [showTaskEditor, setShowTaskEditor] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Use conversation messages hook for selected task
  const {
    messages,
    toolResults,
    currentPermissionRequest,
    childrenMessages,
    expandedTasks,
    clearMessages,
    addMessage,
    setAllMessages,
    handleStreamMessage,
    toggleTaskExpanded,
    clearPermissionRequest,
    setPermissionRequest,
  } = useConversationMessages({
    onResult: () => {},
    onError: (err) => {
      console.error('Error in task conversation:', err);
    },
    onClosed: () => {}
  });

  const loadQueue = async () => {
    if (!queueId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const queueData = await api.getTaskQueue(queueId);
      setQueue(queueData);
    } catch (err) {
      console.error('Failed to load task queue:', err);
      setError(err instanceof Error ? err.message : 'Failed to load task queue');
    } finally {
      setLoading(false);
    }
  };

  // Load queue on component mount and when queueId changes
  useEffect(() => {
    loadQueue();
  }, [queueId]);

  const handleBack = () => {
    navigate('/?tab=queues');
  };

  const handleExecuteQueue = async () => {
    if (!queue) return;
    
    try {
      setExecuting(true);
      await api.executeTaskQueue(queue.id);
      
      // Refresh queue data to show updated status
      await loadQueue();
      
      // TODO: Set up real-time updates via SSE
      // For now, we'll poll for updates
      const pollInterval = setInterval(async () => {
        try {
          const updatedQueue = await api.getTaskQueue(queue.id);
          setQueue(updatedQueue);
          
          // Stop polling if queue is no longer running
          if (updatedQueue.status !== 'running') {
            clearInterval(pollInterval);
            setExecuting(false);
          }
        } catch (error) {
          console.error('Failed to poll queue status:', error);
          clearInterval(pollInterval);
          setExecuting(false);
        }
      }, 2000);
      
      // Clean up interval after 30 minutes to prevent memory leaks
      setTimeout(() => {
        clearInterval(pollInterval);
        setExecuting(false);
      }, 30 * 60 * 1000);
      
    } catch (err) {
      console.error('Failed to execute queue:', err);
      setExecuting(false);
      alert(`Failed to execute queue: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleCancelQueue = async () => {
    if (!queue || queue.status !== 'running') return;
    
    try {
      await api.cancelTaskQueue(queue.id);
      await loadQueue();
    } catch (err) {
      console.error('Failed to cancel queue:', err);
      alert(`Failed to cancel queue: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleCreateTask = async (title: string, content: string, type: 'new' | 'fork') => {
    if (!queue) return;
    
    try {
      await api.createTask(queue.id, { title, content, type });
      await loadQueue();
      setShowTaskEditor(false);
    } catch (err) {
      console.error('Failed to create task:', err);
      throw err; // Re-throw so TaskEditor can handle the error
    }
  };

  const handleUpdateTask = async (taskId: string, title: string, content: string, type: 'new' | 'fork') => {
    if (!queue) return;
    
    try {
      await api.updateTask(queue.id, taskId, { title, content, type });
      await loadQueue();
      setEditingTaskId(null);
    } catch (err) {
      console.error('Failed to update task:', err);
      throw err; // Re-throw so TaskEditor can handle the error
    }
  };

  const handleTaskClick = async (task: Task) => {
    if (!task.sessionId) return;
    
    setSelectedTask(task);
    
    // Load the conversation messages for this task
    try {
      const conversation = await api.getConversation(task.sessionId);
      // Clear existing messages and load new ones
      clearMessages();
      setAllMessages(conversation.messages, conversation.toolResults || []);
    } catch (err) {
      console.error('Failed to load task conversation:', err);
    }
  };

  const handleCloseTaskDetails = () => {
    setSelectedTask(null);
    clearMessages();
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!queue) return;
    
    if (!confirm('Are you sure you want to delete this task?')) {
      return;
    }
    
    try {
      await api.deleteTask(queue.id, taskId);
      await loadQueue();
    } catch (err) {
      console.error('Failed to delete task:', err);
      alert(`Failed to delete task: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleReorderTasks = async (taskIds: string[]) => {
    if (!queue) return;
    
    try {
      await api.reorderTasks(queue.id, { taskIds });
      await loadQueue();
    } catch (err) {
      console.error('Failed to reorder tasks:', err);
      alert(`Failed to reorder tasks: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-screen w-full bg-background">
        <div className="flex items-center justify-center flex-1">
          <div className="text-muted-foreground">Loading task queue...</div>
        </div>
      </div>
    );
  }

  if (error || !queue) {
    return (
      <div className="flex flex-col h-screen w-full bg-background">
        <div className="flex items-center p-4 border-b border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="mr-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>
        
        <div className="flex items-center justify-center flex-1">
          <div className="text-red-500">{error || 'Task queue not found'}</div>
        </div>
      </div>
    );
  }

  const canExecute = queue.status === 'draft' || queue.status === 'failed' || queue.status === 'cancelled';
  const canCancel = queue.status === 'running';
  const canEdit = queue.status !== 'running';

  return (
    <div className="flex flex-col h-screen w-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="mr-2 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          
          <TaskQueueHeader queue={queue} onQueueUpdate={loadQueue} />
        </div>
        
        <div className="flex items-center gap-2">
          {canEdit && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTaskEditor(true)}
                    className="cursor-pointer"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Task
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Add a new task to the queue</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {canExecute && queue.tasks.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    onClick={handleExecuteQueue}
                    disabled={executing}
                    className="cursor-pointer"
                  >
                    <Play className="h-4 w-4 mr-1" />
                    {executing ? 'Starting...' : 'Execute Queue'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Start executing tasks sequentially</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {canCancel && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelQueue}
                    className="cursor-pointer"
                  >
                    <Square className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Cancel queue execution</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Task List - Left Side */}
        <div className={`flex flex-col ${selectedTask ? 'w-1/2' : 'w-full'} border-r border-border`}>
          <TaskQueueTaskList
            queue={queue}
            onTaskEdit={setEditingTaskId}
            onTaskDelete={handleDeleteTask}
            onTaskReorder={handleReorderTasks}
            onTaskClick={handleTaskClick}
          />
        </div>

        {/* Task Details - Right Side */}
        {selectedTask && (
          <div className="flex flex-col w-1/2">
            {/* Task Details Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground">Task Details</h3>
                <span className="text-sm text-muted-foreground">
                  {selectedTask.title}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCloseTaskDetails}
                className="cursor-pointer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Task Conversation */}
            {selectedTask.sessionId && (
              <div className="flex-1 overflow-hidden">
                <MessageList
                  messages={messages}
                  toolResults={toolResults}
                  currentPermissionRequest={currentPermissionRequest}
                  childrenMessages={childrenMessages}
                  expandedTasks={expandedTasks}
                  onToggleTaskExpanded={toggleTaskExpanded}
                  sessionId={selectedTask.sessionId}
                  workingDirectory={queue.projectPath}
                  onApprovePermission={() => {}}
                  onRejectPermission={() => {}}
                  onSelectFile={() => {}}
                  isPermissionDecisionLoading={false}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Task Editor for Creating */}
      {showTaskEditor && (
        <TaskEditor
          open={showTaskEditor}
          onOpenChange={setShowTaskEditor}
          onSave={handleCreateTask}
          title="Create Task"
        />
      )}

      {/* Task Editor for Editing */}
      {editingTaskId && (
        <TaskEditor
          open={!!editingTaskId}
          onOpenChange={(open) => !open && setEditingTaskId(null)}
          onSave={(title, content, type) => handleUpdateTask(editingTaskId, title, content, type)}
          title="Edit Task"
          initialTask={queue.tasks.find(t => t.id === editingTaskId)}
        />
      )}
    </div>
  );
}