import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";

const sendEmail = vi.fn();
const draftEmail = vi.fn();
const appendToGoogleDoc = vi.fn();

const recipientsSchema = z.union([
  z.string().min(1),
  z.array(z.string().min(1)).min(1),
]);

const emailInputSchema = z.object({
  to: recipientsSchema,
  subject: z.string().min(1),
  body: z.string().min(1),
  body_type: z.enum(["text", "html"]).default("text"),
  cc: recipientsSchema.optional(),
  bcc: recipientsSchema.optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string().min(1),
        content_base64: z.string().min(1),
        mime_type: z.string().min(1),
      }),
    )
    .optional(),
  thread_id: z.string().min(1).optional(),
});

vi.mock("../src/lib/gmailApi.js", () => ({
  emailInputSchema,
  sendEmail,
  draftEmail,
}));

vi.mock("../src/lib/docsClient.js", () => ({
  appendToGoogleDoc,
}));

const { handleSendEmail } = await import("../src/tools/sendEmail.js");
const { handleDraftEmail } = await import("../src/tools/draftEmail.js");
const { handleAppendToGoogleDoc } = await import("../src/tools/appendToGoogleDoc.js");

describe("handleSendEmail", () => {
  beforeEach(() => {
    sendEmail.mockReset();
  });

  it("returns structured success", async () => {
    sendEmail.mockResolvedValue({
      status: "sent",
      message_id: "m1",
      thread_id: "t1",
    });
    const result = await handleSendEmail({
      to: "a@example.com",
      subject: "s",
      body: "b",
    });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      status: "sent",
      message_id: "m1",
      thread_id: "t1",
    });
  });

  it("returns INVALID_INPUT for bad args", async () => {
    const result = await handleSendEmail({ to: "a@example.com" });
    expect(result.isError).toBe(true);
    expect(result.structuredContent.error_code).toBe("INVALID_INPUT");
  });

  it("maps upstream failures", async () => {
    sendEmail.mockRejectedValue({ code: 429, message: "quota" });
    const result = await handleSendEmail({
      to: "a@example.com",
      subject: "s",
      body: "b",
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent.error_code).toBe("RATE_LIMITED");
  });
});

describe("handleDraftEmail", () => {
  beforeEach(() => {
    draftEmail.mockReset();
  });

  it("returns draft_created", async () => {
    draftEmail.mockResolvedValue({
      status: "draft_created",
      draft_id: "d1",
      message_id: "m1",
    });
    const result = await handleDraftEmail({
      to: "a@example.com",
      subject: "s",
      body: "b",
    });
    expect(result.structuredContent.status).toBe("draft_created");
  });
});

describe("handleAppendToGoogleDoc", () => {
  beforeEach(() => {
    appendToGoogleDoc.mockReset();
  });

  it("returns appended payload", async () => {
    appendToGoogleDoc.mockResolvedValue({
      status: "appended",
      document_id: "doc1",
      inserted_at_index: 12,
      revision_id: "rev1",
    });
    const result = await handleAppendToGoogleDoc({
      document_id: "doc1",
      content: "hello",
    });
    expect(result.structuredContent).toMatchObject({
      status: "appended",
      document_id: "doc1",
      inserted_at_index: 12,
    });
  });

  it("returns NOT_FOUND from docs client", async () => {
    appendToGoogleDoc.mockRejectedValue({ code: 404, message: "not found" });
    const result = await handleAppendToGoogleDoc({
      document_id: "missing",
      content: "x",
    });
    expect(result.structuredContent.error_code).toBe("NOT_FOUND");
  });
});
