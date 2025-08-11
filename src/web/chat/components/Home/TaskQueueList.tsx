import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/web/chat/components/ui/button';
import { TaskQueueItem } from './TaskQueueItem';
import { CreateTaskQueueDialog } from './CreateTaskQueueDialog';
import { api } from '../../services/api';
import type { TaskQueueSummary } from '../../types';

interface TaskQueueListProps {
  recentDirectories: Record<string, { lastDate: string; shortname: string }>;
  getMostRecentWorkingDirectory: () => string | undefined;
}

export function TaskQueueList({ recentDirectories, getMostRecentWorkingDirectory }: TaskQueueListProps) {
  const navigate = useNavigate();
  const [queues, setQueues] = useState<TaskQueueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const loadQueues = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.getTaskQueues({
        sortBy: 'updated',
        order: 'desc',
        limit: 50
      });
      
      setQueues(response.queues);
    } catch (err) {
      console.error('Failed to load task queues:', err);
      setError(err instanceof Error ? err.message : 'Failed to load task queues');
    } finally {
      setLoading(false);
    }
  };

  // Load queues on component mount
  useEffect(() => {
    loadQueues();
  }, []);

  const handleCreateQueue = async (name: string, description: string, projectPath: string) => {
    try {
      const queue = await api.createTaskQueue({
        name,
        description: description || undefined,
        projectPath
      });
      
      // Refresh the list
      await loadQueues();
      
      // Navigate to the queue detail view
      navigate(`/queues/${queue.id}`);
      
      setShowCreateDialog(false);
    } catch (err) {
      console.error('Failed to create task queue:', err);
      throw err; // Re-throw so the dialog can handle the error
    }
  };

  const handleQueueClick = (queueId: string) => {
    navigate(`/queues/${queueId}`);
  };

  const handleDeleteQueue = async (queueId: string) => {
    if (!confirm('Are you sure you want to delete this task queue? This action cannot be undone.')) {
      return;
    }

    try {
      await api.deleteTaskQueue(queueId);
      
      // Remove from local state immediately for responsive UI
      setQueues(prev => prev.filter(q => q.id !== queueId));
      
      // Then refresh the list to ensure consistency
      await loadQueues();
    } catch (err) {
      console.error('Failed to delete task queue:', err);
      // Refresh the list in case of error to restore consistent state
      await loadQueues();
    }
  };

  if (loading && queues.length === 0) {
    return (
      <div className="flex flex-col w-full flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-border scrollbar-track-transparent">
        <div className="flex items-center justify-center w-full py-12 px-4 text-muted-foreground text-sm text-center bg-background">
          Loading task queues...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col w-full flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-border scrollbar-track-transparent">
        <div className="flex items-center justify-center w-full py-12 px-4 text-destructive text-sm text-center bg-background">
          {error}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col w-full flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-border scrollbar-track-transparent">
        {/* Create Queue Button */}
        <div className="sticky top-0 z-10 bg-background border-b border-border/30 p-3">
          <Button
            onClick={() => setShowCreateDialog(true)}
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Create Task Queue
          </Button>
        </div>

        {/* Queue List */}
        {queues.length === 0 ? (
          <div className="flex items-center justify-center w-full py-12 px-4 text-muted-foreground text-sm text-center bg-background">
            No task queues yet. Create your first queue to get started.
          </div>
        ) : (
          <div className="flex flex-col">
            {queues.map((queue) => (
              <TaskQueueItem
                key={queue.id}
                queue={queue}
                recentDirectories={recentDirectories}
                onClick={() => handleQueueClick(queue.id)}
                onDelete={() => handleDeleteQueue(queue.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Queue Dialog */}
      <CreateTaskQueueDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreateQueue={handleCreateQueue}
        recentDirectories={recentDirectories}
        getMostRecentWorkingDirectory={getMostRecentWorkingDirectory}
      />
    </>
  );
}