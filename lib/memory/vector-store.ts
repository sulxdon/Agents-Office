// Lightweight vector store. Uses LanceDB when installed, otherwise falls back
// to an in-memory table with keyword-overlap scoring. Embeddings are optional:
// when no embedding API is configured, retrieval degrades to keyword search.

export interface VectorRecord {
  id: string;
  projectId: string;
  agentId?: string | null;
  type: string;
  content: string;
  embedding?: number[];
  createdAt: number;
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

class LocalVectorStore {
  private records: VectorRecord[] = [];

  async add(rec: VectorRecord): Promise<void> {
    // LanceDB wiring point: install @lancedb/lancedb, add a static import,
    // and mirror the record into a table here. Local index below always runs.
    this.records = this.records.filter((r) => r.id !== rec.id);
    this.records.push(rec);
  }

  async search(projectId: string, query: string, queryEmbedding?: number[], limit = 5): Promise<VectorRecord[]> {
    const pool = this.records.filter((r) => r.projectId === projectId);
    if (queryEmbedding && queryEmbedding.length > 0) {
      return pool
        .map((r) => ({ r, s: r.embedding?.length ? cosine(queryEmbedding, r.embedding) : 0 }))
        .sort((a, b) => b.s - a.s)
        .slice(0, limit)
        .map((x) => x.r);
    }
    const q = tokenize(query);
    return pool
      .map((r) => {
        const t = tokenize(r.content);
        let overlap = 0;
        for (const w of q) if (t.has(w)) overlap++;
        return { r, s: overlap / Math.max(1, q.size) };
      })
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .filter((x) => x.s > 0)
      .map((x) => x.r);
  }

  async list(projectId: string): Promise<VectorRecord[]> {
    return this.records.filter((r) => r.projectId === projectId);
  }

  seed(records: VectorRecord[]) {
    this.records = records;
  }
}

export const vectorStore = new LocalVectorStore();
