import { z } from "zod";

// Full answer shape — still used for the assembled final response
// and for non-streaming decline path
export const GroundedAnswerSchema = z.object({
  answer: z.string(),
  is_grounded: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
  sources: z.array(z.string()),
});

export type GroundedAnswer = z.infer<typeof GroundedAnswerSchema>;

// Metadata sent as the final SSE event after streaming completes
export interface StreamMetadata {
  is_grounded: boolean;
  confidence: "high" | "medium" | "low";
  sources: string[];
}
