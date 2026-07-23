import { describe, expect, it, vi } from "vitest";
import { appendToGoogleDoc } from "../src/lib/docsClient.js";

describe("appendToGoogleDoc request shaping", () => {
  it("builds page break + newline + plain insert", async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        revisionId: "rev-before",
        body: { content: [{ startIndex: 1, endIndex: 10 }] },
      },
    });
    const batchUpdate = vi.fn().mockResolvedValue({
      data: { writeControl: { requiredRevisionId: "rev-after" } },
    });

    const result = await appendToGoogleDoc(
      {
        documentId: "doc123",
        content: "hello",
        format: "plain",
        addPageBreakBefore: true,
        newlineBefore: true,
      },
      { documents: { get, batchUpdate } } as never,
    );

    expect(get).toHaveBeenCalledWith({ documentId: "doc123" });
    expect(batchUpdate).toHaveBeenCalledOnce();
    const body = batchUpdate.mock.calls[0][0].requestBody;
    expect(body.requests[0]).toHaveProperty("insertPageBreak");
    expect(body.requests[1].insertText.text).toBe("\n");
    expect(body.requests[2].insertText.text).toBe("hello\n");
    expect(result).toMatchObject({
      status: "appended",
      document_id: "doc123",
      inserted_at_index: 9,
      revision_id: "rev-after",
    });
  });

  it("uses markdown converter path", async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        revisionId: "r1",
        body: { content: [{ endIndex: 5 }] },
      },
    });
    const batchUpdate = vi.fn().mockResolvedValue({ data: {} });
    // avoid second get for revision
    get.mockResolvedValueOnce({
      data: { revisionId: "r1", body: { content: [{ endIndex: 5 }] } },
    });

    await appendToGoogleDoc(
      {
        documentId: "doc",
        content: "# Hi\n- a",
        format: "markdown",
        addPageBreakBefore: false,
        newlineBefore: false,
      },
      { documents: { get, batchUpdate } } as never,
    );

    const requests = batchUpdate.mock.calls[0][0].requestBody.requests;
    expect(requests.some((r: { updateParagraphStyle?: unknown }) => r.updateParagraphStyle)).toBe(
      true,
    );
    expect(requests.some((r: { createParagraphBullets?: unknown }) => r.createParagraphBullets)).toBe(
      true,
    );
  });
});
