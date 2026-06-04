import { describe, it, expect } from "vitest";
import { apiError, serverError } from "@/lib/api";

describe("apiError", () => {
  it("returns 400 with error message by default", () => {
    const res = apiError("Bad request");
    expect(res.status).toBe(400);
    return res.json().then((body) => {
      expect(body.error).toBe("Bad request");
    });
  });

  it("returns custom status code", () => {
    const res = apiError("Not found", 404);
    expect(res.status).toBe(404);
    return res.json().then((body) => {
      expect(body.error).toBe("Not found");
    });
  });

  it("extracts message from Error objects", () => {
    const res = apiError(new Error("Something broke"));
    return res.json().then((body) => {
      expect(body.error).toBe("Something broke");
    });
  });

  it("returns 'Unknown error' for non-Error values without message", () => {
    const res = apiError(null);
    return res.json().then((body) => {
      expect(body.error).toBe("Unknown error");
    });
  });

  it("returns field errors from Zod flatten", () => {
    const fieldErrors = { title: ["Required"], name: ["Too short"] };
    const res = apiError(fieldErrors);
    return res.json().then((body) => {
      expect(body).toEqual(fieldErrors);
    });
  });
});

describe("serverError", () => {
  it("returns 500 with error message", () => {
    const res = serverError(new Error("Internal failure"));
    expect(res.status).toBe(500);
    return res.json().then((body) => {
      expect(body.error).toBe("Internal failure");
    });
  });

  it("returns 500 with fallback message for unknown errors", () => {
    const res = serverError("weird thing");
    return res.json().then((body) => {
      expect(body.error).toBe("Internal server error");
    });
  });
});