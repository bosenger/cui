import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/web/chat/components/ui/dialog';
import { Button } from '@/web/chat/components/ui/button';
import { Input } from '@/web/chat/components/ui/input';
import { Textarea } from '@/web/chat/components/ui/textarea';
import { Label } from '@/web/chat/components/ui/label';
import { DropdownSelector } from '../DropdownSelector';

interface CreateTaskQueueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateQueue: (name: string, description: string, projectPath: string) => Promise<void>;
  recentDirectories: Record<string, { lastDate: string; shortname: string }>;
  getMostRecentWorkingDirectory: () => string | undefined;
}

export function CreateTaskQueueDialog({
  open,
  onOpenChange,
  onCreateQueue,
  recentDirectories,
  getMostRecentWorkingDirectory
}: CreateTaskQueueDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Set initial project path when dialog opens
  useEffect(() => {
    if (open && !projectPath) {
      const recentDir = getMostRecentWorkingDirectory();
      if (recentDir) {
        setProjectPath(recentDir);
      }
    }
  }, [open, projectPath, getMostRecentWorkingDirectory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim() || !projectPath.trim()) {
      setError('Name and project path are required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onCreateQueue(name.trim(), description.trim(), projectPath.trim());
      
      // Reset form
      setName('');
      setDescription('');
      setProjectPath('');
      setError(null);
    } catch (err) {
      console.error('Failed to create task queue:', err);
      setError(err instanceof Error ? err.message : 'Failed to create task queue');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setName('');
      setDescription('');
      setProjectPath('');
      setError(null);
      onOpenChange(false);
    }
  };

  // Convert recent directories to options for dropdown
  const directoryOptions = Object.entries(recentDirectories)
    .sort(([, a], [, b]) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime())
    .map(([path, info]) => ({
      value: path,
      label: info.shortname,
      description: path
    }));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Task Queue</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950 p-2 rounded">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="queue-name">Name *</Label>
            <Input
              id="queue-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter queue name"
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="queue-description">Description</Label>
            <Textarea
              id="queue-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of what this queue will accomplish"
              disabled={isSubmitting}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Project Path *</Label>
            <DropdownSelector
              options={directoryOptions}
              value={projectPath}
              onChange={setProjectPath}
              placeholder="Select or enter project path"
              disabled={isSubmitting}
              renderTrigger={({ isOpen, value, onClick }) => (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClick}
                  disabled={isSubmitting}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {value ? (recentDirectories[value]?.shortname || value) : "Select or enter project path"}
                  </span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              )}
            />
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
            disabled={isSubmitting || !name.trim() || !projectPath.trim()}
          >
            {isSubmitting ? 'Creating...' : 'Create Queue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}