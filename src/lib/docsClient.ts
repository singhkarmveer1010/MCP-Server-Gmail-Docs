import type { docs_v1 } from "googleapis";
import { getDocs } from "../auth/googleAuth.js";
import { AppError, mapGoogleError } from "../types/errors.js";
import {
  markdownToDocsRequests,
  plainTextRequests,
  type DocsRequest,
} from "./markdownToDocs.js";

export interface AppendToDocParams {
  documentId: string;
  content: string;
  format: "plain" | "markdown";
  addPageBreakBefore: boolean;
  newlineBefore: boolean;
}

export interface AppendToDocResult {
  status: "appended";
  document_id: string;
  inserted_at_index: number;
  revision_id?: string;
}

/**
 * End index for append: last content element's endIndex minus 1
 * (the final newline of the doc segment is at endIndex-1).
 */
export function resolveEndIndex(doc: docs_v1.Schema$Document): number {
  const content = doc.body?.content;
  if (!content || content.length === 0) {
    // Empty docs still have a body starting at index 1
    return 1;
  }
  const last = content[content.length - 1];
  const end = last.endIndex;
  if (typeof end !== "number" || end < 2) {
    return 1;
  }
  return end - 1;
}

export async function appendToGoogleDoc(
  params: AppendToDocParams,
  docsClient?: docs_v1.Docs,
): Promise<AppendToDocResult> {
  const docs = docsClient ?? getDocs();
  const { documentId, content, format, addPageBreakBefore, newlineBefore } = params;

  if (!documentId.trim()) {
    throw new AppError("INVALID_INPUT", "document_id is required");
  }
  if (!content) {
    throw new AppError("INVALID_INPUT", "content is required");
  }

  let doc: docs_v1.Schema$Document;
  try {
    const res = await docs.documents.get({ documentId });
    doc = res.data;
  } catch (err) {
    throw mapGoogleError(err);
  }

  let index = resolveEndIndex(doc);
  const insertedAt = index;
  const requests: DocsRequest[] = [];

  if (addPageBreakBefore) {
    requests.push({
      insertPageBreak: { location: { index } },
    });
    // Page break consumes one index slot in Docs model
    index += 1;
  }

  if (newlineBefore) {
    requests.push({
      insertText: { location: { index }, text: "\n" },
    });
    index += 1;
  }

  const converted =
    format === "markdown"
      ? markdownToDocsRequests(content, index)
      : plainTextRequests(content, index);

  requests.push(...converted.requests);

  try {
    const update = await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests,
        writeControl: { targetRevisionId: doc.revisionId ?? undefined },
      },
    });

    const revisionId =
      update.data.writeControl?.requiredRevisionId ??
      update.data.documentId /* not a revision */ ??
      undefined;

    // Prefer refreshed revision if present on response writeControl
    const result: AppendToDocResult = {
      status: "appended",
      document_id: documentId,
      inserted_at_index: insertedAt,
    };

    // Google may echo requiredRevisionId after write; also re-fetch lightly if needed
    if (typeof revisionId === "string" && revisionId.length > 0 && revisionId !== documentId) {
      result.revision_id = revisionId;
    } else if (doc.revisionId) {
      // Fall back to pre-update revision id only if nothing better — prefer post-update get
      try {
        const after = await docs.documents.get({
          documentId,
          fields: "revisionId",
        });
        if (after.data.revisionId) {
          result.revision_id = after.data.revisionId;
        }
      } catch {
        // optional field — ignore
      }
    }

    return result;
  } catch (err) {
    throw mapGoogleError(err);
  }
}
