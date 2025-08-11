import React from "react";
import {
  Play,
  Square,
  Clock,
  CheckCircle,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { Button } from "@/web/chat/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/web/chat/components/ui/tooltip";
import type { TaskQueueSummary } from "../../types";

interface TaskQueueItemProps {
  queue: TaskQueueSummary;
  recentDirectories: Record<string, { lastDate: string; shortname: string }>;
  onClick: () => void;
  onDelete: () => void;
}

export function TaskQueueItem({
  queue,
  recentDirectories,
  onClick,
  onDelete,
}: TaskQueueItemProps) {
  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  const getStatusIcon = () => {
    switch (queue.status) {
      case "running":
        return <Play className="h-4 w-4 text-blue-500" />;
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "cancelled":
        return <Square className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = () => {
    switch (queue.status) {
      case "running":
        return "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950";
      case "completed":
        return "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950";
      case "failed":
        return "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950";
      case "cancelled":
        return "text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950";
      default:
        return "text-muted-foreground bg-muted/50";
    }
  };

  const getProgressPercentage = () => {
    if (queue.taskCount === 0) return 0;
    return Math.round((queue.completedTasks / queue.taskCount) * 100);
  };

  const getDirectoryDisplayName = (path: string) => {
    const recentDir = recentDirectories[path];
    return recentDir?.shortname || path;
  };

  return (
    <div className="relative group hover:bg-muted/30 border-b border-border/20 last:border-b-0">
      <div
        className="block p-4 cursor-pointer transition-all duration-200"
        onClick={onClick}
      >
        <div className="flex items-start justify-between">
          {/* Main Content */}
          <div className="flex-1 min-w-0 gap-1">
            {/* Title */}
            <div className="flex items-center gap-2 flex-row">
              <div className="flex items-center gap-2 flex-row flex-1">
                {getStatusIcon()}
                <h3 className="text-lg font-semibold text-foreground truncate">
                  {queue.name}
                </h3>
                <span
                  className={`px-2 py-0.5 text-xs rounded-full font-medium uppercase ${getStatusColor()}`}
                >
                  {queue.status}
                </span>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete();
                        }}
                        className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Delete queue</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {/* Description */}
            {queue.description && (
              <p className="text-sm text-muted-foreground  line-clamp-2">
                {queue.description}
              </p>
            )}

            {/* Progress Bar */}
            {queue.taskCount > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${getProgressPercentage()}%` }}
                  />
                </div>
                <span className="text-sm text-muted-foreground font-medium">
                  {queue.completedTasks}/{queue.taskCount}
                </span>
              </div>
            )}

            {/* Metadata */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{getDirectoryDisplayName(queue.projectPath)}</span>
              <span className="uppercase">
                {formatTimestamp(queue.updatedAt)}
              </span>
              {queue.failedTasks > 0 && (
                <span className="text-red-500">{queue.failedTasks} failed</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
