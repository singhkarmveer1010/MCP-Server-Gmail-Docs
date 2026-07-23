import type { docs_v1 } from "googleapis";
import { logger } from "./logger.js";

export type DocsRequest = docs_v1.Schema$Request;

export interface MarkdownConversionResult {
  requests: DocsRequest[];
  /** Characters of text inserted (for index advancement bookkeeping). */
  insertedTextLength: number;
}

interface TextRun {
  text: string;
  bold?: boolean;
}

/**
 * Parse inline **bold** markers into runs. Best-effort; unmatched markers kept as text.
 */
export function parseInlineRuns(line: string): TextRun[] {
  const runs: TextRun[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    if (match.index > last) {
      runs.push({ text: line.slice(last, match.index) });
    }
    runs.push({ text: match[1], bold: true });
    last = match.index + match[0].length;
  }
  if (last < line.length) {
    runs.push({ text: line.slice(last) });
  }
  if (runs.length === 0) {
    runs.push({ text: line });
  }
  return runs;
}

function headingLevel(line: string): { level: number; text: string } | null {
  const m = /^(#{1,3})\s+(.+)$/.exec(line);
  if (!m) return null;
  return { level: m[1].length, text: m[2] };
}

function bulletText(line: string): string | null {
  const m = /^[-*]\s+(.+)$/.exec(line);
  return m ? m[1] : null;
}

/**
 * Convert a markdown subset into Google Docs batchUpdate requests,
 * inserting at `startIndex`.
 *
 * Supported: #–### headings, **bold**, -/* bullet lists.
 * Unsupported constructs are inserted as plain text (best-effort).
 */
export function markdownToDocsRequests(
  markdown: string,
  startIndex: number,
): MarkdownConversionResult {
  const requests: DocsRequest[] = [];
  let cursor = startIndex;
  let inserted = 0;

  const lines = markdown.split(/\r?\n/);
  // Track contiguous bullet paragraph ranges [start, end) in document indices
  let bulletRangeStart: number | null = null;
  let bulletRangeEnd: number | null = null;

  const flushBullets = () => {
    if (bulletRangeStart !== null && bulletRangeEnd !== null && bulletRangeEnd > bulletRangeStart) {
      requests.push({
        createParagraphBullets: {
          range: { startIndex: bulletRangeStart, endIndex: bulletRangeEnd },
          bulletPreset: "BULLET_DISC_CIRCLE_SQUARE",
        },
      });
    }
    bulletRangeStart = null;
    bulletRangeEnd = null;
  };

  const insertRuns = (runs: TextRun[], namedStyleType?: string) => {
    const paragraphStart = cursor;
    for (const run of runs) {
      const text = run.text;
      if (!text) continue;
      requests.push({
        insertText: { location: { index: cursor }, text },
      });
      const end = cursor + text.length;
      if (run.bold) {
        requests.push({
          updateTextStyle: {
            range: { startIndex: cursor, endIndex: end },
            textStyle: { bold: true },
            fields: "bold",
          },
        });
      }
      cursor = end;
      inserted += text.length;
    }
    // Ensure paragraph ends with newline for Docs structure
    requests.push({
      insertText: { location: { index: cursor }, text: "\n" },
    });
    cursor += 1;
    inserted += 1;

    if (namedStyleType) {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: paragraphStart, endIndex: cursor },
          paragraphStyle: { namedStyleType },
          fields: "namedStyleType",
        },
      });
    }

    return { paragraphStart, paragraphEnd: cursor };
  };

  for (const line of lines) {
    const heading = headingLevel(line);
    if (heading) {
      flushBullets();
      const style =
        heading.level === 1
          ? "HEADING_1"
          : heading.level === 2
            ? "HEADING_2"
            : "HEADING_3";
      insertRuns(parseInlineRuns(heading.text), style);
      continue;
    }

    const bullet = bulletText(line);
    if (bullet !== null) {
      const { paragraphStart, paragraphEnd } = insertRuns(parseInlineRuns(bullet));
      if (bulletRangeStart === null) bulletRangeStart = paragraphStart;
      bulletRangeEnd = paragraphEnd;
      continue;
    }

    flushBullets();
    // Empty line → blank paragraph
    insertRuns(parseInlineRuns(line));
  }

  flushBullets();

  if (inserted === 0) {
    logger.warn("markdown_empty_after_parse");
  }

  return { requests, insertedTextLength: inserted };
}

/**
 * Plain-text append requests (optional leading newline already applied by caller).
 */
export function plainTextRequests(content: string, startIndex: number): MarkdownConversionResult {
  const text = content.endsWith("\n") ? content : `${content}\n`;
  return {
    requests: [
      {
        insertText: {
          location: { index: startIndex },
          text,
        },
      },
    ],
    insertedTextLength: text.length,
  };
}
