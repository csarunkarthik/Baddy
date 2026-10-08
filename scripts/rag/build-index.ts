// Build the docs index for RAG: split the project docs into chunks, embed each
// chunk locally, write .rag/docs-index.json (gitignored — it's derived).
//
//   npm run rag:index
//
// Re-run whenever the docs change. No network apart from the one-time model
// download, no DB.

import fs from "node:fs";
import path from "node:path";
import { MarkdownTextSplitter } from "@langchain/textsplitters";
import { EMBEDDING_MODEL, LocalEmbeddings } from "@/lib/rag/embeddings";
import { INDEX_PATH, type Chunk, type DocsIndex } from "@/lib/rag/docs-retriever";

const SOURCES = ["CLAUDE.md", "bridge/README.md", "scripts/evals/LABELING.md"];

// Markdown-aware splitting prefers to break at headings, then paragraphs, so a
// chunk tends to be one coherent section. ~1000 chars keeps a section's point
// intact; the overlap stops a sentence being cut in half across two chunks.
const splitter = new MarkdownTextSplitter({ chunkSize: 1000, chunkOverlap: 150 });

/** Nearest heading above each chunk, so a hit can say where it came from. */
function headingFor(doc: string, chunk: string): string {
  const at = doc.indexOf(chunk.slice(0, 80));
  let heading = "";
  let inFence = false;
  // Walk the lines above the chunk; a "# …" inside a ``` block is a shell
  // comment, not a heading.
  for (const line of (at >= 0 ? doc.slice(0, at + 1) : "").split("\n")) {
    if (line.trimStart().startsWith("```")) inFence = !inFence;
    else if (!inFence && /^#{1,4} /.test(line)) heading = line.replace(/^#+ /, "");
  }
  return heading;
}

async function main() {
  const pieces: Omit<Chunk, "embedding">[] = [];
  for (const source of SOURCES) {
    const doc = fs.readFileSync(path.join(process.cwd(), source), "utf8");
    for (const text of await splitter.splitText(doc)) {
      pieces.push({ source, heading: headingFor(doc, text), text });
    }
  }

  const t0 = Date.now();
  // Prefix the heading so a chunk that's mostly a code block still embeds
  // close to what the section is about.
  const vectors = await new LocalEmbeddings().embedDocuments(pieces.map((p) => `${p.heading}\n${p.text}`));
  const chunks: Chunk[] = pieces.map((p, i) => ({ ...p, embedding: vectors[i].map((x) => Math.round(x * 1e5) / 1e5) }));

  const out: DocsIndex = { model: EMBEDDING_MODEL, builtAt: new Date().toISOString(), chunks };
  fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(out));
  console.log(`${chunks.length} chunks from ${SOURCES.length} files embedded in ${Date.now() - t0}ms → ${path.relative(process.cwd(), INDEX_PATH)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
