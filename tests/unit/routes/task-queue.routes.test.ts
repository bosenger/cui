import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createTaskQueueRoutes } from '@/routes/task-queue.routes.js';
import { TaskQueueService } from '@/services/task-queue-service.js';
import { TaskQueueExecutionService } from '@/services/task-queue-execution-service.js';
import { errorHandler } from '@/middleware/error-handler.js';
import type { TaskQueue, TaskQueueSummary, Task } from '@/types/index.js';

describe('Task Queue Routes', () => {
  let app: express.Application;
  let taskQueueService: TaskQueueService;
  let executionService: TaskQueueExecutionService;

  const mockQueue: TaskQueue = {
    id: 'queue-123',
    name: 'Test Queue',
    projectPath: '/test/project',
    description: 'Test description',
    status: 'draft',
    currentTaskIndex: 0,
    tasks: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  };

  const mockTask: Task = {
    id: 'task-123',
    queueId: 'queue-123',
    title: 'Test Task',
    content: '# Test Task\n\nTest content',
    type: 'new',
    order: 0,
    status: 'pending',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  };

  const mockQueueSummary: TaskQueueSummary = {
    id: 'queue-123',
    name: 'Test Queue',
    projectPath: '/test/project',
    description: 'Test description',
    status: 'draft',
    taskCount: 2,
    completedTasks: 0,
    failedTasks: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  };

  beforeEach(() => {
    // Create mock services
    taskQueueService = {
      listQueues: vi.fn(),
      createQueue: vi.fn(),
      getQueueById: vi.fn(),
      updateQueue: vi.fn(),
      deleteQueue: vi.fn(),
      createTask: vi.fn(),
      getTaskById: vi.fn(),
      updateTask: vi.fn(),
      deleteTask: vi.fn(),
      reorderTasks: vi.fn(),
      updateQueueStatus: vi.fn(),
      updateTaskStatus: vi.fn()
    } as unknown as TaskQueueService;

    executionService = {
      executeQueue: vi.fn(),
      cancelQueue: vi.fn(),
      isQueueRunning: vi.fn(),
      getQueueProgress: vi.fn()
    } as unknown as TaskQueueExecutionService;

    // Set up Express app
    app = express();
    app.use(express.json());
    
    // Add requestId middleware (simplified for testing)
    app.use((req, res, next) => {
      (req as any).requestId = 'test-request-id';
      next();
    });
    
    app.use('/api/task-queues', createTaskQueueRoutes(taskQueueService, executionService));
    app.use(errorHandler);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/task-queues', () => {
    it('should list task queues', async () => {
      vi.mocked(taskQueueService.listQueues).mockResolvedValue({
        queues: [mockQueueSummary],
        total: 1
      });

      const response = await request(app)
        .get('/api/task-queues')
        .expect(200);

      expect(response.body).toEqual({
        queues: [mockQueueSummary],
        total: 1
      });
      expect(taskQueueService.listQueues).toHaveBeenCalledWith({});
    });

    it('should list queues with query parameters', async () => {
      vi.mocked(taskQueueService.listQueues).mockResolvedValue({
        queues: [],
        total: 0
      });

      await request(app)
        .get('/api/task-queues?projectPath=/test&status=running&limit=5&offset=10')
        .expect(200);

      expect(taskQueueService.listQueues).toHaveBeenCalledWith({
        projectPath: '/test',
        status: 'running',
        limit: '5',
        offset: '10'
      });
    });
  });

  describe('POST /api/task-queues', () => {
    it('should create a task queue', async () => {
      vi.mocked(taskQueueService.createQueue).mockResolvedValue(mockQueue);

      const requestBody = {
        name: 'Test Queue',
        projectPath: '/test/project',
        description: 'Test description'
      };

      const response = await request(app)
        .post('/api/task-queues')
        .send(requestBody)
        .expect(201);

      expect(response.body).toEqual(mockQueue);
      expect(taskQueueService.createQueue).toHaveBeenCalledWith(requestBody);
    });
  });

  describe('GET /api/task-queues/:queueId', () => {
    it('should get a specific task queue', async () => {
      vi.mocked(taskQueueService.getQueueById).mockResolvedValue(mockQueue);

      const response = await request(app)
        .get('/api/task-queues/queue-123')
        .expect(200);

      expect(response.body).toEqual(mockQueue);
      expect(taskQueueService.getQueueById).toHaveBeenCalledWith('queue-123');
    });

    it('should return 404 for non-existent queue', async () => {
      vi.mocked(taskQueueService.getQueueById).mockResolvedValue(null);

      await request(app)
        .get('/api/task-queues/non-existent')
        .expect(404);
    });
  });

  describe('PUT /api/task-queues/:queueId', () => {
    it('should update a task queue', async () => {
      const updatedQueue = { ...mockQueue, name: 'Updated Queue' };
      vi.mocked(taskQueueService.updateQueue).mockResolvedValue(updatedQueue);

      const requestBody = { name: 'Updated Queue' };

      const response = await request(app)
        .put('/api/task-queues/queue-123')
        .send(requestBody)
        .expect(200);

      expect(response.body).toEqual(updatedQueue);
      expect(taskQueueService.updateQueue).toHaveBeenCalledWith('queue-123', requestBody);
    });
  });

  describe('DELETE /api/task-queues/:queueId', () => {
    it('should delete a task queue', async () => {
      vi.mocked(taskQueueService.deleteQueue).mockResolvedValue();

      await request(app)
        .delete('/api/task-queues/queue-123')
        .expect(204);

      expect(taskQueueService.deleteQueue).toHaveBeenCalledWith('queue-123');
    });
  });

  describe('GET /api/task-queues/:queueId/status', () => {
    it('should get queue status', async () => {
      const queueWithTasks = {
        ...mockQueue,
        tasks: [mockTask, { ...mockTask, id: 'task-456', status: 'completed' as const }]
      };
      vi.mocked(taskQueueService.getQueueById).mockResolvedValue(queueWithTasks);

      const response = await request(app)
        .get('/api/task-queues/queue-123/status')
        .expect(200);

      expect(response.body).toMatchObject({
        queue: queueWithTasks,
        progress: {
          completed: 1,
          total: 2,
          percentage: 50
        }
      });
    });

    it('should include current task for running queue', async () => {
      const runningQueue = {
        ...mockQueue,
        status: 'running' as const,
        currentTaskIndex: 0,
        tasks: [mockTask]
      };
      vi.mocked(taskQueueService.getQueueById).mockResolvedValue(runningQueue);

      const response = await request(app)
        .get('/api/task-queues/queue-123/status')
        .expect(200);

      expect(response.body.currentTask).toEqual(mockTask);
    });
  });

  describe('POST /api/task-queues/:queueId/execute', () => {
    it('should execute a task queue', async () => {
      const executableQueue = { ...mockQueue, tasks: [mockTask] };
      vi.mocked(taskQueueService.getQueueById).mockResolvedValue(executableQueue);
      vi.mocked(executionService.executeQueue).mockResolvedValue();

      const response = await request(app)
        .post('/api/task-queues/queue-123/execute')
        .expect(200);

      expect(response.body).toMatchObject({
        queueId: 'queue-123',
        status: 'started',
        message: expect.stringContaining('Started execution of task queue "Test Queue" with 1 tasks')
      });
      expect(executionService.executeQueue).toHaveBeenCalledWith('queue-123');
    });

    it('should not execute empty queue', async () => {
      const emptyQueue = { ...mockQueue, tasks: [] };
      vi.mocked(taskQueueService.getQueueById).mockResolvedValue(emptyQueue);

      await request(app)
        .post('/api/task-queues/queue-123/execute')
        .expect(400);

      expect(executionService.executeQueue).not.toHaveBeenCalled();
    });

    it('should not execute already running queue', async () => {
      const runningQueue = { ...mockQueue, status: 'running' as const, tasks: [mockTask] };
      vi.mocked(taskQueueService.getQueueById).mockResolvedValue(runningQueue);

      await request(app)
        .post('/api/task-queues/queue-123/execute')
        .expect(400);

      expect(executionService.executeQueue).not.toHaveBeenCalled();
    });

    it('should handle missing execution service', async () => {
      // Create app without execution service
      const appWithoutExecution = express();
      appWithoutExecution.use(express.json());
      appWithoutExecution.use((req, res, next) => {
        (req as any).requestId = 'test-request-id';
        next();
      });
      appWithoutExecution.use('/api/task-queues', createTaskQueueRoutes(taskQueueService));
      appWithoutExecution.use(errorHandler);

      const executableQueue = { ...mockQueue, tasks: [mockTask] };
      vi.mocked(taskQueueService.getQueueById).mockResolvedValue(executableQueue);

      await request(appWithoutExecution)
        .post('/api/task-queues/queue-123/execute')
        .expect(500);
    });
  });

  describe('POST /api/task-queues/:queueId/cancel', () => {
    it('should cancel a running task queue', async () => {
      const runningQueue = { ...mockQueue, status: 'running' as const };
      vi.mocked(taskQueueService.getQueueById).mockResolvedValue(runningQueue);
      vi.mocked(executionService.cancelQueue).mockResolvedValue();

      const response = await request(app)
        .post('/api/task-queues/queue-123/cancel')
        .expect(200);

      expect(response.body).toEqual({ message: 'Task queue execution cancelled' });
      expect(executionService.cancelQueue).toHaveBeenCalledWith('queue-123');
    });

    it('should not cancel non-running queue', async () => {
      vi.mocked(taskQueueService.getQueueById).mockResolvedValue(mockQueue);

      await request(app)
        .post('/api/task-queues/queue-123/cancel')
        .expect(400);

      expect(executionService.cancelQueue).not.toHaveBeenCalled();
    });
  });

  describe('Task Operations', () => {
    describe('POST /api/task-queues/:queueId/tasks', () => {
      it('should create a task', async () => {
        vi.mocked(taskQueueService.createTask).mockResolvedValue(mockTask);

        const requestBody = {
          title: 'Test Task',
          content: '# Test Task\n\nTest content',
          type: 'new' as const
        };

        const response = await request(app)
          .post('/api/task-queues/queue-123/tasks')
          .send(requestBody)
          .expect(201);

        expect(response.body).toEqual(mockTask);
        expect(taskQueueService.createTask).toHaveBeenCalledWith('queue-123', requestBody);
      });
    });

    describe('GET /api/task-queues/:queueId/tasks/:taskId', () => {
      it('should get a specific task', async () => {
        vi.mocked(taskQueueService.getTaskById).mockResolvedValue(mockTask);

        const response = await request(app)
          .get('/api/task-queues/queue-123/tasks/task-123')
          .expect(200);

        expect(response.body).toEqual(mockTask);
        expect(taskQueueService.getTaskById).toHaveBeenCalledWith('task-123');
      });

      it('should return 404 for non-existent task', async () => {
        vi.mocked(taskQueueService.getTaskById).mockResolvedValue(null);

        await request(app)
          .get('/api/task-queues/queue-123/tasks/non-existent')
          .expect(404);
      });

      it('should return 400 if task belongs to different queue', async () => {
        const taskFromDifferentQueue = { ...mockTask, queueId: 'different-queue' };
        vi.mocked(taskQueueService.getTaskById).mockResolvedValue(taskFromDifferentQueue);

        await request(app)
          .get('/api/task-queues/queue-123/tasks/task-123')
          .expect(400);
      });
    });

    describe('PUT /api/task-queues/:queueId/tasks/:taskId', () => {
      it('should update a task', async () => {
        const updatedTask = { ...mockTask, title: 'Updated Task' };
        vi.mocked(taskQueueService.getTaskById).mockResolvedValue(mockTask);
        vi.mocked(taskQueueService.updateTask).mockResolvedValue(updatedTask);

        const requestBody = { title: 'Updated Task' };

        const response = await request(app)
          .put('/api/task-queues/queue-123/tasks/task-123')
          .send(requestBody)
          .expect(200);

        expect(response.body).toEqual(updatedTask);
        expect(taskQueueService.updateTask).toHaveBeenCalledWith('task-123', requestBody);
      });

      it('should return 400 if task belongs to different queue', async () => {
        const taskFromDifferentQueue = { ...mockTask, queueId: 'different-queue' };
        vi.mocked(taskQueueService.getTaskById).mockResolvedValue(taskFromDifferentQueue);

        await request(app)
          .put('/api/task-queues/queue-123/tasks/task-123')
          .send({ title: 'Updated Task' })
          .expect(400);

        expect(taskQueueService.updateTask).not.toHaveBeenCalled();
      });
    });

    describe('DELETE /api/task-queues/:queueId/tasks/:taskId', () => {
      it('should delete a task', async () => {
        vi.mocked(taskQueueService.getTaskById).mockResolvedValue(mockTask);
        vi.mocked(taskQueueService.deleteTask).mockResolvedValue();

        await request(app)
          .delete('/api/task-queues/queue-123/tasks/task-123')
          .expect(204);

        expect(taskQueueService.deleteTask).toHaveBeenCalledWith('task-123');
      });
    });

    describe('PUT /api/task-queues/:queueId/tasks/reorder', () => {
      it('should reorder tasks', async () => {
        const reorderedQueue = { ...mockQueue, tasks: [mockTask] };
        vi.mocked(taskQueueService.reorderTasks).mockResolvedValue(reorderedQueue);

        const requestBody = { taskIds: ['task-123', 'task-456'] };

        const response = await request(app)
          .put('/api/task-queues/queue-123/tasks/reorder')
          .send(requestBody)
          .expect(200);

        expect(response.body).toEqual(reorderedQueue);
        expect(taskQueueService.reorderTasks).toHaveBeenCalledWith('queue-123', requestBody.taskIds);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors', async () => {
      const error = new Error('Database connection failed');
      vi.mocked(taskQueueService.listQueues).mockRejectedValue(error);

      await request(app)
        .get('/api/task-queues')
        .expect(500);
    });

    it('should handle validation errors for invalid queue IDs', async () => {
      // Test with various invalid IDs that would likely cause database errors
      const invalidIds = ['', ' ', 'null', 'undefined'];

      for (const invalidId of invalidIds) {
        vi.mocked(taskQueueService.getQueueById).mockRejectedValue(new Error('Invalid ID'));

        await request(app)
          .get(`/api/task-queues/${invalidId}`)
          .expect(500);
      }
    });
  });
});