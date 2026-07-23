import type { gmail_v1 } from "googleapis";
import { getGmail } from "../auth/googleAuth.js";
import { AppError, mapGoogleError } from "../types/errors.js";
import {
  buildRawMime,
  emailInputSchema,
  type EmailInput,
} from "./gmailClient.js";

export { emailInputSchema, type EmailInput };

export interface SendEmailResult {
  status: "sent";
  message_id: string;
  thread_id: string;
}

export interface DraftEmailResult {
  status: "draft_created";
  draft_id: string;
  message_id: string;
}

export async function sendEmail(
  input: EmailInput,
  gmailClient?: gmail_v1.Gmail,
): Promise<SendEmailResult> {
  const gmail = gmailClient ?? getGmail();
  const raw = buildRawMime(input);

  try {
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
        ...(input.thread_id ? { threadId: input.thread_id } : {}),
      },
    });

    const messageId = res.data.id;
    const threadId = res.data.threadId;
    if (!messageId || !threadId) {
      throw new AppError("UPSTREAM_ERROR", "Gmail send returned incomplete response", {
        data: res.data,
      });
    }

    return {
      status: "sent",
      message_id: messageId,
      thread_id: threadId,
    };
  } catch (err) {
    throw mapGoogleError(err);
  }
}

export async function draftEmail(
  input: EmailInput,
  gmailClient?: gmail_v1.Gmail,
): Promise<DraftEmailResult> {
  const gmail = gmailClient ?? getGmail();
  const raw = buildRawMime(input);

  try {
    const res = await gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw,
          ...(input.thread_id ? { threadId: input.thread_id } : {}),
        },
      },
    });

    const draftId = res.data.id;
    const messageId = res.data.message?.id;
    if (!draftId || !messageId) {
      throw new AppError("UPSTREAM_ERROR", "Gmail draft create returned incomplete response", {
        data: res.data,
      });
    }

    return {
      status: "draft_created",
      draft_id: draftId,
      message_id: messageId,
    };
  } catch (err) {
    throw mapGoogleError(err);
  }
}
