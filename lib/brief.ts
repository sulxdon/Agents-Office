// Pure helpers for the G4 Artifacts view and G5 Manager Brief.
// Client-safe: no node imports, so panels and tests share this module.

export interface BriefGoal {
  id: string;
  title: string;
  status: string;
}

export interface BriefTask {
  id: string;
  goalId: string;
  title: string;
  status: string;
  assigneeAgentId: string | null;
  assigneeName: string | null;
  updatedAt: number;
  artifacts: string[];
}

export interface BriefSection {
  goal: BriefGoal;
  tasks: BriefTask[];
}

const UNGROUPED: BriefGoal = { id: "__ungrouped", title: "Other tasks", status: "" };

/**
 * Group tasks under their goals (tasks newest-first). Tasks whose goal is
 * missing land in a trailing "Other tasks" section. Pure + tested.
 */
export function groupTasksByGoal(goals: BriefGoal[], tasks: BriefTask[]): BriefSection[] {
  const byGoal = new Map<string, BriefTask[]>();
  for (const g of goals) byGoal.set(g.id, []);
  const orphans: BriefTask[] = [];
  for (const t of tasks) {
    const bucket = byGoal.get(t.goalId);
    if (bucket) bucket.push(t);
    else orphans.push(t);
  }
  const byUpdatedDesc = (a: BriefTask, b: BriefTask) => b.updatedAt - a.updatedAt;
  const sections = goals.map((goal) => ({
    goal,
    tasks: (byGoal.get(goal.id) ?? []).sort(byUpdatedDesc),
  }));
  if (orphans.length > 0) sections.push({ goal: UNGROUPED, tasks: orphans.sort(byUpdatedDesc) });
  return sections;
}

export interface BriefCounts {
  total: number;
  todo: number;
  doing: number;
  review: number;
  done: number;
  blocked: number;
  /** Approvals = tasks currently done. */
  approvals: number;
  /** Revisions = manager revision-feedback messages (counted from task threads). */
  revisions: number;
}

/** Status counts + plan progress for the brief header. Pure + tested. */
export function summarizeBrief(tasks: Pick<BriefTask, "status">[], revisionCount: number): BriefCounts {
  const counts: BriefCounts = {
    total: tasks.length,
    todo: 0,
    doing: 0,
    review: 0,
    done: 0,
    blocked: 0,
    approvals: 0,
    revisions: Math.max(0, revisionCount),
  };
  for (const t of tasks) {
    if (t.status === "todo") counts.todo++;
    else if (t.status === "doing") counts.doing++;
    else if (t.status === "review") counts.review++;
    else if (t.status === "done") counts.done++;
    else if (t.status === "blocked") counts.blocked++;
    else counts.todo++;
  }
  counts.approvals = counts.done;
  return counts;
}

export interface ArtifactRow {
  file: string;
  taskId: string | null;
  taskTitle: string | null;
  agentName: string | null;
  updatedAt: number | null;
}

/**
 * Flatten every task's artifact list into file-browser rows (newest first).
 * The name lookup is injected so this stays pure. Pure + tested.
 */
export function collectArtifactRows(
  tasks: {
    id: string;
    title: string;
    assigneeAgentId: string | null;
    updatedAt: number;
    artifacts: string[];
  }[],
  agentName: (id: string | null) => string | null
): ArtifactRow[] {
  const rows: ArtifactRow[] = [];
  for (const t of tasks) {
    for (const file of t.artifacts ?? []) {
      rows.push({
        file,
        taskId: t.id,
        taskTitle: t.title,
        agentName: agentName(t.assigneeAgentId),
        updatedAt: t.updatedAt,
      });
    }
  }
  return rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

/**
 * Add rows for server-side files that no task links (unlinked orphans).
 * Pure + tested.
 */
export function mergeServerFiles(rows: ArtifactRow[], serverFiles: string[]): ArtifactRow[] {
  const known = new Set(rows.map((r) => r.file));
  const extra = serverFiles
    .filter((f) => !known.has(f))
    .map((file) => ({ file, taskId: null, taskTitle: null, agentName: null, updatedAt: null }));
  return [...rows, ...extra];
}
