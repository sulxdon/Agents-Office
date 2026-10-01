import fs from "node:fs";
import path from "node:path";
import { getDb, persistDb } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { publish } from "@/lib/sse-bus";

const ARTIFACTS_ROOT = path.join(process.cwd(), "data", "artifacts");
const MAX_BYTES = 200_000;

/**
 * Validate an artifact filename. Returns the trimmed name, or throws.
 * Rejects path traversal (/, \, ..), hidden files, empty names, and
 * anything outside a conservative [word, dot, dash, space] charset.
 */
export function sanitizeArtifactName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("artifact filename is empty");
  if (trimmed.length > 128) throw new Error("artifact filename too long");
  if (trimmed.includes("\0")) throw new Error("artifact filename contains null byte");
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    throw new Error("artifact filename must not contain path separators");
  }
  if (trimmed.startsWith(".")) throw new Error("artifact filename must not be hidden");
  if (!/^[\w.\- ]+$/.test(trimmed)) throw new Error("artifact filename has invalid characters");
  return trimmed;
}

function sanitizeProjectId(projectId: string): string {
  const trimmed = projectId.trim();
  if (!trimmed || trimmed.length > 128) throw new Error("bad project id");
  if (!/^[\w-]+$/.test(trimmed)) throw new Error("bad project id");
  return trimmed;
}

function dirFor(projectId: string): string {
  return path.join(ARTIFACTS_ROOT, sanitizeProjectId(projectId));
}

/** Persist an artifact file and append it to the task's artifacts JSON list. */
export async function writeArtifact(
  projectId: string,
  taskId: string | null,
  filename: string,
  content: string
): Promise<string> {
  const safe = sanitizeArtifactName(filename);
  const dir = dirFor(projectId);
  fs.mkdirSync(dir, { recursive: true });
  const full = path.join(dir, safe);
  if (path.relative(dir, full).startsWith("..")) throw new Error("artifact path escapes project dir");
  fs.writeFileSync(full, content.slice(0, MAX_BYTES), "utf-8");

  if (taskId) {
    try {
      const db = await getDb();
      const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      if (row) {
        let list: string[] = [];
        try {
          const parsed = JSON.parse(row.artifacts ?? "[]");
          if (Array.isArray(parsed)) list = parsed.map(String);
        } catch {
          list = [];
        }
        if (!list.includes(safe)) list.push(safe);
        await db.update(tasks).set({ artifacts: JSON.stringify(list), updatedAt: Date.now() }).where(eq(tasks.id, taskId));
        persistDb();
        const [fresh] = await db.select().from(tasks).where(eq(tasks.id, taskId));
        if (fresh) publish({ projectId, kind: "task-update", payload: { task: fresh } });
      }
    } catch {
      /* file is saved; task linkage is best-effort */
    }
  }
  return `${sanitizeProjectId(projectId)}/${safe}`;
}

/** List artifact filenames saved for a project (newest first). */
export function listArtifacts(projectId: string): string[] {
  const dir = dirFor(projectId);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => {
    try {
      sanitizeArtifactName(f);
      return fs.statSync(path.join(dir, f)).isFile();
    } catch {
      return false;
    }
  });
  return files.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
}

/** True when the project already has an artifact file with this name. */
export function artifactExists(projectId: string, filename: string): boolean {
  try {
    const safe = sanitizeArtifactName(filename);
    return fs.existsSync(path.join(dirFor(projectId), safe));
  } catch {
    return false;
  }
}

/** Read a previously saved artifact file. */
export async function readArtifact(projectId: string, filename: string): Promise<string> {
  const safe = sanitizeArtifactName(filename);
  const dir = dirFor(projectId);
  const full = path.join(dir, safe);
  if (path.relative(dir, full).startsWith("..")) throw new Error("artifact path escapes project dir");
  return fs.readFileSync(full, "utf-8");
}
