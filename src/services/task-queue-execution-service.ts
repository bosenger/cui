import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { TaskQueueService } from './task-queue-service.js';
import { ClaudeProcessManager } from './claude-process-manager.js';
import { StreamManager } from './stream-manager.js';
import { PermissionTracker } from './permission-tracker.js';
import { ConversationStatusManager } from './conversation-status-manager.js';
import { 
  TaskQueue, 
  Task, 
  ConversationConfig,
  CUIError,
  StreamEvent,
  AssistantStreamMessage
} from '@/types/index.js';
import { createLogger } from './logger.js';
import { type Logger } from './logger.js';

interface QueueExecution {
  queueId: string;
  queue: TaskQueue;
  currentTaskIndex: number;
  currentStreamingId?: string;
  currentSessionId?: string;
  startedAt: string;
  isExecutingTask: boolean; // Flag to prevent concurrent task execution
}

/**
 * TaskQueueExecutionService manages the sequential execution of task queues
 * Integrates with existing ClaudeProcessManager for task execution
 * Handles both 'new' and 'fork' task types
 */
export class TaskQueueExecutionService extends EventEmitter {
  private static instance: TaskQueueExecutionService;
  private logger: Logger;
  private taskQueueService: TaskQueueService;
  private claudeProcessManager: ClaudeProcessManager;
  private streamManager: StreamManager;
  private permissionTracker: PermissionTracker;
  private statusManager: ConversationStatusManager;
  
  private runningExecutions: Map<string, QueueExecution> = new Map();
  
  constructor(
    taskQueueService: TaskQueueService,
    claudeProcessManager: ClaudeProcessManager,
    streamManager: StreamManager,
    permissionTracker: PermissionTracker,
    statusManager: ConversationStatusManager
  ) {
    super();
    this.logger = createLogger('TaskQueueExecutionService');
    this.taskQueueService = taskQueueService;
    this.claudeProcessManager = claudeProcessManager;
    this.streamManager = streamManager;
    this.permissionTracker = permissionTracker;
    this.statusManager = statusManager;

    this.setupEventHandlers();
  }

  static getInstance(
    taskQueueService: TaskQueueService,
    claudeProcessManager: ClaudeProcessManager,
    streamManager: StreamManager,
    permissionTracker: PermissionTracker,
    statusManager: ConversationStatusManager
  ): TaskQueueExecutionService {
    if (!TaskQueueExecutionService.instance) {
      TaskQueueExecutionService.instance = new TaskQueueExecutionService(
        taskQueueService,
        claudeProcessManager,
        streamManager,
        permissionTracker,
        statusManager
      );
    }
    return TaskQueueExecutionService.instance;
  }

  static resetInstance(): void {
    TaskQueueExecutionService.instance = null as unknown as TaskQueueExecutionService;
  }

  private setupEventHandlers(): void {
    // Listen for Claude process completion
    this.claudeProcessManager.on('process-closed', ({ streamingId, code }) => {
      this.handleTaskCompletion(streamingId, code === 0);
    });

    // Listen for Claude process errors
    this.claudeProcessManager.on('process-error', ({ streamingId, error }) => {
      this.handleTaskError(streamingId, error.toString());
    });

    // Auto-approve all permission requests during queue execution
    this.permissionTracker.on('permission_request', (request) => {
      // Check if this permission request is for a running queue task
      const execution = this.findExecutionByStreamingId(request.streamingId);
      if (execution) {
        this.logger.debug('Auto-approving permission request for queue task', {
          queueId: execution.queueId,
          taskIndex: execution.currentTaskIndex,
          permissionId: request.id,
          toolName: request.toolName
        });
        
        // Auto-approve the permission request
        this.permissionTracker.updatePermissionStatus(request.id, 'approved');
      }
    });

    // Listen for task status changes to broadcast progress
    this.taskQueueService.on('taskStatusChanged', (event) => {
      this.broadcastTaskProgress(event);
    });
  }

  private findExecutionByStreamingId(streamingId: string): QueueExecution | undefined {
    for (const execution of this.runningExecutions.values()) {
      if (execution.currentStreamingId === streamingId) {
        return execution;
      }
    }
    return undefined;
  }

