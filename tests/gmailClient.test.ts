import { describe, expect, it } from "vitest";
import {
  buildRawMime,
  MAX_ATTACHMENT_TOTAL_BYTES,
  emailInputSchema,
} from "../src/lib/gmailClient.js";
import { AppError } from "../src/types/errors.js";

describe("emailInputSchema", () => {
  it("applies defaults", () => {
    const parsed = emailInputSchema.parse({
      to: "a@example.com",
      subject: "Hi",
      body: "Hello",
    });
    expect(parsed.body_type).toBe("text");
  });

  it("accepts string[] recipients", () => {
    const parsed = emailInputSchema.parse({
      to: ["a@example.com", "b@example.com"],
      subject: "Hi",
      body: "Hello",
      cc: "c@example.com",
    });
    expect(parsed.to).toEqual(["a@example.com", "b@example.com"]);
  });
});

describe("buildRawMime", () => {
  it("builds plain text MIME as base64url", () => {
    const raw = buildRawMime({
      to: "user@example.com",
      subject: "Test",
      body: "Hello world",
      body_type: "text",
    });
    expect(raw).not.toMatch(/[+/=]/);
    const decoded = Buffer.from(
      raw.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    expect(decoded).toContain("To: user@example.com");
    expect(decoded).toContain("Subject: Test");
    expect(decoded).toContain("text/plain");
  });

  it("builds html MIME with cc/bcc", () => {
    const raw = buildRawMime({
      to: ["a@example.com"],
      cc: ["c@example.com"],
      bcc: "b@example.com",
      subject: "Html",
      body: "<b>hi</b>",
      body_type: "html",
    });
    const decoded = Buffer.from(
      raw.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    expect(decoded).toContain("Cc: c@example.com");
    expect(decoded).toContain("Bcc: b@example.com");
    expect(decoded).toContain("text/html");
  });

  it("builds multipart with attachments", () => {
    const content = Buffer.from("file-bytes").toString("base64");
    const raw = buildRawMime({
      to: "a@example.com",
      subject: "Att",
      body: "see attached",
      body_type: "text",
      attachments: [
        {
          filename: "note.txt",
          content_base64: content,
          mime_type: "text/plain",
        },
      ],
    });
    const decoded = Buffer.from(
      raw.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    expect(decoded).toContain("multipart/mixed");
    expect(decoded).toContain('filename="note.txt"');
  });

  it("rejects invalid email", () => {
    expect(() =>
      buildRawMime({
        to: "not-an-email",
        subject: "x",
        body: "y",
        body_type: "text",
      }),
    ).toThrow(AppError);
  });

  it("rejects oversized attachments", () => {
    const big = Buffer.alloc(MAX_ATTACHMENT_TOTAL_BYTES + 1, 1).toString("base64");
    expect(() =>
      buildRawMime({
        to: "a@example.com",
        subject: "x",
        body: "y",
        body_type: "text",
        attachments: [
          { filename: "big.bin", content_base64: big, mime_type: "application/octet-stream" },
        ],
      }),
    ).toThrow(/exceed/);
  });
});
