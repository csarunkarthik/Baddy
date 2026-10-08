// Retrieval over the project's own docs (CLAUDE.md, bridge/README.md, …).
//
// The "vector store" is a JSON file of chunks + embeddings and a dot product.
// At a few dozen chunks that's all a vector DB would do anyway; pgvector (which
// Neon offers) earns its keep at thousands of rows, or when the corpus changes
// at runtime. Build the index with `npm run rag:index`.

import fs from "node:fs";
import path from "node:path";
import { EMBEDDING_MODEL, LocalEmbeddings } from "@/lib/rag/embeddings";

export const INDEX_PATH = path.join(process.cwd(), ".rag", "docs-index.json");

export type Chunk = { source: string; heading: string; text: string; embedding: number[] };
export type DocsIndex = { model: string; builtAt: string; chunks: Chunk[] };
export type Hit = { source: string; heading: string; text: string; score: number };

let index: DocsIndex | null = null;
const embeddings = new LocalEmbeddings();

function loadIndex(): DocsIndex {
  if (index) return index;
  if (!fs.existsSync(INDEX_PATH)) throw new Error("Docs index missing — run `npm run rag:index` first.");
  const loaded = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as DocsIndex;
  // Query and chunks must come from the same model, or similarity is noise.
  if (loaded.model !== EMBEDDING_MODEL) throw new Error(`Index built with ${loaded.model}; rebuild with npm run rag:index.`);
  index = loaded;
  return index;
}

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

/** Top-k chunks by cosine similarity (vectors are unit length, so a dot product). */
export async function searchDocs(query: string, k = 4): Promise<Hit[]> {
  const { chunks } = loadIndex();
  const q = await embeddings.embedQuery(query);
  return chunks
    .map((c) => ({ source: c.source, heading: c.heading, text: c.text, score: dot(q, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
