import { z } from "zod";
import { draftEmail, emailInputSchema } from "../lib/gmailApi.js";
import { normalizeRecipients } from "../lib/gmailClient.js";
import { logger } from "../lib/logger.js";
import { AppError, toolSuccess, toToolResult, type ToolResult } from "../types/errors.js";

export const draftEmailInputSchema = emailInputSchema;

export const draftEmailOutputSchema = z.object({
  status: z.literal("draft_created"),
  draft_id: z.string(),
  message_id: z.string(),
});

export async function handleDraftEmail(args: unknown): Promise<ToolResult> {
  const started = Date.now();
  try {
    const parsed = draftEmailInputSchema.safeParse(args);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", "Invalid draft_email input", {
        issues: parsed.error.issues,
      });
    }

    const input = parsed.data;
    const toCount = normalizeRecipients(input.to).length;

    logger.info("tool_start", {
      tool: "draft_email",
      toCount,
      subjectLength: input.subject.length,
      bodyType: input.body_type,
      hasAttachments: Boolean(input.attachments?.length),
      hasThreadId: Boolean(input.thread_id),
    });

    const result = await draftEmail(input);

    logger.info("tool_success", {
      tool: "draft_email",
      status: result.status,
      latencyMs: Date.now() - started,
    });

    return toolSuccess(
      result,
      `Draft created (draft_id=${result.draft_id})`,
    );
  } catch (err) {
    logger.error("tool_error", {
      tool: "draft_email",
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    });
    return toToolResult(err);
  }
}
