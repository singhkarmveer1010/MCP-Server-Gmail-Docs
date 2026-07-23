import { z } from "zod";
import { emailInputSchema, sendEmail } from "../lib/gmailApi.js";
import { normalizeRecipients } from "../lib/gmailClient.js";
import { logger } from "../lib/logger.js";
import { AppError, toolSuccess, toToolResult, type ToolResult } from "../types/errors.js";

export const sendEmailInputSchema = emailInputSchema;

export const sendEmailOutputSchema = z.object({
  status: z.literal("sent"),
  message_id: z.string(),
  thread_id: z.string(),
});

export async function handleSendEmail(args: unknown): Promise<ToolResult> {
  const started = Date.now();
  try {
    const parsed = sendEmailInputSchema.safeParse(args);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", "Invalid send_email input", {
        issues: parsed.error.issues,
      });
    }

    const input = parsed.data;
    const toCount = normalizeRecipients(input.to).length;

    logger.info("tool_start", {
      tool: "send_email",
      toCount,
      subjectLength: input.subject.length,
      bodyType: input.body_type,
      hasAttachments: Boolean(input.attachments?.length),
      hasThreadId: Boolean(input.thread_id),
    });

    const result = await sendEmail(input);

    logger.info("tool_success", {
      tool: "send_email",
      status: result.status,
      latencyMs: Date.now() - started,
    });

    return toolSuccess(result, `Email sent (message_id=${result.message_id})`);
  } catch (err) {
    logger.error("tool_error", {
      tool: "send_email",
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    });
    return toToolResult(err);
  }
}
