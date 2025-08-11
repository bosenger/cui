import React, { useState } from 'react';
import { Edit, Check, X, Clock, CheckCircle, AlertCircle, Square } from 'lucide-react';
import { Button } from '@/web/chat/components/ui/button';
import { Input } from '@/web/chat/components/ui/input';
import { Textarea } from '@/web/chat/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/web/chat/components/ui/tooltip';
import { api } from '../../services/api';
import type { TaskQueue } from '../../types';

interface TaskQueueHeaderProps {
  queue: TaskQueue;
  onQueueUpdate: () => void;
}

export function TaskQueueHeader({ queue, onQueueUpdate }: TaskQueueHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [editingName, setEditingName] = useState(queue.name);
  const [editingDescription, setEditingDescription] = useState(queue.description || '');
  const [saving, setSaving] = useState(false);

  const getStatusIcon = () => {
    switch (queue.status) {
      case 'running':
        return <Clock className="h-5 w-5 text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'cancelled':
        return <Square className="h-5 w-5 text-yellow-500" />;
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusColor = () => {
    switch (queue.status) {
      case 'running':
        return 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950';
      case 'completed':
        return 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950';
      case 'failed':
        return 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950';
      case 'cancelled':
        return 'text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950';
      default:
        return 'text-muted-foreground bg-muted/50';
    }
  };

  const getProgressPercentage = () => {
    if (queue.tasks.length === 0) return 0;
    const completedCount = queue.tasks.filter(t => t.status === 'completed').length;
    return Math.round((completedCount / queue.tasks.length) * 100);
  };

  const handleSave = async () => {
    if (!editingName.trim()) {
      return;
    }

    setSaving(true);
    try {
      await api.updateTaskQueue(queue.id, {
        name: editingName.trim(),
        description: editingDescription.trim() || undefined
      });
      
      setEditing(false);
      onQueueUpdate();
    } catch (err) {
      console.error('Failed to update queue:', err);
      alert(`Failed to update queue: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingName(queue.name);
    setEditingDescription(queue.description || '');
    setEditing(false);
  };

  const completedTasks = queue.tasks.filter(t => t.status === 'completed').length;
  const failedTasks = queue.tasks.filter(t => t.status === 'failed').length;

  if (editing) {
    return (
      <div className="flex-1">
        <div className="flex items-start gap-2">
          <div className="flex-1 space-y-2">
            <Input
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              placeholder="Queue name"
              className="text-xl font-semibold"
              disabled={saving}
            />
            <Textarea
              value={editingDescription}
              onChange={(e) => setEditingDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="text-sm"
              disabled={saving}
            />
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSave}
              disabled={saving || !editingName.trim()}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={saving}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1">
      <div className="flex items-start gap-3">
        {getStatusIcon()}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-semibold text-foreground truncate">{queue.name}</h1>
            <span className={`px-2 py-1 text-xs rounded-full font-medium ${getStatusColor()}`}>
              {queue.status}
            </span>
            
            {queue.status !== 'running' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(true)}
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Edit queue details</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {queue.description && (
            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
              {queue.description}
            </p>
          )}

          {/* Progress and Stats */}
          <div className="space-y-2">
            {/* Progress Bar */}
            {queue.tasks.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${getProgressPercentage()}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {completedTasks}/{queue.tasks.length}
                </span>
              </div>
            )}

            {/* Stats */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{queue.projectPath}</span>
              {queue.tasks.length === 0 ? (
                <span>No tasks</span>
              ) : (
                <>
                  <span>{queue.tasks.length} task{queue.tasks.length === 1 ? '' : 's'}</span>
                  {completedTasks > 0 && <span className="text-green-600">{completedTasks} completed</span>}
                  {failedTasks > 0 && <span className="text-red-600">{failedTasks} failed</span>}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}