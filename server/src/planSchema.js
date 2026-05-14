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
  dynamicUiCommitted: z.string().optional(),
  runPreview: z.string().optional(),
});

export const pipelinePlanSchema = z.object({
  version: z.literal(1),
  blocks: z.array(pipelineBlockSchema),
});
