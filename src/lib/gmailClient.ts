import { z } from "zod";
import { AppError } from "../types/errors.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024; // 20 MB

export const recipientsSchema = z.union([
  z.string().min(1),
  z.array(z.string().min(1)).min(1),
]);

export const attachmentSchema = z.object({
  filename: z.string().min(1),
  content_base64: z.string().min(1),
  mime_type: z.string().min(1),
});

export const emailInputSchema = z.object({
  to: recipientsSchema,
  subject: z.string().min(1),
  body: z.string().min(1),
  body_type: z.enum(["text", "html"]).default("text"),
  cc: recipientsSchema.optional(),
  bcc: recipientsSchema.optional(),
  attachments: z.array(attachmentSchema).optional(),
  thread_id: z.string().min(1).optional(),
});

export type EmailInput = z.infer<typeof emailInputSchema>;

export function normalizeRecipients(
  value: string | string[] | undefined,
): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map((e) => e.trim());
}

export function validateEmails(label: string, emails: string[]): void {
  for (const email of emails) {
    if (!EMAIL_RE.test(email)) {
      throw new AppError("INVALID_INPUT", `Invalid ${label} email address: ${email}`, {
        field: label,
        email,
      });
    }
  }
}

function encodeUtf8Base64(data: string): string {
  return Buffer.from(data, "utf8").toString("base64");
}

function toBase64Url(rawBase64: string): string {
  return rawBase64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function foldHeaders(name: string, value: string): string {
  return `${name}: ${value}`;
}

/**
 * Build an RFC 2822 MIME message and return Gmail API `raw` (base64url).
 */
export function buildRawMime(input: EmailInput): string {
  const to = normalizeRecipients(input.to);
  const cc = normalizeRecipients(input.cc);
  const bcc = normalizeRecipients(input.bcc);

  validateEmails("to", to);
  validateEmails("cc", cc);
  validateEmails("bcc", bcc);
  if (to.length === 0) {
    throw new AppError("INVALID_INPUT", "At least one 'to' recipient is required");
  }

  const attachments = input.attachments ?? [];
  let totalAttachmentBytes = 0;
  for (const att of attachments) {
    const buf = Buffer.from(att.content_base64, "base64");
    totalAttachmentBytes += buf.length;
  }
  if (totalAttachmentBytes > MAX_ATTACHMENT_TOTAL_BYTES) {
    throw new AppError(
      "INVALID_INPUT",
      `Attachments exceed ${MAX_ATTACHMENT_TOTAL_BYTES} bytes total`,
      { totalAttachmentBytes, max: MAX_ATTACHMENT_TOTAL_BYTES },
    );
  }

  const headers: string[] = [
    foldHeaders("To", to.join(", ")),
    foldHeaders("Subject", input.subject),
    foldHeaders("MIME-Version", "1.0"),
  ];
  if (cc.length) headers.push(foldHeaders("Cc", cc.join(", ")));
  if (bcc.length) headers.push(foldHeaders("Bcc", bcc.join(", ")));

  const bodyType = input.body_type ?? "text";
  const contentType =
    bodyType === "html" ? "text/html; charset=\"UTF-8\"" : "text/plain; charset=\"UTF-8\"";

  let mimeBody: string;

  if (attachments.length === 0) {
    headers.push(foldHeaders("Content-Type", contentType));
    headers.push(foldHeaders("Content-Transfer-Encoding", "base64"));
    mimeBody = `${headers.join("\r\n")}\r\n\r\n${encodeUtf8Base64(input.body)}`;
  } else {
    const boundary = `mcp_boundary_${Date.now()}`;
    headers.push(
      foldHeaders("Content-Type", `multipart/mixed; boundary="${boundary}"`),
    );

    const parts: string[] = [];
    parts.push(
      `--${boundary}\r\n` +
        `Content-Type: ${contentType}\r\n` +
        `Content-Transfer-Encoding: base64\r\n\r\n` +
        `${encodeUtf8Base64(input.body)}`,
    );

    for (const att of attachments) {
      const safeName = att.filename.replace(/"/g, "");
      parts.push(
        `--${boundary}\r\n` +
          `Content-Type: ${att.mime_type}; name="${safeName}"\r\n` +
          `Content-Disposition: attachment; filename="${safeName}"\r\n` +
          `Content-Transfer-Encoding: base64\r\n\r\n` +
          `${att.content_base64}`,
      );
    }
    parts.push(`--${boundary}--`);
    mimeBody = `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
  }

  return toBase64Url(Buffer.from(mimeBody, "utf8").toString("base64"));
}

export { MAX_ATTACHMENT_TOTAL_BYTES };
