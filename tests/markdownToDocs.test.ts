import { describe, expect, it } from "vitest";
import {
  markdownToDocsRequests,
  plainTextRequests,
  parseInlineRuns,
} from "../src/lib/markdownToDocs.js";
import { resolveEndIndex } from "../src/lib/docsClient.js";

describe("parseInlineRuns", () => {
  it("splits bold markers", () => {
    expect(parseInlineRuns("Hello **world**!")).toEqual([
      { text: "Hello " },
      { text: "world", bold: true },
      { text: "!" },
    ]);
  });
});

describe("plainTextRequests", () => {
  it("inserts text with trailing newline", () => {
    const { requests, insertedTextLength } = plainTextRequests("hi", 10);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({
      insertText: { location: { index: 10 }, text: "hi\n" },
    });
    expect(insertedTextLength).toBe(3);
  });
});

describe("markdownToDocsRequests", () => {
  it("emits heading, bold, and bullets", () => {
    const md = "# Title\n\nHello **bold**\n\n- one\n- two";
    const { requests } = markdownToDocsRequests(md, 1);

    const insertTexts = requests
      .filter((r) => r.insertText)
      .map((r) => r.insertText!.text);
    expect(insertTexts.some((t) => t === "Title")).toBe(true);
    expect(insertTexts.some((t) => t === "bold")).toBe(true);

    expect(requests.some((r) => r.updateParagraphStyle?.paragraphStyle?.namedStyleType === "HEADING_1")).toBe(
      true,
    );
    expect(requests.some((r) => r.updateTextStyle?.textStyle?.bold === true)).toBe(true);
    expect(requests.some((r) => r.createParagraphBullets)).toBe(true);
  });

  it("best-effort keeps unknown markup as text", () => {
    const { requests } = markdownToDocsRequests("Use `code` here", 5);
    const joined = requests
      .filter((r) => r.insertText)
      .map((r) => r.insertText!.text)
      .join("");
    expect(joined).toContain("`code`");
  });
});

describe("resolveEndIndex", () => {
  it("returns endIndex - 1 of last element", () => {
    expect(
      resolveEndIndex({
        body: {
          content: [
            { startIndex: 1, endIndex: 20 },
            { startIndex: 20, endIndex: 55 },
          ],
        },
      }),
    ).toBe(54);
  });

  it("defaults to 1 for empty body", () => {
    expect(resolveEndIndex({ body: { content: [] } })).toBe(1);
  });
});
