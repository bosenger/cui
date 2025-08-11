import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Play, Square, Plus, X, RefreshCw } from "lucide-react";
import { Button } from "@/web/chat/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/web/chat/components/ui/tooltip";
import { TaskQueueHeader } from "./TaskQueueHeader";
import { TaskQueueTaskList } from "./TaskQueueTaskList";
import { TaskEditor } from "./TaskEditor";
import { api } from "../../services/api";
import type { TaskQueue, Task } from "../../types";

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
  const [iframeKey, setIframeKey] = useState(0);

  const loadQueue = async () => {
    if (!queueId) return;

    try {
      setLoading(true);
      setError(null);

      const queueData = await api.getTaskQueue(queueId);
      console.log("=== 队列数据加载 ===");
      console.log("队列ID:", queueId);
      console.log("队列数据:", queueData);
      if (queueData.tasks) {
        console.log("任务列表:");
        queueData.tasks.forEach((task, index) => {
          console.log(`  任务${index + 1}:`, {
            id: task.id,
            title: task.title,
            status: task.status,
            sessionId: task.sessionId,
            sessionIdType: typeof task.sessionId,
            hasSessionId: !!task.sessionId,
          });
        });
      }
      console.log("==================");
      setQueue(queueData);
    } catch (err) {
      console.error("Failed to load task queue:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load task queue"
      );
    } finally {
      setLoading(false);
    }
  };

  // Load queue on component mount and when queueId changes
  useEffect(() => {
    loadQueue();
  }, [queueId]);

  const handleBack = () => {
    navigate("/?tab=queues");
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
          if (updatedQueue.status !== "running") {
            clearInterval(pollInterval);
            setExecuting(false);
          }
        } catch (error) {
          console.error("Failed to poll queue status:", error);
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
      console.error("Failed to execute queue:", err);
      setExecuting(false);
      alert(
        `Failed to execute queue: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    }
  };

  const handleCancelQueue = async () => {
    if (!queue || queue.status !== "running") return;

    try {
      await api.cancelTaskQueue(queue.id);
      await loadQueue();
    } catch (err) {
      console.error("Failed to cancel queue:", err);
      alert(
        `Failed to cancel queue: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    }
  };

  const handleCreateTask = async (
    title: string,
    content: string,
    type: "new" | "fork"
  ) => {
    if (!queue) return;

    try {
      await api.createTask(queue.id, { title, content, type });
      await loadQueue();
      setShowTaskEditor(false);
    } catch (err) {
      console.error("Failed to create task:", err);
      throw err; // Re-throw so TaskEditor can handle the error
    }
  };

  const handleUpdateTask = async (
    taskId: string,
    title: string,
    content: string,
    type: "new" | "fork"
  ) => {
    if (!queue) return;

    try {
      await api.updateTask(queue.id, taskId, { title, content, type });
      await loadQueue();
      setEditingTaskId(null);
    } catch (err) {
      console.error("Failed to update task:", err);
      throw err; // Re-throw so TaskEditor can handle the error
    }
  };

  const handleTaskClick = async (task: Task) => {
    console.log("=== handleTaskClick 被调用 ===");
    console.log("接收到的任务:", task);
    console.log("任务sessionId:", task.sessionId);
    console.log("任务streamingId:", task.streamingId);

    // 设置选中任务，即使没有sessionId也设置（用于显示相应的UI）
    setSelectedTask(task);

    // 只有有sessionId的任务才能查看详情
    if (!task.sessionId) {
      console.log("❌ 任务没有sessionId，无法查看详情");
      return;
    }

    console.log("✅ 任务有sessionId，可以查看详情");
  };

  const handleCloseTaskDetails = () => {
    setSelectedTask(null);
  };

  const handleRefreshIframe = () => {
    setIframeKey((prev) => prev + 1);
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!queue) return;

    if (!confirm("Are you sure you want to delete this task?")) {
      return;
    }

    try {
      await api.deleteTask(queue.id, taskId);
      await loadQueue();
    } catch (err) {
      console.error("Failed to delete task:", err);
      alert(
        `Failed to delete task: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    }
  };

  const handleReorderTasks = async (taskIds: string[]) => {
    if (!queue) return;

    try {
      await api.reorderTasks(queue.id, { taskIds });
      await loadQueue();
    } catch (err) {
      console.error("Failed to reorder tasks:", err);
      alert(
        `Failed to reorder tasks: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
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
          <div className="text-red-500">{error || "Task queue not found"}</div>
        </div>
      </div>
    );
  }

  const canExecute =
    queue.status === "draft" ||
    queue.status === "failed" ||
    queue.status === "cancelled";
  const canCancel = queue.status === "running";
  const canEdit = queue.status !== "running";

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
                    {executing ? "Starting..." : "Execute Queue"}
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
        <div
          className={`flex flex-col ${
            selectedTask ? "w-1/2" : "w-full"
          } border-r border-border`}
        >
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

              <div className="flex items-center gap-1">
                {selectedTask.sessionId && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleRefreshIframe}
                          className="cursor-pointer"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>刷新任务详情</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCloseTaskDetails}
                  className="cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Task Conversation */}
            {selectedTask.sessionId ? (
              <div className="flex-1 overflow-hidden">
                <iframe
                  key={iframeKey}
                  src={`http://localhost:3001/c/${selectedTask.sessionId}`}
                  className="w-full h-full border-0"
                  title={`Task Details - ${selectedTask.title}`}
                />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center text-muted-foreground">
                  <div className="text-lg mb-2">无法查看任务详情</div>
                  <div className="text-sm mb-4">
                    该任务尚未执行或会话信息丢失
                  </div>
                  {selectedTask.streamingId && (
                    <div className="text-xs bg-muted p-3 rounded">
                      <div>调试信息:</div>
                      <div>StreamingId: {selectedTask.streamingId}</div>
                      <div>SessionId: {selectedTask.sessionId || "缺失"}</div>
                      <div>状态: {selectedTask.status}</div>
                    </div>
                  )}
                </div>
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
          onSave={(title, content, type) =>
            handleUpdateTask(editingTaskId, title, content, type)
          }
          title="Edit Task"
          initialTask={queue.tasks.find((t) => t.id === editingTaskId)}
        />
      )}
    </div>
  );
}
