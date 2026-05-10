import { z } from "zod";

export const EtlStorySchema = z.object({
  title: z.string().min(3).max(140),
  asA: z.string().min(2).max(80),
  iWant: z.string().min(5).max(400),
  soThat: z.string().min(5).max(400),
  source: z.string().min(2).max(200),
  target: z.string().min(2).max(200),
  transformations: z.array(z.string().min(2).max(200)).min(1).max(10),
  acceptanceCriteria: z.array(z.string().min(2).max(300)).min(1).max(10),
  priority: z.enum(["Low", "Medium", "High", "Critical"]),
  estimate: z.string().max(40).optional().default("TBD"),
});

export type EtlStory = z.infer<typeof EtlStorySchema>;

export const RawInputSchema = z.object({
  raw: z.string().min(20).max(4000),
});
