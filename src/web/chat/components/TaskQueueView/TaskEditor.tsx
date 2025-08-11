import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/web/chat/components/ui/dialog';
import { Button } from '@/web/chat/components/ui/button';
import { Input } from '@/web/chat/components/ui/input';
import { Textarea } from '@/web/chat/components/ui/textarea';
import { Label } from '@/web/chat/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/web/chat/components/ui/select';
import type { Task } from '../../types';

interface TaskEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (title: string, content: string, type: 'new' | 'fork') => Promise<void>;
  title: string;
  initialTask?: Task;
}

export function TaskEditor({ open, onOpenChange, onSave, title, initialTask }: TaskEditorProps) {
  const [taskTitle, setTaskTitle] = useState('');
  const [taskContent, setTaskContent] = useState('');
  const [taskType, setTaskType] = useState<'new' | 'fork'>('new');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form when dialog opens or initialTask changes
  useEffect(() => {
    if (open) {
      if (initialTask) {
        setTaskTitle(initialTask.title);
        setTaskContent(initialTask.content);
        setTaskType(initialTask.type);
      } else {
        setTaskTitle('');
        setTaskContent('');
        setTaskType('new');
      }
      setError(null);
    }
  }, [open, initialTask]);

  // Update content when title changes to keep markdown format in sync
  const handleTitleChange = (newTitle: string) => {
    setTaskTitle(newTitle);
    
    if (taskContent) {
      // Replace first line with new title
      const lines = taskContent.split('\n');
      lines[0] = `# ${newTitle}`;
      setTaskContent(lines.join('\n'));
    } else {
      // Create initial markdown content
      setTaskContent(`# ${newTitle}\n\n`);
    }
  };

  // Update title when content changes (extract from first line)
  const handleContentChange = (newContent: string) => {
    setTaskContent(newContent);
    
    const lines = newContent.split('\n');
    const firstLine = lines[0];
    
    // Extract title from markdown header
    if (firstLine.startsWith('# ')) {
      const extractedTitle = firstLine.substring(2).trim();
      if (extractedTitle && extractedTitle !== taskTitle) {
        setTaskTitle(extractedTitle);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!taskTitle.trim()) {
      setError('Task title is required');
      return;
    }

    // Ensure content starts with the title as a markdown header
    let finalContent = taskContent;
    const lines = finalContent.split('\n');
    
    if (!lines[0].startsWith('# ')) {
      finalContent = `# ${taskTitle.trim()}\n\n${finalContent}`;
    } else {
      // Update first line to match current title
      lines[0] = `# ${taskTitle.trim()}`;
      finalContent = lines.join('\n');
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSave(taskTitle.trim(), finalContent, taskType);
      
      // Reset form
      setTaskTitle('');
      setTaskContent('');
      setTaskType('new');
      setError(null);
    } catch (err) {
      console.error('Failed to save task:', err);
      setError(err instanceof Error ? err.message : 'Failed to save task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setTaskTitle('');
      setTaskContent('');
      setTaskType('new');
      setError(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 space-y-4">
          {error && (
            <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950 p-2 rounded">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="task-title">Title *</Label>
              <Input
                id="task-title"
                value={taskTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Enter task title"
                disabled={isSubmitting}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Execution Type</Label>
              <Select value={taskType} onValueChange={(value) => setTaskType(value as 'new' | 'fork')} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">
                    <div className="flex flex-col">
                      <span>New Session</span>
                      <span className="text-xs text-muted-foreground">Start fresh conversation</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="fork">
                    <div className="flex flex-col">
                      <span>Fork Previous</span>
                      <span className="text-xs text-muted-foreground">Continue from previous task</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2 flex-1 flex flex-col">
            <Label htmlFor="task-content">Content (Markdown) *</Label>
            <Textarea
              id="task-content"
              value={taskContent}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder={`# ${taskTitle || 'Task Title'}\n\nDescribe what you want Claude to accomplish...`}
              disabled={isSubmitting}
              className="flex-1 resize-none font-mono text-sm"
              rows={15}
            />
            <div className="text-xs text-muted-foreground">
              Use markdown to format your task. The first line should be a header with the task title.
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !taskTitle.trim()}
          >
            {isSubmitting ? 'Saving...' : 'Save Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}