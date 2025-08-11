import fs from "fs";
import path from "path";
import os from "os";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { EventEmitter } from "events";
import type {
  Task,
  TaskQueue,
  TaskQueueSummary,
  TaskQueueListQuery,
  CreateTaskQueueRequest,
  UpdateTaskQueueRequest,
  CreateTaskRequest,
  UpdateTaskRequest,
} from "@/types/index.js";
import { CUIError } from "@/types/index.js";
import { createLogger } from "./logger.js";
import { type Logger } from "./logger.js";

type TaskQueueRow = {
  id: string;
  name: string;
  project_path: string;
  description: string | null;
  status: string;
  current_task_index: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};

type TaskRow = {
  id: string;
  queue_id: string;
  title: string;
  content: string;
  type: string;
  order_index: number;
  status: string;
  session_id: string | null;
  streaming_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};

/**
 * TaskQueueService manages task queues using SQLite backend
 * Stores queue and task data in ~/.cui/task-queues.db
 * Provides CRUD operations and execution management for task queues
 */
export class TaskQueueService extends EventEmitter {
  private static instance: TaskQueueService;
  private logger: Logger;
  private dbPath!: string;
  private configDir!: string;
  private isInitialized = false;
  private db!: Database.Database;

  // Queue statements
  private getQueueStmt!: Database.Statement;
  private insertQueueStmt!: Database.Statement;
  private updateQueueStmt!: Database.Statement;
  private deleteQueueStmt!: Database.Statement;
  private listQueuesStmt!: Database.Statement;
  private countQueuesStmt!: Database.Statement;

  // Task statements
  private getTaskStmt!: Database.Statement;
  private getTasksByQueueStmt!: Database.Statement;
  private insertTaskStmt!: Database.Statement;
  private updateTaskStmt!: Database.Statement;
  private deleteTaskStmt!: Database.Statement;
  private getMaxOrderStmt!: Database.Statement;
  private updateTaskOrderStmt!: Database.Statement;

  // Metadata statements
  private setMetadataStmt!: Database.Statement;
  private getMetadataStmt!: Database.Statement;

  constructor(customConfigDir?: string) {
    super();
    this.logger = createLogger("TaskQueueService");
    this.initializePaths(customConfigDir);
  }

  static getInstance(): TaskQueueService {
    if (!TaskQueueService.instance) {
      TaskQueueService.instance = new TaskQueueService();
    }
    return TaskQueueService.instance;
  }

  static resetInstance(): void {
    if (TaskQueueService.instance) {
      TaskQueueService.instance.isInitialized = false;
      if (TaskQueueService.instance.db) {
        TaskQueueService.instance.db.close();
      }
    }
    TaskQueueService.instance = null as unknown as TaskQueueService;
  }

