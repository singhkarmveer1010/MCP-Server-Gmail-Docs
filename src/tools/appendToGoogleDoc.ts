import { z } from "zod";
import { appendToGoogleDoc } from "../lib/docsClient.js";
import { logger } from "../lib/logger.js";
import { AppError, toolSuccess, toToolResult, type ToolResult } from "../types/errors.js";

export const appendToGoogleDocInputSchema = z.object({
  document_id: z.string().min(1),
  content: z.string().min(1),
  format: z.enum(["plain", "markdown"]).default("plain"),
  add_page_break_before: z.boolean().default(false),
  newline_before: z.boolean().default(true),
});

export const appendToGoogleDocOutputSchema = z.object({
  status: z.literal("appended"),
  document_id: z.string(),
  inserted_at_index: z.number(),
  revision_id: z.string().optional(),
});

export async function handleAppendToGoogleDoc(args: unknown): Promise<ToolResult> {
  const started = Date.now();
  try {
    const parsed = appendToGoogleDocInputSchema.safeParse(args);
    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", "Invalid append_to_google_doc input", {
        issues: parsed.error.issues,
      });
    }

    const input = parsed.data;

    logger.info("tool_start", {
      tool: "append_to_google_doc",
      documentId: input.document_id,
      contentLength: input.content.length,
      format: input.format,
      addPageBreakBefore: input.add_page_break_before,
      newlineBefore: input.newline_before,
    });

    const result = await appendToGoogleDoc({
      documentId: input.document_id,
      content: input.content,
      format: input.format,
      addPageBreakBefore: input.add_page_break_before,
      newlineBefore: input.newline_before,
    });

    logger.info("tool_success", {
      tool: "append_to_google_doc",
      status: result.status,
      insertedAtIndex: result.inserted_at_index,
      latencyMs: Date.now() - started,
    });

    return toolSuccess(
      result,
      `Appended to document ${result.document_id} at index ${result.inserted_at_index}`,
    );
  } catch (err) {
    logger.error("tool_error", {
      tool: "append_to_google_doc",
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    });
    return toToolResult(err);
  }
}
