import { describe, expect, it } from "vitest";
import {
  AppError,
  mapGoogleError,
  toolError,
  toolSuccess,
} from "../src/types/errors.js";

describe("toolSuccess / toolError", () => {
  it("builds success result with structuredContent", () => {
    const result = toolSuccess({ status: "sent", message_id: "m1", thread_id: "t1" });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent.status).toBe("sent");
    expect(result.content[0].type).toBe("text");
  });

  it("builds error result with isError true", () => {
    const result = toolError("INVALID_INPUT", "bad", { field: "to" });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: "error",
      error_code: "INVALID_INPUT",
      message: "bad",
      details: { field: "to" },
    });
  });
});

describe("mapGoogleError", () => {
  it("maps 401 to AUTH_FAILED", () => {
    expect(mapGoogleError({ code: 401, message: "unauthorized" }).errorCode).toBe(
      "AUTH_FAILED",
    );
  });

  it("maps 404 to NOT_FOUND", () => {
    expect(mapGoogleError({ code: 404, message: "missing" }).errorCode).toBe("NOT_FOUND");
  });

  it("maps 429 to RATE_LIMITED", () => {
    expect(mapGoogleError({ code: 429, message: "slow down" }).errorCode).toBe(
      "RATE_LIMITED",
    );
  });

  it("maps other to UPSTREAM_ERROR", () => {
    expect(mapGoogleError({ code: 500, message: "boom" }).errorCode).toBe(
      "UPSTREAM_ERROR",
    );
  });

  it("passes through AppError", () => {
    const err = new AppError("INVALID_INPUT", "x");
    expect(mapGoogleError(err)).toBe(err);
  });
});
