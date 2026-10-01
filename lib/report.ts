// Pure Markdown project-report builder (server route + tests share this).

export interface ReportProject {
  id: string;
  name: string;
  description?: string | null;
}

export interface ReportGoal {
  title: string;
  status?: string | null;
  priority?: string | null;
}

export interface ReportTask {
  title: string;
  status?: string | null;
  assigneeAgentId?: string | null;
  assigneeName?: string | null;
}

export interface ReportMemory {
  type?: string | null;
  content: string;
  createdAt: number;
}

export interface ReportActivity {
  type?: string | null;
  description: string;
  timestamp: number;
}

export interface ReportInput {
  project: ReportProject;
  goals: ReportGoal[];
  tasks: ReportTask[];
  memories: ReportMemory[];
  activities: ReportActivity[];
  /** Session spend in USD (tracked client-side, passed as a query param). */
  spend: number;
  generatedAt?: number;
}

const TASK_ORDER = ["todo", "doing", "review", "blocked", "done"] as const;

function esc(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function buildProjectReport(input: ReportInput): string {
  const { project, goals, tasks, memories, activities, spend } = input;
  const at = new Date(input.generatedAt ?? Date.now()).toISOString();
  const lines: string[] = [];
  lines.push(`# ${project.name} — Project Report`);
  lines.push("");
  if (project.description) {
    lines.push(`> ${esc(project.description)}`);
    lines.push("");
  }
  lines.push(`_Generated ${at}_`);
  lines.push("");
  lines.push("## Goals");
  lines.push("");
  if (goals.length === 0) {
    lines.push("- _No goals yet._");
  } else {
    for (const g of goals) {
      lines.push(`- **${esc(g.title)}** — ${esc(g.status ?? "active")} (priority: ${esc(g.priority ?? "medium")})`);
    }
  }
  lines.push("");
  lines.push("## Tasks by status");
  lines.push("");
  if (tasks.length === 0) {
    lines.push("_No tasks yet._");
  } else {
    for (const status of TASK_ORDER) {
      const group = tasks.filter((t) => (t.status ?? "todo") === status);
      if (group.length === 0) continue;
      lines.push(`### ${status} (${group.length})`);
      lines.push("");
      for (const t of group) {
        const who = t.assigneeName || t.assigneeAgentId || "Unassigned";
        lines.push(`- ${esc(t.title)} _(${esc(who)})_`);
      }
      lines.push("");
    }
  }
  lines.push("## Memories");
  lines.push("");
  if (memories.length === 0) {
    lines.push("_No memories recorded._");
  } else {
    const recent = [...memories].sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
    for (const m of recent) {
      lines.push(`- **[${esc(m.type ?? "fact")}]** ${esc(m.content)}`);
    }
  }
  lines.push("");
  lines.push("## Recent activity");
  lines.push("");
  if (activities.length === 0) {
    lines.push("_No activity yet._");
  } else {
    const recent = [...activities].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
    for (const a of recent) {
      lines.push(`- _${new Date(a.timestamp).toISOString()}_ **[${esc(a.type ?? "info")}]** ${esc(a.description)}`);
    }
  }
  lines.push("");
  lines.push("## Session spend");
  lines.push("");
  lines.push(`$${spend.toFixed(4)} USD (estimated, this session)`);
  lines.push("");
  return lines.join("\n");
}
