// The stats tools as LangChain tools.
//
// No second copy of the schemas or queries: each tool is the existing JSON
// Schema from TOOL_DECLARATIONS plus a call into runTool, exactly what the
// hand-written loop in /api/ai/ask dispatches to. Add a tool there and both
// agents get it.

import { tool } from "@langchain/core/tools";
import { TOOL_DECLARATIONS, runTool } from "@/lib/baddy-tools";

export const statsTools = TOOL_DECLARATIONS.map(({ function: fn }) =>
  tool(
    // runTool already turns exceptions into { error } — the model sees the
    // error and can recover, rather than the graph crashing mid-turn.
    async (args: Record<string, unknown>) => JSON.stringify(await runTool(fn.name, args)),
    { name: fn.name, description: fn.description, schema: fn.parameters }
  )
);
