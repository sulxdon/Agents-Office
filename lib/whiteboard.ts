import { getDb, persistDb } from "@/lib/db/client";
import { whiteboards } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { uid } from "@/lib/utils";

/** Read the shared whiteboard for an office room. Empty string when unset. */
export async function readWhiteboard(officeId: string): Promise<string> {
  try {
    const db = await getDb();
    const rows = await db.select().from(whiteboards).where(eq(whiteboards.officeId, officeId));
    return rows[0]?.content ?? "";
  } catch {
    return "";
  }
}

/** Create or overwrite the shared whiteboard for an office room. */
export async function writeWhiteboard(officeId: string, content: string): Promise<void> {
  try {
    const db = await getDb();
    const rows = await db.select().from(whiteboards).where(eq(whiteboards.officeId, officeId));
    if (rows[0]) {
      await db.update(whiteboards).set({ content, updatedAt: Date.now() }).where(eq(whiteboards.officeId, officeId));
    } else {
      await db.insert(whiteboards).values({ id: uid("wb"), officeId, content, updatedAt: Date.now() });
    }
    persistDb();
  } catch {
    /* ignore */
  }
}
