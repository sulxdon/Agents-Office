// Event bus: live in-memory fan-out + durable SQLite outbox.
// Every published event is written through to the events_outbox table so
// replays, reconnects, and poll reconciliation survive server restarts and
// dev module reloads. Live subscribers still get instant push.
// NOTE: db access is lazily imported so this module never pulls node:fs
// into client bundles (client code imports only the OfficeEvent type).

export interface OfficeEvent {
  id: string;
  projectId: string;
  kind:
    | "activity"
    | "agent-move"
    | "agent-status"
    | "agent-say"
    | "agent-thought"
    | "agent-tool"
    | "api-usage"
    | "task-update"
    | "goal-update"
    | "project-update"
    | "toast";
  payload: Record<string, unknown>;
  timestamp: number;
}

type Listener = (ev: OfficeEvent) => void;

const listeners = new Set<Listener>();
const MAX_PER_PROJECT = 500;

async function loadDb() {
  const [client, schema, orm] = await Promise.all([
    import("@/lib/db/client"),
    import("@/lib/db/schema"),
    import("drizzle-orm"),
  ]);
  const db = await client.getDb();
  return { db, schema, orm, schedulePersist: client.schedulePersist };
}

export async function publish(ev: Omit<OfficeEvent, "id" | "timestamp">): Promise<OfficeEvent> {
  const full: OfficeEvent = {
    ...ev,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };
  // Durable write-through first (best-effort), then instant fan-out.
  try {
    const { db, schema, orm, schedulePersist } = await loadDb();
    await db.insert(schema.eventsOutbox).values({
      id: full.id,
      projectId: full.projectId,
      kind: full.kind,
      payload: JSON.stringify(full.payload),
      timestamp: full.timestamp,
    });
    // Cap per project so the outbox can't grow without bound.
    await db
      .delete(schema.eventsOutbox)
      .where(
        orm.and(
          orm.eq(schema.eventsOutbox.projectId, full.projectId),
          orm.notInArray(
            schema.eventsOutbox.id,
            db
              .select({ id: schema.eventsOutbox.id })
              .from(schema.eventsOutbox)
              .where(orm.eq(schema.eventsOutbox.projectId, full.projectId))
              .orderBy(orm.desc(schema.eventsOutbox.timestamp))
              .limit(MAX_PER_PROJECT)
          )
        )
      )
      .catch(() => undefined);
    schedulePersist();
  } catch {
    /* DB unavailable — live listeners below still get the event */
  }
  listeners.forEach((l) => {
    try {
      l(full);
    } catch {
      /* drop broken listener */
    }
  });
  return full;
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export async function recentEvents(projectId: string, since = 0): Promise<OfficeEvent[]> {
  try {
    const { db, schema, orm } = await loadDb();
    const rows = await db
      .select()
      .from(schema.eventsOutbox)
      .where(orm.and(orm.eq(schema.eventsOutbox.projectId, projectId), orm.gt(schema.eventsOutbox.timestamp, since)))
      .orderBy(orm.asc(schema.eventsOutbox.timestamp))
      .limit(MAX_PER_PROJECT);
    return rows.map((r) => {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(r.payload) as Record<string, unknown>;
      } catch {
        /* keep empty */
      }
      return { id: r.id, projectId: r.projectId, kind: r.kind as OfficeEvent["kind"], payload, timestamp: r.timestamp };
    });
  } catch {
    return [];
  }
}
