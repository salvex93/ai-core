import { z } from "zod";

export const SemanticNodeSchema = z.object({
  nid: z.string().regex(/^[a-z0-9_]{3,30}$/),
  domain: z.enum(["SEC", "ST", "FX", "UI", "DATA"]),
  invariant: z.string().min(10).max(120),
  dependencies: z.array(z.string()),
  source: z.string().min(1)
});

export type SemanticNode = z.infer<typeof SemanticNodeSchema>;