  private initializePaths(customConfigDir?: string): void {
    if (customConfigDir) {
      if (customConfigDir === ":memory:") {
        this.configDir = ":memory:";
        this.dbPath = ":memory:";
        return;
      }
      this.configDir = path.join(customConfigDir, ".cui");
    } else {
      this.configDir = path.join(os.homedir(), ".cui");
    }
    this.dbPath = path.join(this.configDir, "task-queues.db");

    this.logger.debug("Initializing paths", {
      configDir: this.configDir,
      dbPath: this.dbPath,
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      if (this.dbPath !== ":memory:" && !fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
        this.logger.debug("Created config directory", { dir: this.configDir });
      }

      this.db = new Database(this.dbPath);
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("foreign_keys = ON");

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS task_queues (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          project_path TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL DEFAULT 'draft',
          current_task_index INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT
        );
        
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          queue_id TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('new', 'fork')),
          order_index INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
          session_id TEXT,
          streaming_id TEXT,
          error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT,
          FOREIGN KEY (queue_id) REFERENCES task_queues (id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS task_queue_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        -- Indexes for better performance
        CREATE INDEX IF NOT EXISTS idx_task_queues_project_path ON task_queues(project_path);
        CREATE INDEX IF NOT EXISTS idx_task_queues_status ON task_queues(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_queue_id ON tasks(queue_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_order ON tasks(queue_id, order_index);
      `);

      this.prepareStatements();
      this.ensureMetadata();
      this.isInitialized = true;

      this.logger.debug("TaskQueueService initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize task queue database", error);
      throw new CUIError(
        "TASK_QUEUE_INIT_FAILED",
        `Task queue database initialization failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        500
      );
    }
  }

  private prepareStatements(): void {
    // Queue statements
    this.getQueueStmt = this.db.prepare(
      "SELECT * FROM task_queues WHERE id = ?"
    );
    this.insertQueueStmt = this.db.prepare(`
      INSERT INTO task_queues (
        id, name, project_path, description, status, current_task_index, created_at, updated_at
      ) VALUES (
        @id, @name, @project_path, @description, @status, @current_task_index, @created_at, @updated_at
      )
    `);
    this.updateQueueStmt = this.db.prepare(`
      UPDATE task_queues SET
        name = @name,
        description = @description,
        status = @status,
        current_task_index = @current_task_index,
        updated_at = @updated_at,
        started_at = @started_at,
        completed_at = @completed_at
      WHERE id = @id
    `);
    this.deleteQueueStmt = this.db.prepare(
      "DELETE FROM task_queues WHERE id = ?"
    );
    this.listQueuesStmt = this.db.prepare(`
      SELECT 
        tq.*,
        COUNT(t.id) as task_count,
        COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
        COUNT(CASE WHEN t.status = 'failed' THEN 1 END) as failed_tasks
      FROM task_queues tq
      LEFT JOIN tasks t ON tq.id = t.queue_id
      WHERE (? IS NULL OR tq.project_path = ?)
        AND (? IS NULL OR tq.status = ?)
      GROUP BY tq.id
      ORDER BY 
        CASE WHEN ? = 'name' THEN tq.name END,
        CASE WHEN ? = 'created' THEN tq.created_at END,
        CASE WHEN ? = 'updated' THEN tq.updated_at END
      LIMIT ? OFFSET ?
    `);
    this.countQueuesStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM task_queues
      WHERE (? IS NULL OR project_path = ?)
        AND (? IS NULL OR status = ?)
    `);

    // Task statements
    this.getTaskStmt = this.db.prepare("SELECT * FROM tasks WHERE id = ?");
    this.getTasksByQueueStmt = this.db.prepare(
      "SELECT * FROM tasks WHERE queue_id = ? ORDER BY order_index ASC"
    );
    this.insertTaskStmt = this.db.prepare(`
      INSERT INTO tasks (
        id, queue_id, title, content, type, order_index, status, created_at, updated_at
      ) VALUES (
        @id, @queue_id, @title, @content, @type, @order_index, @status, @created_at, @updated_at
      )
    `);
    this.updateTaskStmt = this.db.prepare(`
      UPDATE tasks SET
        title = @title,
        content = @content,
        type = @type,
        order_index = @order_index,
        status = @status,
        session_id = @session_id,
        streaming_id = @streaming_id,
        error = @error,
        updated_at = @updated_at,
        started_at = @started_at,
        completed_at = @completed_at
      WHERE id = @id
    `);
    this.deleteTaskStmt = this.db.prepare("DELETE FROM tasks WHERE id = ?");
    this.getMaxOrderStmt = this.db.prepare(
      "SELECT COALESCE(MAX(order_index), -1) + 1 as next_order FROM tasks WHERE queue_id = ?"
    );
    this.updateTaskOrderStmt = this.db.prepare(
      "UPDATE tasks SET order_index = @order_index, updated_at = @updated_at WHERE id = @id"
    );

    // Metadata statements
    this.setMetadataStmt = this.db.prepare(
      "INSERT INTO task_queue_metadata (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    );
    this.getMetadataStmt = this.db.prepare(
      "SELECT value FROM task_queue_metadata WHERE key = ?"
    );
  }

  private ensureMetadata(): void {
    const now = new Date().toISOString();
    const schema = this.getMetadataStmt.get("schema_version") as
      | { value?: string }
      | undefined;
    if (!schema) {
      this.setMetadataStmt.run({ key: "schema_version", value: "1" });
      this.setMetadataStmt.run({ key: "created_at", value: now });
      this.setMetadataStmt.run({ key: "last_updated", value: now });
    }
  }

  private mapQueueRow(
    row: TaskQueueRow & {
      task_count?: number;
      completed_tasks?: number;
      failed_tasks?: number;
    }
  ): TaskQueue | TaskQueueSummary {
    const base = {
      id: row.id,
      name: row.name,
      projectPath: row.project_path,
      description: row.description || undefined,
      status: row.status as TaskQueue["status"],
      currentTaskIndex: row.current_task_index,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined,
    };

    // If we have task count info, return as summary
    if (typeof row.task_count !== "undefined") {
      return {
        ...base,
        taskCount: row.task_count,
        completedTasks: row.completed_tasks || 0,
        failedTasks: row.failed_tasks || 0,
      } as TaskQueueSummary;
    }

    // Otherwise return as full queue (tasks will be loaded separately)
    return {
      ...base,
      tasks: [], // Will be populated by caller if needed
    } as TaskQueue;
  }

  private mapTaskRow(row: TaskRow): Task {
    return {
      id: row.id,
      queueId: row.queue_id,
      title: row.title,
      content: row.content,
      type: row.type as "new" | "fork",
      order: row.order_index,
      status: row.status as Task["status"],
      sessionId: row.session_id || undefined,
      streamingId: row.streaming_id || undefined,
      error: row.error || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined,
    };
  }

  // Queue CRUD operations
  async createQueue(request: CreateTaskQueueRequest): Promise<TaskQueue> {
    if (!this.isInitialized) {
      throw new CUIError(
        "SERVICE_NOT_INITIALIZED",
        "TaskQueueService not initialized",
        500
      );
    }

    const now = new Date().toISOString();
    const id = uuidv4();

    try {
      this.insertQueueStmt.run({
        id,
        name: request.name,
        project_path: request.projectPath,
        description: request.description || null,
        status: "draft",
        current_task_index: 0,
        created_at: now,
        updated_at: now,
      });

      const queue = await this.getQueueById(id);
      if (!queue) {
        throw new CUIError(
          "QUEUE_CREATE_FAILED",
          "Failed to create queue",
          500
        );
      }

      this.logger.debug("Created task queue", {
        id,
        name: request.name,
        projectPath: request.projectPath,
      });
      return queue;
    } catch (error) {
      this.logger.error("Failed to create queue", error);
      if (error instanceof CUIError) {
        throw error;
      }
      throw new CUIError(
        "QUEUE_CREATE_FAILED",
        `Failed to create queue: ${
          error instanceof Error ? error.message : String(error)
        }`,
        500
      );
    }
  }

  async getQueueById(id: string): Promise<TaskQueue | null> {
    if (!this.isInitialized) {
      throw new CUIError(
        "SERVICE_NOT_INITIALIZED",
        "TaskQueueService not initialized",
        500
      );
    }

    try {
      const row = this.getQueueStmt.get(id) as TaskQueueRow | undefined;
      if (!row) {
        return null;
      }

      const queue = this.mapQueueRow(row) as TaskQueue;

      // Load tasks for this queue
      const taskRows = this.getTasksByQueueStmt.all(id) as TaskRow[];
      queue.tasks = taskRows.map((taskRow) => this.mapTaskRow(taskRow));

      return queue;
    } catch (error) {
      this.logger.error("Failed to get queue by ID", error);
      throw new CUIError(
        "QUEUE_GET_FAILED",
        `Failed to get queue: ${
          error instanceof Error ? error.message : String(error)
        }`,
        500
      );
    }
  }

  async updateQueue(
    id: string,
    request: UpdateTaskQueueRequest
  ): Promise<TaskQueue> {
    if (!this.isInitialized) {
      throw new CUIError(
        "SERVICE_NOT_INITIALIZED",
        "TaskQueueService not initialized",
        500
      );
    }

    const existingQueue = await this.getQueueById(id);
    if (!existingQueue) {
      throw new CUIError("QUEUE_NOT_FOUND", "Task queue not found", 404);
    }

    const now = new Date().toISOString();

    try {
      this.updateQueueStmt.run({
        id,
        name: request.name ?? existingQueue.name,
        description: request.description ?? existingQueue.description ?? null,
        status: existingQueue.status,
        current_task_index: existingQueue.currentTaskIndex,
        updated_at: now,
        started_at: existingQueue.startedAt || null,
        completed_at: existingQueue.completedAt || null,
      });

      const updatedQueue = await this.getQueueById(id);
      if (!updatedQueue) {
        throw new CUIError(
          "QUEUE_UPDATE_FAILED",
          "Failed to update queue",
          500
        );
      }

      this.logger.debug("Updated task queue", { id, changes: request });
      return updatedQueue;
    } catch (error) {
      this.logger.error("Failed to update queue", error);
      if (error instanceof CUIError) {
        throw error;
      }
      throw new CUIError(
        "QUEUE_UPDATE_FAILED",
        `Failed to update queue: ${
          error instanceof Error ? error.message : String(error)
        }`,
        500
      );
    }
  }

  async deleteQueue(id: string): Promise<void> {
    if (!this.isInitialized) {
      throw new CUIError(
        "SERVICE_NOT_INITIALIZED",
        "TaskQueueService not initialized",
        500
      );
    }

    const existingQueue = await this.getQueueById(id);
    if (!existingQueue) {
      throw new CUIError("QUEUE_NOT_FOUND", "Task queue not found", 404);
    }

    // Don't allow deletion of running queues
    if (existingQueue.status === "running") {
      throw new CUIError("QUEUE_RUNNING", "Cannot delete running queue", 400);
    }

    try {
      this.deleteQueueStmt.run(id);
      this.logger.debug("Deleted task queue", { id, name: existingQueue.name });
    } catch (error) {
      this.logger.error("Failed to delete queue", error);
      throw new CUIError(
        "QUEUE_DELETE_FAILED",
        `Failed to delete queue: ${
          error instanceof Error ? error.message : String(error)
        }`,
        500
      );
    }
  }

  async listQueues(
    query: TaskQueueListQuery = {}
  ): Promise<{ queues: TaskQueueSummary[]; total: number }> {
    if (!this.isInitialized) {
      throw new CUIError(
        "SERVICE_NOT_INITIALIZED",
        "TaskQueueService not initialized",
        500
      );
    }

    const {
      projectPath,
      status,
      limit = 20,
      offset = 0,
      sortBy = "updated",
      order = "desc",
    } = query;

    try {
      // Get total count
      const countResult = this.countQueuesStmt.get(
        projectPath,
        projectPath,
        status,
        status
      ) as { count: number };
      const total = countResult.count;

      // Get queues with task counts
      const rows = this.listQueuesStmt.all(
        projectPath,
        projectPath,
        status,
        status,
        sortBy,
        sortBy,
        sortBy,
        limit,
        offset
      ) as (TaskQueueRow & {
        task_count: number;
        completed_tasks: number;
        failed_tasks: number;
      })[];

      const queues = rows.map(
        (row) => this.mapQueueRow(row) as TaskQueueSummary
      );

      return { queues, total };
    } catch (error) {
      this.logger.error("Failed to list queues", error);
      throw new CUIError(
        "QUEUE_LIST_FAILED",
        `Failed to list queues: ${
          error instanceof Error ? error.message : String(error)
        }`,
        500
      );
    }
  }

  // Task CRUD operations
  async createTask(queueId: string, request: CreateTaskRequest): Promise<Task> {
    if (!this.isInitialized) {
      throw new CUIError(
        "SERVICE_NOT_INITIALIZED",
        "TaskQueueService not initialized",
        500
      );
    }

    const queue = await this.getQueueById(queueId);
    if (!queue) {
      throw new CUIError("QUEUE_NOT_FOUND", "Task queue not found", 404);
    }

    // Don't allow adding tasks to running queues
    if (queue.status === "running") {
      throw new CUIError(
        "QUEUE_RUNNING",
        "Cannot add tasks to running queue",
        400
      );
    }

    const now = new Date().toISOString();
    const id = uuidv4();

    // Get next order index if not provided
    let orderIndex = request.order;
    if (orderIndex === undefined) {
      const result = this.getMaxOrderStmt.get(queueId) as {
        next_order: number;
      };
      orderIndex = result.next_order;
    }

    try {
      this.insertTaskStmt.run({
        id,
        queue_id: queueId,
        title: request.title,
        content: request.content,
        type: request.type,
        order_index: orderIndex,
        status: "pending",
        created_at: now,
        updated_at: now,
      });

      const task = await this.getTaskById(id);
      if (!task) {
        throw new CUIError("TASK_CREATE_FAILED", "Failed to create task", 500);
      }

      this.logger.debug("Created task", {
        id,
        queueId,
        title: request.title,
        type: request.type,
      });
      return task;
    } catch (error) {
      this.logger.error("Failed to create task", error);
      if (error instanceof CUIError) {
        throw error;
      }
      throw new CUIError(
        "TASK_CREATE_FAILED",
        `Failed to create task: ${
          error instanceof Error ? error.message : String(error)
        }`,
        500
      );
    }
  }

  async getTaskById(id: string): Promise<Task | null> {
    if (!this.isInitialized) {
      throw new CUIError(
        "SERVICE_NOT_INITIALIZED",
        "TaskQueueService not initialized",
        500
      );
    }

    try {
      const row = this.getTaskStmt.get(id) as TaskRow | undefined;
      return row ? this.mapTaskRow(row) : null;
    } catch (error) {
      this.logger.error("Failed to get task by ID", error);
      throw new CUIError(
        "TASK_GET_FAILED",
        `Failed to get task: ${
          error instanceof Error ? error.message : String(error)
        }`,
        500
      );
    }
  }

  async updateTask(id: string, request: UpdateTaskRequest): Promise<Task> {
    if (!this.isInitialized) {
      throw new CUIError(
        "SERVICE_NOT_INITIALIZED",
        "TaskQueueService not initialized",
        500
      );
    }

    const existingTask = await this.getTaskById(id);
    if (!existingTask) {
      throw new CUIError("TASK_NOT_FOUND", "Task not found", 404);
    }

    const now = new Date().toISOString();

    try {
      this.updateTaskStmt.run({
        id,
        title: request.title ?? existingTask.title,
        content: request.content ?? existingTask.content,
        type: request.type ?? existingTask.type,
        order_index: existingTask.order,
        status: existingTask.status,
        session_id: existingTask.sessionId || null,
        streaming_id: existingTask.streamingId || null,
        error: existingTask.error || null,
        updated_at: now,
        started_at: existingTask.startedAt || null,
        completed_at: existingTask.completedAt || null,
      });

      const updatedTask = await this.getTaskById(id);
      if (!updatedTask) {
        throw new CUIError("TASK_UPDATE_FAILED", "Failed to update task", 500);
      }

      this.logger.debug("Updated task", { id, changes: request });
      return updatedTask;
    } catch (error) {
      this.logger.error("Failed to update task", error);
      if (error instanceof CUIError) {
        throw error;
      }
      throw new CUIError(
        "TASK_UPDATE_FAILED",
        `Failed to update task: ${
          error instanceof Error ? error.message : String(error)
        }`,
        500
      );
    }
  }

  async deleteTask(id: string): Promise<void> {
    if (!this.isInitialized) {
      throw new CUIError(
        "SERVICE_NOT_INITIALIZED",
        "TaskQueueService not initialized",
        500
      );
    }

    const existingTask = await this.getTaskById(id);
    if (!existingTask) {
      throw new CUIError("TASK_NOT_FOUND", "Task not found", 404);
    }

    // Don't allow deletion of running tasks
    if (existingTask.status === "running") {
      throw new CUIError("TASK_RUNNING", "Cannot delete running task", 400);
    }

    try {
      this.deleteTaskStmt.run(id);
      this.logger.debug("Deleted task", { id, title: existingTask.title });
    } catch (error) {
      this.logger.error("Failed to delete task", error);
      throw new CUIError(
        "TASK_DELETE_FAILED",
        `Failed to delete task: ${
          error instanceof Error ? error.message : String(error)
        }`,
        500
      );
    }
  }

  async reorderTasks(queueId: string, taskIds: string[]): Promise<TaskQueue> {
    if (!this.isInitialized) {
      throw new CUIError(
        "SERVICE_NOT_INITIALIZED",
        "TaskQueueService not initialized",
        500
      );
    }

    const queue = await this.getQueueById(queueId);
    if (!queue) {
      throw new CUIError("QUEUE_NOT_FOUND", "Task queue not found", 404);
    }

    // Don't allow reordering of running queues
    if (queue.status === "running") {
      throw new CUIError(
        "QUEUE_RUNNING",
        "Cannot reorder tasks in running queue",
        400
      );
    }

    // Verify all task IDs belong to this queue
    const existingTaskIds = queue.tasks.map((t) => t.id);
    const invalidIds = taskIds.filter((id) => !existingTaskIds.includes(id));
    if (invalidIds.length > 0) {
      throw new CUIError(
        "INVALID_TASK_IDS",
        `Invalid task IDs: ${invalidIds.join(", ")}`,
        400
      );
    }

    if (taskIds.length !== existingTaskIds.length) {
      throw new CUIError(
        "INCOMPLETE_TASK_LIST",
        "Task list must include all tasks in the queue",
        400
      );
    }

    const now = new Date().toISOString();

    try {
      const transaction = this.db.transaction(() => {
        taskIds.forEach((taskId, index) => {
          this.updateTaskOrderStmt.run({
            id: taskId,
            order_index: index,
            updated_at: now,
          });
        });
      });

      transaction();

      const updatedQueue = await this.getQueueById(queueId);
      if (!updatedQueue) {
        throw new CUIError(
          "QUEUE_UPDATE_FAILED",
          "Failed to update queue after reordering",
          500
        );
      }

      this.logger.debug("Reordered tasks", { queueId, taskIds });
      return updatedQueue;
    } catch (error) {
      this.logger.error("Failed to reorder tasks", error);
      if (error instanceof CUIError) {
        throw error;
      }
      throw new CUIError(
        "TASK_REORDER_FAILED",
        `Failed to reorder tasks: ${
          error instanceof Error ? error.message : String(error)
        }`,
        500
      );
    }
  }

  // Internal methods for queue execution (will be used by execution service)
  async updateQueueStatus(
    id: string,
    status: TaskQueue["status"],
    currentTaskIndex?: number,
    startedAt?: string,
    completedAt?: string
  ): Promise<void> {
    if (!this.isInitialized) {
      throw new CUIError(
        "SERVICE_NOT_INITIALIZED",
        "TaskQueueService not initialized",
        500
      );
    }

    const existingQueue = await this.getQueueById(id);
    if (!existingQueue) {
      throw new CUIError("QUEUE_NOT_FOUND", "Task queue not found", 404);
    }

    const now = new Date().toISOString();

    try {
      this.updateQueueStmt.run({
        id,
        name: existingQueue.name,
        description: existingQueue.description || null,
        status,
        current_task_index: currentTaskIndex ?? existingQueue.currentTaskIndex,
        updated_at: now,
        started_at: startedAt || existingQueue.startedAt || null,
        completed_at: completedAt || existingQueue.completedAt || null,
      });

      this.logger.debug("Updated queue status", {
        id,
        status,
        currentTaskIndex,
      });
    } catch (error) {
      this.logger.error("Failed to update queue status", error);
      throw new CUIError(
        "QUEUE_STATUS_UPDATE_FAILED",
        `Failed to update queue status: ${
          error instanceof Error ? error.message : String(error)
        }`,
        500
      );
    }
  }

  async updateTaskStatus(
    id: string,
    status: Task["status"],
    sessionId?: string,
    streamingId?: string,
    error?: string,
    startedAt?: string,
    completedAt?: string
  ): Promise<void> {
    if (!this.isInitialized) {
      throw new CUIError(
        "SERVICE_NOT_INITIALIZED",
        "TaskQueueService not initialized",
        500
      );
    }

    const existingTask = await this.getTaskById(id);
    if (!existingTask) {
      throw new CUIError("TASK_NOT_FOUND", "Task not found", 404);
    }

    const now = new Date().toISOString();

    try {
      const finalSessionId = sessionId || existingTask.sessionId || null;
      const finalStreamingId = streamingId || existingTask.streamingId || null;

      this.updateTaskStmt.run({
        id,
        title: existingTask.title,
        content: existingTask.content,
        type: existingTask.type,
        order_index: existingTask.order,
        status,
        session_id: finalSessionId,
        streaming_id: finalStreamingId,
        error: error || null,
        updated_at: now,
        started_at: startedAt || existingTask.startedAt || null,
        completed_at: completedAt || existingTask.completedAt || null,
      });

      this.logger.debug("Updated task status", {
        id,
        status,
        sessionId,
        streamingId,
      });

      // Emit task status change event for real-time updates
      this.emit("taskStatusChanged", {
        taskId: id,
        queueId: existingTask.queueId,
        status,
        sessionId,
        streamingId,
        error,
      });
    } catch (error) {
      this.logger.error("Failed to update task status", error);
      throw new CUIError(
        "TASK_STATUS_UPDATE_FAILED",
        `Failed to update task status: ${
          error instanceof Error ? error.message : String(error)
        }`,
        500
      );
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.logger.debug("Database connection closed");
    }
  }
}
