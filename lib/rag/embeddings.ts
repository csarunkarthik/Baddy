// Local text embeddings — no API key, no per-call cost. Groq has no embeddings
// endpoint, and the corpus here (the project's own docs) is tiny, so a small
// model running in-process is plenty.
//
// Implements LangChain's Embeddings interface, so anything that takes
// embeddings (vector stores, retrievers) can use it — and swapping in a hosted
// provider later is a one-line change.
//
// First use downloads the model (~25 MB) into the transformers.js cache.
// Script-side only: onnxruntime is too heavy for a Vercel function.

import { Embeddings } from "@langchain/core/embeddings";
// transformers.js v2 (@xenova), not v3+ (@huggingface): v3's ONNX runtime only
// ships Apple-Silicon binaries for macOS, and this runs on an Intel Mac.
import { pipeline } from "@xenova/transformers";

/** 384-dim sentence embeddings; small, fast, good enough for docs Q&A. */
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

type Extractor = (texts: string[], opts: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

export class LocalEmbeddings extends Embeddings {
  private extractor?: Promise<Extractor>;

  constructor() {
    super({});
  }

  private load(): Promise<Extractor> {
    this.extractor ??= pipeline("feature-extraction", EMBEDDING_MODEL) as unknown as Promise<Extractor>;
    return this.extractor;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const extract = await this.load();
    // Mean pooling + normalisation: one unit-length vector per text, so cosine
    // similarity is just a dot product.
    return (await extract(texts, { pooling: "mean", normalize: true })).tolist();
  }

  async embedQuery(text: string): Promise<number[]> {
    return (await this.embedDocuments([text]))[0];
  }
}
