import React, { useState } from "react";
import {
  GripVertical,
  Edit,
  Trash2,
  Clock,
  CheckCircle,
  AlertCircle,
  Square,
  Play,
} from "lucide-react";
import { Button } from "@/web/chat/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/web/chat/components/ui/tooltip";
import { Badge } from "@/web/chat/components/ui/badge";
import type { TaskQueue, Task } from "../../types";

interface TaskQueueTaskListProps {
  queue: TaskQueue;
  onTaskEdit: (taskId: string) => void;
  onTaskDelete: (taskId: string) => void;
  onTaskReorder: (taskIds: string[]) => void;
  onTaskClick?: (task: Task) => void;
}

export function TaskQueueTaskList({
  queue,
  onTaskEdit,
  onTaskDelete,
  onTaskReorder,
  onTaskClick,
}: TaskQueueTaskListProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

  // 组件加载时的调试信息
  React.useEffect(() => {
    console.log("=== TaskQueueTaskList 组件信息 ===");
    console.log("队列:", queue);
    console.log("onTaskClick函数:", onTaskClick);
    console.log("onTaskClick是否存在:", !!onTaskClick);
    console.log("任务数量:", queue.tasks?.length || 0);
    console.log("================================");
  }, [queue, onTaskClick]);

  const getStatusIcon = (status: Task["status"]) => {
    switch (status) {
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

  const getStatusColor = (status: Task["status"]) => {
    switch (status) {
      case "running":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      case "cancelled":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  const canEdit = queue.status !== "running";

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    if (!canEdit) return;

    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", taskId);
  };

  const handleDragOver = (e: React.DragEvent, taskId: string) => {
    if (!canEdit || !draggedTaskId) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverTaskId(taskId);
  };

  const handleDragLeave = () => {
    setDragOverTaskId(null);
  };

  const handleDrop = (e: React.DragEvent, targetTaskId: string) => {
    if (!canEdit || !draggedTaskId) return;

    e.preventDefault();
    setDragOverTaskId(null);

    if (draggedTaskId === targetTaskId) {
      setDraggedTaskId(null);
      return;
    }

    const tasks = [...queue.tasks];
    const draggedIndex = tasks.findIndex((t) => t.id === draggedTaskId);
    const targetIndex = tasks.findIndex((t) => t.id === targetTaskId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedTaskId(null);
      return;
    }

    // Remove dragged item and insert at target position
    const [draggedTask] = tasks.splice(draggedIndex, 1);
    tasks.splice(targetIndex, 0, draggedTask);

    // Create new order based on reordered tasks
    const newOrder = tasks.map((t) => t.id);
    onTaskReorder(newOrder);

    setDraggedTaskId(null);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverTaskId(null);
  };

  const formatMarkdownContent = (content: string) => {
    // Remove the title line (first line) since we show it separately
    const lines = content.split("\n");
    const contentWithoutTitle = lines.slice(1).join("\n").trim();

    // Return first 2-3 lines as preview
    const previewLines = contentWithoutTitle.split("\n").slice(0, 3);
    let preview = previewLines.join("\n");

    if (contentWithoutTitle.split("\n").length > 3) {
      preview += "...";
    }

    return preview || "No additional content";
  };

  if (queue.tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center text-muted-foreground">
          <div className="text-lg mb-2">No tasks in this queue</div>
          <div className="text-sm">Add tasks to get started</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 space-y-4">
        {queue.tasks.map((task, index) => (
          <div
            key={task.id}
            className={`group relative border rounded-lg p-5 transition-all ${
              task.sessionId || task.streamingId
                ? "cursor-pointer"
                : "cursor-default"
            } ${draggedTaskId === task.id ? "opacity-50" : ""} ${
              dragOverTaskId === task.id
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                : "border-border hover:border-border/60 hover:shadow-sm"
            } ${
              task.status === "running"
                ? "ring-2 ring-blue-500/20 bg-blue-50/50 dark:bg-blue-950/50"
                : ""
            } ${task.sessionId || task.streamingId ? "hover:bg-muted/20" : ""}`}
            draggable={canEdit}
            onDragStart={(e) => handleDragStart(e, task.id)}
            onDragOver={(e) => handleDragOver(e, task.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, task.id)}
            onDragEnd={handleDragEnd}
            onClick={(e) => {
              // Prevent drag events from interfering with click
              if (draggedTaskId) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }

              e.preventDefault();
              e.stopPropagation();

              // 总是调用onTaskClick，让父组件决定如何处理
              if (onTaskClick) {
                onTaskClick(task);
              }
            }}
          >
            {/* Task Index and Drag Handle */}
            <div className="absolute left-1 top-1 flex items-center gap-1">
              <span className="text-xs text-muted-foreground font-mono w-6 text-center">
                {index + 1}
              </span>
              {canEdit && (
                <GripVertical className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground cursor-grab active:cursor-grabbing" />
              )}
            </div>

            {/* Main Content */}
            <div className="ml-8">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Title and Status */}
                  <div className="flex items-center gap-3 mb-3">
                    {getStatusIcon(task.status)}
                    <h3 className="text-lg font-semibold text-foreground truncate">
                      {task.title}
                    </h3>
                    <Badge
                      variant="secondary"
                      className={getStatusColor(task.status)}
                    >
                      {task.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {task.type === "new" ? "New Session" : "Fork Previous"}
                    </Badge>
                    {task.sessionId ? (
                      <Badge
                        variant="outline"
                        className="text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
                      >
                        查看详情
                      </Badge>
                    ) : task.streamingId ? (
                      <Badge
                        variant="outline"
                        className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800"
                      >
                        会话缺失
                      </Badge>
                    ) : null}
                  </div>

                  {/* Content Preview */}
                  <div className="text-sm text-muted-foreground mb-3 line-clamp-3 whitespace-pre-wrap">
                    {formatMarkdownContent(task.content)}
                  </div>

                  {/* Task Metadata */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      Created {new Date(task.createdAt).toLocaleDateString()}
                    </span>
                    {task.startedAt && (
                      <span>
                        Started {new Date(task.startedAt).toLocaleString()}
                      </span>
                    )}
                    {task.completedAt && (
                      <span>
                        Completed {new Date(task.completedAt).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* Error Message */}
                  {task.error && (
                    <div className="mt-2 text-sm text-red-600 bg-red-50 dark:bg-red-950 p-2 rounded">
                      {task.error}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {canEdit && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onTaskEdit(task.id);
                            }}
                            className="h-8 w-8 p-0 cursor-pointer"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Edit task</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onTaskDelete(task.id);
                            }}
                            className="h-8 w-8 p-0 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Delete task</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
