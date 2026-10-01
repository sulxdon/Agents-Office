import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// Projects — each project is one floor in the 2D world.
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").default(""),
  icon: text("icon").default("🏢"),
  floorNumber: integer("floor_number").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  officeId: text("office_id"),
});

export const offices = sqliteTable("offices", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  teamId: text("team_id"),
  name: text("name").notNull(),
  x: real("x").notNull().default(0),
  y: real("y").notNull().default(0),
  width: real("width").notNull().default(420),
  height: real("height").notNull().default(300),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  avatar: text("avatar").default("🙂"),
  personalityPrompt: text("personality_prompt").default(""),
  model: text("model").default(""),
  skills: text("skills").default("[]"), // JSON array
  status: text("status").notNull().default("idle"),
  x: real("x").notNull().default(0),
  y: real("y").notNull().default(0),
  currentTaskId: text("current_task_id"),
});

export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  description: text("description").default(""),
  status: text("status").notNull().default("active"),
  priority: text("priority").notNull().default("medium"),
  createdBy: text("created_by").default("ceo"),
  createdAt: integer("created_at").notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").notNull(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  description: text("description").default(""),
  assigneeAgentId: text("assignee_agent_id"),
  status: text("status").notNull().default("todo"), // todo | doing | review | done | blocked
  dependencies: text("dependencies").default("[]"), // JSON array of task ids
  artifacts: text("artifacts").default("[]"), // JSON array
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  taskId: text("task_id"),
  agentId: text("agent_id"),
  projectId: text("project_id"),
  content: text("content").notNull(),
  type: text("type").notNull().default("chat"), // chat | thought | action | system
  createdAt: integer("created_at").notNull(),
});

export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  agentId: text("agent_id"), // null = project-level memory
  type: text("type").notNull().default("fact"), // decision | fact | artifact | learning
  content: text("content").notNull(),
  embedding: text("embedding").default(""), // JSON vector (empty when embeddings unavailable)
  createdAt: integer("created_at").notNull(),
});

export const activities = sqliteTable("activities", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  type: text("type").notNull().default("info"),
  description: text("description").notNull(),
  timestamp: integer("timestamp").notNull(),
});

export const whiteboards = sqliteTable("whiteboards", {
  id: text("id").primaryKey(),
  officeId: text("office_id").notNull(),
  content: text("content").notNull().default(""),
  updatedAt: integer("updated_at").notNull(),
});

// Durable SSE outbox: every published event is written here so replays,
// reconnects, and poll reconciliation survive restarts. Capped per project.
export const eventsOutbox = sqliteTable("events_outbox", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  kind: text("kind").notNull(),
  payload: text("payload").notNull().default("{}"),
  timestamp: integer("timestamp").notNull(),
});

// API usage ledger (G6): one row per LLM call. Capped at USAGE_ROW_CAP newest rows per project.
export const llmCalls = sqliteTable("llm_calls", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  provider: text("provider").notNull().default(""),
  model: text("model").notNull().default(""),
  agentName: text("agent_name"),
  taskId: text("task_id"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cost: real("cost").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  ok: integer("ok").notNull().default(1), // 1 = success, 0 = failed
  error: text("error"),
  timestamp: integer("timestamp").notNull(),
});
