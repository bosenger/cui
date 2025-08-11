import { Router, Request } from 'express';
import { 
  TaskQueue,
  TaskQueueSummary,
  TaskQueueListQuery,
  TaskQueueListResponse,
  TaskQueueStatusResponse,
  CreateTaskQueueRequest,
  UpdateTaskQueueRequest,
  CreateTaskRequest,
  UpdateTaskRequest,
  ReorderTasksRequest,
  ExecuteTaskQueueResponse,
  Task,
  CUIError
} from '@/types/index.js';
import { RequestWithRequestId } from '@/types/express.js';
import { TaskQueueService } from '@/services/task-queue-service.js';
import { createLogger } from '@/services/logger.js';

export function createTaskQueueRoutes(taskQueueService: TaskQueueService): Router {
  const router = Router();
  const logger = createLogger('TaskQueueRoutes');

  // List task queues
  router.get('/', async (req: Request<Record<string, never>, TaskQueueListResponse, never, TaskQueueListQuery> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    
    logger.debug('List task queues request', {
      requestId,
      query: req.query
    });
    
    try {
      const result = await taskQueueService.listQueues(req.query);
      
      logger.debug('Task queues listed successfully', {
        requestId,
        count: result.queues.length,
        total: result.total
      });
      
      res.json(result);
    } catch (error) {
      logger.error('Failed to list task queues', error);
      next(error);
    }
  });

  // Create task queue
  router.post('/', async (req: Request<Record<string, never>, TaskQueue, CreateTaskQueueRequest> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    
    logger.debug('Create task queue request', {
      requestId,
      name: req.body.name,
      projectPath: req.body.projectPath
    });
    
    try {
      const queue = await taskQueueService.createQueue(req.body);
      
      logger.info('Task queue created successfully', {
        requestId,
        queueId: queue.id,
        name: queue.name
      });
      
      res.status(201).json(queue);
    } catch (error) {
      logger.error('Failed to create task queue', error);
      next(error);
    }
  });

  // Get specific task queue
  router.get('/:queueId', async (req: Request<{ queueId: string }, TaskQueue> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    const { queueId } = req.params;
    
    logger.debug('Get task queue request', {
      requestId,
      queueId
    });
    
    try {
      const queue = await taskQueueService.getQueueById(queueId);
      if (!queue) {
        throw new CUIError('QUEUE_NOT_FOUND', 'Task queue not found', 404);
      }
      
      logger.debug('Task queue retrieved successfully', {
        requestId,
        queueId,
        taskCount: queue.tasks.length
      });
      
      res.json(queue);
    } catch (error) {
      logger.error('Failed to get task queue', error);
      next(error);
    }
  });

  // Update task queue
  router.put('/:queueId', async (req: Request<{ queueId: string }, TaskQueue, UpdateTaskQueueRequest> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    const { queueId } = req.params;
    
    logger.debug('Update task queue request', {
      requestId,
      queueId,
      updates: req.body
    });
    
    try {
      const queue = await taskQueueService.updateQueue(queueId, req.body);
      
      logger.info('Task queue updated successfully', {
        requestId,
        queueId,
        updates: Object.keys(req.body)
      });
      
      res.json(queue);
    } catch (error) {
      logger.error('Failed to update task queue', error);
      next(error);
    }
  });

  // Delete task queue
  router.delete('/:queueId', async (req: Request<{ queueId: string }> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    const { queueId } = req.params;
    
    logger.debug('Delete task queue request', {
      requestId,
      queueId
    });
    
    try {
      await taskQueueService.deleteQueue(queueId);
      
      logger.info('Task queue deleted successfully', {
        requestId,
        queueId
      });
      
      res.status(204).send();
    } catch (error) {
      logger.error('Failed to delete task queue', error);
      next(error);
    }
  });

  // Get task queue status (for progress monitoring)
  router.get('/:queueId/status', async (req: Request<{ queueId: string }, TaskQueueStatusResponse> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    const { queueId } = req.params;
    
    logger.debug('Get task queue status request', {
      requestId,
      queueId
    });
    
    try {
      const queue = await taskQueueService.getQueueById(queueId);
      if (!queue) {
        throw new CUIError('QUEUE_NOT_FOUND', 'Task queue not found', 404);
      }
      
      const completedCount = queue.tasks.filter(t => t.status === 'completed').length;
      const currentTask = queue.status === 'running' && queue.currentTaskIndex < queue.tasks.length 
        ? queue.tasks[queue.currentTaskIndex] 
        : undefined;
      
      const response: TaskQueueStatusResponse = {
        queue,
        currentTask,
        progress: {
          completed: completedCount,
          total: queue.tasks.length,
          percentage: queue.tasks.length > 0 ? Math.round((completedCount / queue.tasks.length) * 100) : 0
        }
      };
      
      logger.debug('Task queue status retrieved successfully', {
        requestId,
        queueId,
        status: queue.status,
        progress: response.progress
      });
      
      res.json(response);
    } catch (error) {
      logger.error('Failed to get task queue status', error);
      next(error);
    }
  });

  // Execute task queue (start execution)
  router.post('/:queueId/execute', async (req: Request<{ queueId: string }, ExecuteTaskQueueResponse> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    const { queueId } = req.params;
    
    logger.debug('Execute task queue request', {
      requestId,
      queueId
    });
    
    try {
      const queue = await taskQueueService.getQueueById(queueId);
      if (!queue) {
        throw new CUIError('QUEUE_NOT_FOUND', 'Task queue not found', 404);
      }
      
      if (queue.status === 'running') {
        throw new CUIError('QUEUE_ALREADY_RUNNING', 'Task queue is already running', 400);
      }
      
      if (queue.tasks.length === 0) {
        throw new CUIError('QUEUE_EMPTY', 'Cannot execute empty task queue', 400);
      }
      
      // TODO: Implement actual execution logic in a separate service
      // For now, just return success response
      const response: ExecuteTaskQueueResponse = {
        queueId,
        status: 'started',
        message: `Started execution of task queue "${queue.name}" with ${queue.tasks.length} tasks`
      };
      
      logger.info('Task queue execution started', {
        requestId,
        queueId,
        queueName: queue.name,
        taskCount: queue.tasks.length
      });
      
      res.json(response);
    } catch (error) {
      logger.error('Failed to execute task queue', error);
      next(error);
    }
  });

  // Cancel task queue execution
  router.post('/:queueId/cancel', async (req: Request<{ queueId: string }> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    const { queueId } = req.params;
    
    logger.debug('Cancel task queue request', {
      requestId,
      queueId
    });
    
    try {
      const queue = await taskQueueService.getQueueById(queueId);
      if (!queue) {
        throw new CUIError('QUEUE_NOT_FOUND', 'Task queue not found', 404);
      }
      
      if (queue.status !== 'running') {
        throw new CUIError('QUEUE_NOT_RUNNING', 'Task queue is not running', 400);
      }
      
      // TODO: Implement actual cancellation logic
      await taskQueueService.updateQueueStatus(queueId, 'cancelled');
      
      logger.info('Task queue execution cancelled', {
        requestId,
        queueId,
        queueName: queue.name
      });
      
      res.json({ message: 'Task queue execution cancelled' });
    } catch (error) {
      logger.error('Failed to cancel task queue', error);
      next(error);
    }
  });

  // Create task in queue
  router.post('/:queueId/tasks', async (req: Request<{ queueId: string }, Task, CreateTaskRequest> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    const { queueId } = req.params;
    
    logger.debug('Create task request', {
      requestId,
      queueId,
      title: req.body.title,
      type: req.body.type
    });
    
    try {
      const task = await taskQueueService.createTask(queueId, req.body);
      
      logger.info('Task created successfully', {
        requestId,
        queueId,
        taskId: task.id,
        title: task.title
      });
      
      res.status(201).json(task);
    } catch (error) {
      logger.error('Failed to create task', error);
      next(error);
    }
  });

  // Get specific task
  router.get('/:queueId/tasks/:taskId', async (req: Request<{ queueId: string; taskId: string }, Task> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    const { queueId, taskId } = req.params;
    
    logger.debug('Get task request', {
      requestId,
      queueId,
      taskId
    });
    
    try {
      const task = await taskQueueService.getTaskById(taskId);
      if (!task) {
        throw new CUIError('TASK_NOT_FOUND', 'Task not found', 404);
      }
      
      if (task.queueId !== queueId) {
        throw new CUIError('TASK_NOT_IN_QUEUE', 'Task does not belong to specified queue', 400);
      }
      
      logger.debug('Task retrieved successfully', {
        requestId,
        queueId,
        taskId,
        title: task.title
      });
      
      res.json(task);
    } catch (error) {
      logger.error('Failed to get task', error);
      next(error);
    }
  });

  // Update task
  router.put('/:queueId/tasks/:taskId', async (req: Request<{ queueId: string; taskId: string }, Task, UpdateTaskRequest> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    const { queueId, taskId } = req.params;
    
    logger.debug('Update task request', {
      requestId,
      queueId,
      taskId,
      updates: req.body
    });
    
    try {
      const existingTask = await taskQueueService.getTaskById(taskId);
      if (!existingTask) {
        throw new CUIError('TASK_NOT_FOUND', 'Task not found', 404);
      }
      
      if (existingTask.queueId !== queueId) {
        throw new CUIError('TASK_NOT_IN_QUEUE', 'Task does not belong to specified queue', 400);
      }
      
      const task = await taskQueueService.updateTask(taskId, req.body);
      
      logger.info('Task updated successfully', {
        requestId,
        queueId,
        taskId,
        updates: Object.keys(req.body)
      });
      
      res.json(task);
    } catch (error) {
      logger.error('Failed to update task', error);
      next(error);
    }
  });

  // Delete task
  router.delete('/:queueId/tasks/:taskId', async (req: Request<{ queueId: string; taskId: string }> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    const { queueId, taskId } = req.params;
    
    logger.debug('Delete task request', {
      requestId,
      queueId,
      taskId
    });
    
    try {
      const existingTask = await taskQueueService.getTaskById(taskId);
      if (!existingTask) {
        throw new CUIError('TASK_NOT_FOUND', 'Task not found', 404);
      }
      
      if (existingTask.queueId !== queueId) {
        throw new CUIError('TASK_NOT_IN_QUEUE', 'Task does not belong to specified queue', 400);
      }
      
      await taskQueueService.deleteTask(taskId);
      
      logger.info('Task deleted successfully', {
        requestId,
        queueId,
        taskId,
        title: existingTask.title
      });
      
      res.status(204).send();
    } catch (error) {
      logger.error('Failed to delete task', error);
      next(error);
    }
  });

  // Reorder tasks in queue
  router.put('/:queueId/tasks/reorder', async (req: Request<{ queueId: string }, TaskQueue, ReorderTasksRequest> & RequestWithRequestId, res, next) => {
    const requestId = req.requestId;
    const { queueId } = req.params;
    
    logger.debug('Reorder tasks request', {
      requestId,
      queueId,
      taskIds: req.body.taskIds
    });
    
    try {
      const queue = await taskQueueService.reorderTasks(queueId, req.body.taskIds);
      
      logger.info('Tasks reordered successfully', {
        requestId,
        queueId,
        taskCount: req.body.taskIds.length
      });
      
      res.json(queue);
    } catch (error) {
      logger.error('Failed to reorder tasks', error);
      next(error);
    }
  });

  return router;
}