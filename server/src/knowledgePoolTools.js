/**
 * @param {{ blocks: { role: string, typeId: string }[] }} plan
 */
export function planHasVectorDb(plan) {
  return plan.blocks.some((b) => b.role === "process" && b.typeId === "vector-db");
}

/**
 * @param {string} poolName
 * @param {string} [vectorStoreId]
 */
export function buildWorkshopKnowledgeSearchTool(poolName, vectorStoreId) {
  const label = poolName || "(not configured)";
  const vs = vectorStoreId ? ` (vector store ${vectorStoreId})` : "";
  return {
    type: "function",
    name: "workshop_knowledge_search",
    description:
      `Search workshop knowledge pool **${label}**${vs} via semantic retrieval over uploaded documents ` +
      "(PDF, text, Office, HTML, CSV, …). **Always** call this before answering factual questions that should come from the knowledge base — do not guess. " +
      "Returns relevant text chunks with filenames and scores. Cite sources by filename when possible.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural-language search query (question or keywords).",
        },
        max_results: {
          type: "number",
          description: "Max chunks to return (1–20). Default 8.",
        },
      },
      required: ["query"],
    },
  };
}