  private broadcastTaskProgress(event: any): void {
    const execution = this.runningExecutions.get(event.queueId);
    if (execution && execution.currentStreamingId) {
      // Create a simple progress message instead of a complex Claude message
      const progressMessage = `Task queue progress: Task ${execution.currentTaskIndex + 1}/${execution.queue.tasks.length} - ${event.status}`;
      
      // Create a simple stream event for progress updates
      const progressEvent: AssistantStreamMessage = {
        type: 'assistant',
        session_id: execution.currentSessionId || '',
        message: {
          id: uuidv4(),
          type: 'message' as const,
          role: 'assistant' as const,
          content: [{
            type: 'text' as const,
            text: progressMessage,
            citations: null
          }],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 0,
            output_tokens: progressMessage.length,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            server_tool_use: {
              web_search_requests: 0
            },
            service_tier: 'standard' as const
          }
        }
      };

      // Broadcast to all clients listening to this queue's progress
      this.streamManager.broadcast(`queue-${execution.queueId}`, progressEvent);
    }
  }

  async executeQueue(queueId: string): Promise<void> {
    this.logger.info('Starting queue execution', { queueId });

    // Check if queue is already running
    if (this.runningExecutions.has(queueId)) {
      throw new CUIError('QUEUE_ALREADY_RUNNING', 'Queue is already being executed', 400);
    }

    // Get the queue
    const queue = await this.taskQueueService.getQueueById(queueId);
    if (!queue) {
      throw new CUIError('QUEUE_NOT_FOUND', 'Queue not found', 404);
    }

    if (queue.tasks.length === 0) {
      throw new CUIError('QUEUE_EMPTY', 'Cannot execute empty queue', 400);
    }

    // Update queue status to running
    const startedAt = new Date().toISOString();
    await this.taskQueueService.updateQueueStatus(queueId, 'running', 0, startedAt);

    // Create execution record
    const execution: QueueExecution = {
      queueId,
      queue: { ...queue, status: 'running' as const },
      currentTaskIndex: 0,
      startedAt,
      isExecutingTask: false // Initialize the flag
    };

    this.runningExecutions.set(queueId, execution);

    try {
      // Start executing tasks sequentially
      await this.executeNextTask(execution);
    } catch (error) {
      this.logger.error('Queue execution failed', error);
      await this.handleQueueError(execution, error instanceof Error ? error.message : String(error));
    }
  }

  private async executeNextTask(execution: QueueExecution): Promise<void> {
    const { queueId, queue, currentTaskIndex } = execution;

    // Prevent concurrent task execution for the same queue
    if (execution.isExecutingTask) {
      this.logger.debug('Task already executing for queue, skipping duplicate call', {
        queueId,
        currentTaskIndex
      });
      return;
    }

    if (currentTaskIndex >= queue.tasks.length) {
      // All tasks completed
      await this.handleQueueCompletion(execution);
      return;
    }

    // Set flag to prevent concurrent execution
    execution.isExecutingTask = true;

    const currentTask = queue.tasks[currentTaskIndex];
    this.logger.info('Executing task', {
      queueId,
      taskIndex: currentTaskIndex,
      taskId: currentTask.id,
      taskType: currentTask.type,
      title: currentTask.title
    });

    // Update task status to running
    const taskStartedAt = new Date().toISOString();
    await this.taskQueueService.updateTaskStatus(
      currentTask.id,
      'running',
      undefined, // sessionId will be set when Claude process starts
      undefined, // streamingId will be set when Claude process starts
      undefined, // no error
      taskStartedAt
    );

    // Update queue's current task index
    await this.taskQueueService.updateQueueStatus(queueId, 'running', currentTaskIndex);

    try {
      // Prepare conversation config
      const config = await this.prepareConversationConfig(currentTask, execution);

      // Start the Claude conversation
      const result = await this.claudeProcessManager.startConversation(config);
      const streamingId = result.streamingId;
      
      // Update execution with current streaming session
      execution.currentStreamingId = streamingId;
      
      // Update task with streaming ID
      await this.taskQueueService.updateTaskStatus(
        currentTask.id,
        'running',
        undefined, // sessionId will be updated when we get the session info
        streamingId
      );

      this.logger.debug('Task execution started', {
        queueId,
        taskId: currentTask.id,
        streamingId
      });

    } catch (error) {
      this.logger.error('Failed to start task execution', error);
      // Reset the flag on error
      execution.isExecutingTask = false;
      await this.handleTaskError(execution.currentStreamingId || '', error instanceof Error ? error.message : String(error));
    }
  }

  private async prepareConversationConfig(task: Task, execution: QueueExecution): Promise<ConversationConfig> {
    const config: ConversationConfig = {
      workingDirectory: execution.queue.projectPath,
      initialPrompt: task.content,
      permissionMode: 'bypassPermissions', // Auto-approve permissions for queue execution
    };

    if (task.type === 'fork' && execution.currentSessionId) {
      // Fork from the previous task's session
      try {
        // Get the previous session's messages for context
        const previousSessionMessages = await this.claudeProcessManager.getConversationHistory(execution.currentSessionId);
        config.previousMessages = previousSessionMessages;
        
        this.logger.debug('Prepared fork task config', {
          taskId: task.id,
          previousSessionId: execution.currentSessionId,
          previousMessagesCount: previousSessionMessages?.length || 0
        });
      } catch (error) {
        this.logger.warn('Failed to get previous session history for fork, proceeding as new session', {
          taskId: task.id,
          previousSessionId: execution.currentSessionId,
          error: error instanceof Error ? error.message : String(error)
        });
        // If we can't get the previous session, just proceed as a new task
      }
    }

    return config;
  }

  private async handleTaskCompletion(streamingId: string, success: boolean): Promise<void> {
    const execution = this.findExecutionByStreamingId(streamingId);
    if (!execution) {
      this.logger.debug('Received task completion for non-queue session', { streamingId });
      return;
    }

    // Ensure we don't process the same completion multiple times
    if (!execution.isExecutingTask) {
      this.logger.debug('Task already completed or not executing', {
        queueId: execution.queueId,
        streamingId
      });
      return;
    }

    const currentTask = execution.queue.tasks[execution.currentTaskIndex];
    const completedAt = new Date().toISOString();

    this.logger.info('Task completed', {
      queueId: execution.queueId,
      taskId: currentTask.id,
      success,
      taskIndex: execution.currentTaskIndex
    });

    // Reset the executing flag
    execution.isExecutingTask = false;
    execution.currentStreamingId = undefined;

    if (success) {
      // Store the session ID for potential forking
      const sessionId = this.statusManager.getSessionId(streamingId);
      if (sessionId) {
        execution.currentSessionId = sessionId;
        
        // Update task with session ID
        await this.taskQueueService.updateTaskStatus(
          currentTask.id,
          'completed',
          sessionId,
          streamingId,
          undefined,
          undefined,
          completedAt
        );
      } else {
        // Update task status without session ID
        await this.taskQueueService.updateTaskStatus(
          currentTask.id,
          'completed',
          execution.currentSessionId,
          streamingId,
          undefined,
          undefined,
          completedAt
        );
      }

      // Move to next task only after the current one is fully completed
      execution.currentTaskIndex++;
      
      // Execute next task directly
      await this.executeNextTask(execution);
    } else {
      // Task failed, handle the failure
      await this.handleTaskError(streamingId, 'Task execution failed');
    }
  }

  private async handleTaskError(streamingId: string, errorMessage: string): Promise<void> {
    const execution = this.findExecutionByStreamingId(streamingId);
    if (!execution) {
      this.logger.debug('Received task error for non-queue session', { streamingId });
      return;
    }

    // Reset the executing flag on error
    execution.isExecutingTask = false;
    execution.currentStreamingId = undefined;

    const currentTask = execution.queue.tasks[execution.currentTaskIndex];
    const completedAt = new Date().toISOString();

    this.logger.error('Task failed', {
      queueId: execution.queueId,
      taskId: currentTask.id,
      taskIndex: execution.currentTaskIndex,
      error: errorMessage
    });

    // Update task status to failed
    await this.taskQueueService.updateTaskStatus(
      currentTask.id,
      'failed',
      execution.currentSessionId,
      streamingId,
      errorMessage,
      undefined, // startedAt already set
      completedAt
    );

    // Mark queue as failed and stop execution
    await this.handleQueueError(execution, `Task ${execution.currentTaskIndex + 1} failed: ${errorMessage}`);
  }

  private async handleQueueCompletion(execution: QueueExecution): Promise<void> {
    const completedAt = new Date().toISOString();
    
    this.logger.info('Queue execution completed', {
      queueId: execution.queueId,
      totalTasks: execution.queue.tasks.length,
      duration: Date.now() - new Date(execution.startedAt).getTime()
    });

    // Update queue status to completed
    await this.taskQueueService.updateQueueStatus(
      execution.queueId,
      'completed',
      execution.currentTaskIndex,
      execution.startedAt,
      completedAt
    );

    // Clean up execution record
    this.runningExecutions.delete(execution.queueId);

    // Emit completion event
    this.emit('queueCompleted', {
      queueId: execution.queueId,
      totalTasks: execution.queue.tasks.length,
      completedAt
    });
  }

  private async handleQueueError(execution: QueueExecution, errorMessage: string): Promise<void> {
    const completedAt = new Date().toISOString();

    this.logger.error('Queue execution failed', {
      queueId: execution.queueId,
      currentTaskIndex: execution.currentTaskIndex,
      totalTasks: execution.queue.tasks.length,
      error: errorMessage
    });

    // Update queue status to failed
    await this.taskQueueService.updateQueueStatus(
      execution.queueId,
      'failed',
      execution.currentTaskIndex,
      execution.startedAt,
      completedAt
    );

    // Mark remaining tasks as cancelled
    for (let i = execution.currentTaskIndex + 1; i < execution.queue.tasks.length; i++) {
      const task = execution.queue.tasks[i];
      if (task.status === 'pending') {
        await this.taskQueueService.updateTaskStatus(task.id, 'cancelled');
      }
    }

    // Clean up execution record
    this.runningExecutions.delete(execution.queueId);

    // Emit error event
    this.emit('queueFailed', {
      queueId: execution.queueId,
      error: errorMessage,
      completedAt
    });
  }

  async cancelQueue(queueId: string): Promise<void> {
    const execution = this.runningExecutions.get(queueId);
    if (!execution) {
      throw new CUIError('QUEUE_NOT_RUNNING', 'Queue is not currently running', 400);
    }

    this.logger.info('Cancelling queue execution', {
      queueId,
      currentTaskIndex: execution.currentTaskIndex
    });

    // Stop the current Claude process if running
    if (execution.currentStreamingId) {
      try {
        await this.claudeProcessManager.stopConversation(execution.currentStreamingId);
      } catch (error) {
        this.logger.warn('Failed to stop current task during cancellation', error);
      }
    }

    // Reset execution flag
    execution.isExecutingTask = false;

    // Update current task to cancelled if it's running
    const currentTask = execution.queue.tasks[execution.currentTaskIndex];
    if (currentTask.status === 'running') {
      await this.taskQueueService.updateTaskStatus(currentTask.id, 'cancelled');
    }

    // Mark queue and remaining tasks as cancelled
    await this.handleQueueError(execution, 'Queue execution was cancelled by user');
  }

  getRunningQueues(): string[] {
    return Array.from(this.runningExecutions.keys());
  }

  isQueueRunning(queueId: string): boolean {
    return this.runningExecutions.has(queueId);
  }

  getQueueProgress(queueId: string): { current: number; total: number; percentage: number } | null {
    const execution = this.runningExecutions.get(queueId);
    if (!execution) {
      return null;
    }

    return {
      current: execution.currentTaskIndex,
      total: execution.queue.tasks.length,
      percentage: Math.round((execution.currentTaskIndex / execution.queue.tasks.length) * 100)
    };
  }
}