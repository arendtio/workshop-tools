import { z } from "zod";

const formItemSchema = z.object({
  id: z.string(),
  typ: z.string(),
  label: z.string(),
  options: z.string().optional(),
});

export const pipelineBlockSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["input", "process", "output"]),
  typeId: z.string().min(1),
  values: z.record(z.string()).default({}),
  formItems: z.array(formItemSchema).optional(),
  /** Snapshot of participant form field values at Run (label → value). */
  formParticipantValues: z.record(z.string()).optional(),
  dynamicUiCommitted: z.string().optional(),
  /** JSON Schema (object) for output:dynamic-ui — emitted ui_data shape for processing. */
  dynamicUiOutputSchema: z.record(z.unknown()).optional(),
  runPreview: z.string().optional(),
});

export const pipelinePlanSchema = z.object({
  version: z.literal(1),
  blocks: z.array(pipelineBlockSchema),
  /** Workshop mock tooling SQLite available for this run. */
  toolingMockReady: z.boolean().optional(),
  /** @deprecated Use toolingMockReady — legacy client secrets. */
  toolingMockSessionId: z.string().min(1).optional(),
  /** Client/server — persisted dynamic UI widget snapshot + NL hints. */
  dynamicUiSessionId: z.string().min(1).optional(),
});
