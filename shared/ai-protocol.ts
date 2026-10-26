import { z } from 'zod';
import { nodeSchema } from './model.js';

// Nullable fields keep one strict response object for providers supporting structured output.
export const aiDecisionSchema = z.object({
  tool: z.enum(['inspect', 'perform', 'question', 'create_variable', 'finish']),
  deviceId: z.string().nullable(),
  componentId: z.string().nullable(),
  operation: z.enum(['tap', 'type', 'clear', 'back']).nullable(),
  value: z.string().nullable(),
  summary: z.string().nullable(),
  sessionTitle: z.string().nullable(),
  variableName: z.string().nullable(),
  nodes: z.array(nodeSchema).nullable(),
});
export const aiDecisionJsonSchema = z.toJSONSchema(aiDecisionSchema);
export const AI_PROTOCOL_REMINDER =
  '\nContinue using the Cyberfox JSON protocol. These are HOST commands, not native SDK tools: inspect, perform, create_variable, question, finish. Return exactly one JSON decision; do not call shell, exec, filesystem or invent an unavailable-tools blocker. The host executes perform on the supplied observed componentId and returns a fresh screen. If the objective fails, preserve that failure; propose only grounded, replayable checks and clearly state coverage gaps.';
