// Skill-based task assignment: score each agent against a task's keywords,
// preferring skill overlap, then role match, then current availability.

export interface Candidate {
  id: string;
  role: string;
  skills: string[];
  status: string;
  openTasks: number;
}

const ROLE_KEYWORDS: Record<string, string[]> = {
  developer: ["code", "build", "implement", "api", "frontend", "backend", "app", "feature", "fix", "bug", "deploy", "test"],
  designer: ["design", "ui", "ux", "layout", "hero", "mockup", "style", "brand", "figma", "visual"],
  researcher: ["research", "search", "analyze", "survey", "compare", "investigate", "find", "study"],
  qa: ["qa", "test", "verify", "check", "review", "audit", "quality", "validate"],
  writer: ["write", "copy", "docs", "document", "blog", "content", "release", "notes", "readme"],
  marketer: ["market", "seo", "social", "campaign", "launch", "growth", "ads"],
  manager: ["plan", "coordinate", "delegate", "review", "manage"],
};

export function scoreAgent(taskText: string, agent: Candidate): number {
  const text = taskText.toLowerCase();
  let score = 0;
  for (const skill of agent.skills) {
    const s = skill.toLowerCase();
    if (text.includes(s) || s.split(/[\s-]+/).some((w) => w.length > 2 && text.includes(w))) score += 3;
  }
  const roleKeys = ROLE_KEYWORDS[agent.role.toLowerCase()] ?? [];
  for (const k of roleKeys) if (text.includes(k)) score += 2;
  if (agent.status === "idle") score += 1;
  if (agent.status === "blocked") score -= 5;
  score -= Math.min(agent.openTasks, 5); // prefer less-loaded agents
  if (agent.role.toLowerCase() === "manager") score -= 4; // managers delegate, rarely execute
  return score;
}

export function assignTask(taskText: string, candidates: Candidate[]): Candidate | null {
  if (candidates.length === 0) return null;
  const ranked = [...candidates].sort((a, b) => scoreAgent(taskText, b) - scoreAgent(taskText, a));
  return ranked[0];
}
