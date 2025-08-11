import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskQueueService } from '@/services/task-queue-service.js';
import type { CreateTaskQueueRequest, CreateTaskRequest, UpdateTaskQueueRequest, UpdateTaskRequest } from '@/types/index.js';

describe('TaskQueueService', () => {
  let service: TaskQueueService;

  beforeEach(async () => {
    // Create a new service instance for each test with in-memory database
    TaskQueueService.resetInstance();
    service = new TaskQueueService(':memory:');
    await service.initialize();
  });

  afterEach(async () => {
    await service.close();
    TaskQueueService.resetInstance();
  });

  describe('Queue CRUD Operations', () => {
    it('should create a task queue', async () => {
      const request: CreateTaskQueueRequest = {
        name: 'Test Queue',
        projectPath: '/test/project',
        description: 'A test queue'
      };

      const queue = await service.createQueue(request);

      expect(queue.id).toBeDefined();
      expect(queue.name).toBe(request.name);
      expect(queue.projectPath).toBe(request.projectPath);
      expect(queue.description).toBe(request.description);
      expect(queue.status).toBe('draft');
      expect(queue.currentTaskIndex).toBe(0);
      expect(queue.tasks).toEqual([]);
      expect(queue.createdAt).toBeDefined();
      expect(queue.updatedAt).toBeDefined();
    });

    it('should retrieve a task queue by ID', async () => {
      const request: CreateTaskQueueRequest = {
        name: 'Test Queue',
        projectPath: '/test/project'
      };

      const created = await service.createQueue(request);
      const retrieved = await service.getQueueById(created.id);

      expect(retrieved).toEqual(created);
    });

    it('should return null for non-existent queue', async () => {
      const retrieved = await service.getQueueById('non-existent-id');
      expect(retrieved).toBeNull();
    });

    it('should update a task queue', async () => {
      const createRequest: CreateTaskQueueRequest = {
        name: 'Test Queue',
        projectPath: '/test/project'
      };

      const created = await service.createQueue(createRequest);
      
      // Small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const updateRequest: UpdateTaskQueueRequest = {
        name: 'Updated Queue',
        description: 'Updated description'
      };

      const updated = await service.updateQueue(created.id, updateRequest);

      expect(updated.name).toBe(updateRequest.name);
      expect(updated.description).toBe(updateRequest.description);
      expect(updated.projectPath).toBe(created.projectPath); // Should not change
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date(created.updatedAt).getTime());
    });

    it('should delete a task queue', async () => {
      const request: CreateTaskQueueRequest = {
        name: 'Test Queue',
        projectPath: '/test/project'
      };

      const created = await service.createQueue(request);
      await service.deleteQueue(created.id);

      const retrieved = await service.getQueueById(created.id);
      expect(retrieved).toBeNull();
    });

    it('should not allow deletion of running queue', async () => {
      const request: CreateTaskQueueRequest = {
        name: 'Test Queue',
        projectPath: '/test/project'
      };

      const created = await service.createQueue(request);
      await service.updateQueueStatus(created.id, 'running');

      await expect(service.deleteQueue(created.id)).rejects.toThrow('Cannot delete running queue');
    });

    it('should list task queues', async () => {
      // Create multiple queues
      await service.createQueue({ name: 'Queue 1', projectPath: '/project1' });
      await service.createQueue({ name: 'Queue 2', projectPath: '/project2' });
      await service.createQueue({ name: 'Queue 3', projectPath: '/project1' });

      // List all queues
      const result = await service.listQueues();
      expect(result.total).toBe(3);
      expect(result.queues).toHaveLength(3);

      // Filter by project path
      const filtered = await service.listQueues({ projectPath: '/project1' });
      expect(filtered.total).toBe(2);
      expect(filtered.queues).toHaveLength(2);

      // Test pagination
      const paginated = await service.listQueues({ limit: 1, offset: 1 });
      expect(paginated.queues).toHaveLength(1);
    });
  });

  describe('Task CRUD Operations', () => {
    let queueId: string;

    beforeEach(async () => {
      const queue = await service.createQueue({
        name: 'Test Queue',
        projectPath: '/test/project'
      });
      queueId = queue.id;
    });

    it('should create a task', async () => {
      const request: CreateTaskRequest = {
        title: 'Test Task',
        content: '# Test Task\n\nThis is a test task.',
        type: 'new'
      };

      const task = await service.createTask(queueId, request);

      expect(task.id).toBeDefined();
      expect(task.queueId).toBe(queueId);
      expect(task.title).toBe(request.title);
      expect(task.content).toBe(request.content);
      expect(task.type).toBe(request.type);
      expect(task.order).toBe(0);
      expect(task.status).toBe('pending');
      expect(task.createdAt).toBeDefined();
      expect(task.updatedAt).toBeDefined();
    });

    it('should create tasks with correct order', async () => {
      const task1 = await service.createTask(queueId, {
        title: 'Task 1',
        content: '# Task 1',
        type: 'new'
      });

      const task2 = await service.createTask(queueId, {
        title: 'Task 2', 
        content: '# Task 2',
        type: 'fork'
      });

      expect(task1.order).toBe(0);
      expect(task2.order).toBe(1);
    });

    it('should create task with custom order', async () => {
      await service.createTask(queueId, {
        title: 'Task 1',
        content: '# Task 1',
        type: 'new'
      });

      const task = await service.createTask(queueId, {
        title: 'Task Custom',
        content: '# Task Custom',
        type: 'new',
        order: 5
      });

      expect(task.order).toBe(5);
    });

    it('should retrieve a task by ID', async () => {
      const created = await service.createTask(queueId, {
        title: 'Test Task',
        content: '# Test Task',
        type: 'new'
      });

      const retrieved = await service.getTaskById(created.id);
      expect(retrieved).toEqual(created);
    });

    it('should update a task', async () => {
      const created = await service.createTask(queueId, {
        title: 'Test Task',
        content: '# Test Task',
        type: 'new'
      });

      // Small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const updateRequest: UpdateTaskRequest = {
        title: 'Updated Task',
        content: '# Updated Task\n\nUpdated content',
        type: 'fork'
      };

      const updated = await service.updateTask(created.id, updateRequest);

      expect(updated.title).toBe(updateRequest.title);
      expect(updated.content).toBe(updateRequest.content);
      expect(updated.type).toBe(updateRequest.type);
      expect(updated.order).toBe(created.order); // Should not change
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date(created.updatedAt).getTime());
    });

    it('should delete a task', async () => {
      const created = await service.createTask(queueId, {
        title: 'Test Task',
        content: '# Test Task',
        type: 'new'
      });

      await service.deleteTask(created.id);

      const retrieved = await service.getTaskById(created.id);
      expect(retrieved).toBeNull();
    });

    it('should not allow deletion of running task', async () => {
      const created = await service.createTask(queueId, {
        title: 'Test Task',
        content: '# Test Task',
        type: 'new'
      });

      await service.updateTaskStatus(created.id, 'running');

      await expect(service.deleteTask(created.id)).rejects.toThrow('Cannot delete running task');
    });

    it('should not allow adding tasks to running queue', async () => {
      await service.updateQueueStatus(queueId, 'running');

      await expect(service.createTask(queueId, {
        title: 'Test Task',
        content: '# Test Task',
        type: 'new'
      })).rejects.toThrow('Cannot add tasks to running queue');
    });

    it('should reorder tasks', async () => {
      const task1 = await service.createTask(queueId, {
        title: 'Task 1',
        content: '# Task 1',
        type: 'new'
      });

      const task2 = await service.createTask(queueId, {
        title: 'Task 2',
        content: '# Task 2',
        type: 'new'
      });

      const task3 = await service.createTask(queueId, {
        title: 'Task 3',
        content: '# Task 3',
        type: 'new'
      });

      // Reorder: task3, task1, task2
      const reorderedTaskIds = [task3.id, task1.id, task2.id];
      const updatedQueue = await service.reorderTasks(queueId, reorderedTaskIds);

      expect(updatedQueue.tasks).toHaveLength(3);
      expect(updatedQueue.tasks[0].id).toBe(task3.id);
      expect(updatedQueue.tasks[0].order).toBe(0);
      expect(updatedQueue.tasks[1].id).toBe(task1.id);
      expect(updatedQueue.tasks[1].order).toBe(1);
      expect(updatedQueue.tasks[2].id).toBe(task2.id);
      expect(updatedQueue.tasks[2].order).toBe(2);
    });

    it('should not allow reordering with missing task IDs', async () => {
      const task1 = await service.createTask(queueId, {
        title: 'Task 1',
        content: '# Task 1',
        type: 'new'
      });

      await service.createTask(queueId, {
        title: 'Task 2',
        content: '# Task 2',
        type: 'new'
      });

      // Only provide one task ID when there are two tasks
      await expect(service.reorderTasks(queueId, [task1.id]))
        .rejects.toThrow('Task list must include all tasks in the queue');
    });

    it('should not allow reordering with invalid task IDs', async () => {
      await service.createTask(queueId, {
        title: 'Task 1',
        content: '# Task 1',
        type: 'new'
      });

      await expect(service.reorderTasks(queueId, ['invalid-id']))
        .rejects.toThrow('Invalid task IDs');
    });
  });

  describe('Status Management', () => {
    let queueId: string;
    let taskId: string;

    beforeEach(async () => {
      const queue = await service.createQueue({
        name: 'Test Queue',
        projectPath: '/test/project'
      });
      queueId = queue.id;

      const task = await service.createTask(queueId, {
        title: 'Test Task',
        content: '# Test Task',
        type: 'new'
      });
      taskId = task.id;
    });

    it('should update queue status', async () => {
      const now = new Date().toISOString();
      await service.updateQueueStatus(queueId, 'running', 0, now);

      const updated = await service.getQueueById(queueId);
      expect(updated?.status).toBe('running');
      expect(updated?.currentTaskIndex).toBe(0);
      expect(updated?.startedAt).toBe(now);
    });

    it('should update task status', async () => {
      const now = new Date().toISOString();
      await service.updateTaskStatus(
        taskId,
        'running',
        'session-123',
        'streaming-456',
        undefined,
        now
      );

      const updated = await service.getTaskById(taskId);
      expect(updated?.status).toBe('running');
      expect(updated?.sessionId).toBe('session-123');
      expect(updated?.streamingId).toBe('streaming-456');
      expect(updated?.startedAt).toBe(now);
    });

    it('should update task status with error', async () => {
      const errorMessage = 'Task execution failed';
      const now = new Date().toISOString();

      await service.updateTaskStatus(
        taskId,
        'failed',
        'session-123',
        'streaming-456',
        errorMessage,
        undefined,
        now
      );

      const updated = await service.getTaskById(taskId);
      expect(updated?.status).toBe('failed');
      expect(updated?.error).toBe(errorMessage);
      expect(updated?.completedAt).toBe(now);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when service not initialized', async () => {
      const uninitializedService = new TaskQueueService(':memory:');
      
      await expect(uninitializedService.createQueue({
        name: 'Test',
        projectPath: '/test'
      })).rejects.toThrow('TaskQueueService not initialized');
    });

    it('should throw error for non-existent queue operations', async () => {
      await expect(service.updateQueue('non-existent', { name: 'Test' }))
        .rejects.toThrow('Task queue not found');

      await expect(service.deleteQueue('non-existent'))
        .rejects.toThrow('Task queue not found');

      await expect(service.createTask('non-existent', {
        title: 'Test',
        content: 'Test',
        type: 'new'
      })).rejects.toThrow('Task queue not found');
    });

    it('should throw error for non-existent task operations', async () => {
      await expect(service.updateTask('non-existent', { title: 'Test' }))
        .rejects.toThrow('Task not found');

      await expect(service.deleteTask('non-existent'))
        .rejects.toThrow('Task not found');

      await expect(service.updateTaskStatus('non-existent', 'completed'))
        .rejects.toThrow('Task not found');
    });
  });

  describe('Database Integration', () => {
    it('should handle foreign key constraints', async () => {
      const queue = await service.createQueue({
        name: 'Test Queue',
        projectPath: '/test/project'
      });

      const task = await service.createTask(queue.id, {
        title: 'Test Task',
        content: '# Test Task',
        type: 'new'
      });

      // Delete queue should cascade delete tasks
      await service.deleteQueue(queue.id);

      // Task should no longer exist
      const retrievedTask = await service.getTaskById(task.id);
      expect(retrievedTask).toBeNull();
    });

    it('should maintain data consistency', async () => {
      const queue = await service.createQueue({
        name: 'Test Queue',
        projectPath: '/test/project'
      });

      // Create multiple tasks
      for (let i = 0; i < 5; i++) {
        await service.createTask(queue.id, {
          title: `Task ${i + 1}`,
          content: `# Task ${i + 1}`,
          type: 'new'
        });
      }

      // Retrieve queue with tasks
      const retrieved = await service.getQueueById(queue.id);
      expect(retrieved?.tasks).toHaveLength(5);
      
      // Tasks should be ordered correctly
      retrieved?.tasks.forEach((task, index) => {
        expect(task.order).toBe(index);
        expect(task.queueId).toBe(queue.id);
      });
    });
  });
});