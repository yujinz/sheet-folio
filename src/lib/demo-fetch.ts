/**
 * Demo-mode fetch interceptor.
 *
 * When NEXT_PUBLIC_DEMO_MODE is "true", this overrides window.fetch to route
 * all /api/* calls through the demo sessionStorage store instead of hitting
 * the real server API routes (which don't exist in static export).
 *
 * Non-API URLs (external resources, video embeds, etc.) pass through to
 * the original fetch.
 *
 * 🔄 DEMO SYNC: When a new API route is added to src/app/api/, add a matching
 *    handler in the ROUTES array below AND the corresponding operation in
 *    demo-store.ts. The build will fail if a handler is missing.
 */
 * ⚠️ DEMO SYNC: If a new API route is added, add a handler here.
 */

import * as demoStore from "@/lib/demo-store";

type RouteHandler = (url: URL, init: RequestInit, params: Record<string, string>) => Promise<Response>;

// ─── Helpers ───────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function okResponse(): Response {
  return jsonResponse({ ok: true });
}

function notFound(): Response {
  return jsonResponse({ error: "Not found" }, 404);
}

function badRequest(message: string): Response {
  return jsonResponse({ error: message }, 400);
}

/** Match a URL path against a pattern like /api/pieces/:id/images */
function matchPath(path: string, pattern: string): Record<string, string> | null {
  const pathParts = path.replace(/\/$/, "").split("/");
  const patternParts = pattern.split("/");
  if (pathParts.length !== patternParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

/** Read the request body as JSON, returning undefined on failure. */
async function readJson(init: RequestInit | undefined): Promise<Record<string, unknown> | undefined> {
  if (!init?.body) return undefined;
  try {
    return JSON.parse(init.body as string);
  } catch {
    return undefined;
  }
}

/** Read a data URL from a File via FileReader. */
function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ─── Route handlers ────────────────────────────────────────────────────────

const ROUTES: { pattern: string; methods: Record<string, RouteHandler> }[] = [
  // ── Pieces ──────────────────────────────────────────────────────────
  {
    pattern: "/api/pieces",
    methods: {
      GET: async () => jsonResponse(demoStore.getPieces()),
      POST: async (_url, init) => {
        const body = await readJson(init);
        const song = demoStore.createPiece({
          title: (body?.title as string) ?? "",
          titleAlt: (body?.titleAlt as string) ?? "",
        });
        return jsonResponse(song, 201);
      },
    },
  },
  {
    pattern: "/api/pieces/:id",
    methods: {
      GET: async (_url, _init, params) => {
        const song = demoStore.getPiece(Number(params.id));
        if (!song) return notFound();
        return jsonResponse(song);
      },
      PATCH: async (_url, init, params) => {
        const body = await readJson(init);
        if (!body) return badRequest("Invalid JSON body");
        const song = demoStore.updatePiece(Number(params.id), {
          title: body.title as string | undefined,
          titleAlt: body.titleAlt as string | undefined,
          difficulty: body.difficulty as number | undefined,
          notes: body.notes as string | undefined,
          tagIds: body.tagIds as number[] | undefined,
        });
        if (!song) return notFound();
        return jsonResponse(song);
      },
      DELETE: async (_url, _init, params) => {
        demoStore.deletePiece(Number(params.id));
        return okResponse();
      },
    },
  },
  {
    pattern: "/api/pieces/:id/images",
    methods: {
      POST: async (_url, init, params) => {
        const songId = Number(params.id);
        const formData = init?.body instanceof FormData ? init.body : null;
        if (!formData) return badRequest("Expected multipart form data");

        const kind = formData.get("kind") as string;
        if (kind !== "staff" && kind !== "numbered") {
          return badRequest("kind must be 'staff' or 'numbered'");
        }
        const files = formData.getAll("files").filter((f): f is File => f instanceof File);

        // Read all files as data URLs first (async)
        const entries = await Promise.all(
          files.map(async (file) => ({
            dataUrl: await readFileAsDataURL(file),
            filename: file.name,
          })),
        );

        const song = demoStore.uploadImages(songId, kind, entries);
        if (!song) return notFound();
        return jsonResponse(song);
      },
      PATCH: async (_url, init, params) => {
        const body = await readJson(init);
        if (!body || !body.kind || !Array.isArray(body.ids)) {
          return badRequest("Expected { kind: string, ids: number[] }");
        }
        const song = demoStore.reorderImages(Number(params.id), body.kind as "staff" | "numbered", body.ids as number[]);
        if (!song) return notFound();
        return jsonResponse(song);
      },
      DELETE: async (_url, init, params) => {
        const body = await readJson(init);
        if (!body || !Array.isArray(body.ids)) {
          return badRequest("Expected { ids: number[] }");
        }
        const song = demoStore.deleteImages(Number(params.id), body.ids as number[]);
        if (!song) return notFound();
        return jsonResponse(song);
      },
    },
  },
  {
    pattern: "/api/pieces/:id/images/:imageId",
    methods: {
      PATCH: async (_url, init, params) => {
        const body = await readJson(init);
        if (!body || !("sourceUrl" in body)) {
          return badRequest("Expected { sourceUrl: string | null }");
        }
        const song = demoStore.updateImageSource(
          Number(params.id),
          Number(params.imageId),
          (body.sourceUrl as string | null) ?? null,
        );
        if (!song) return notFound();
        return jsonResponse(song);
      },
    },
  },
  {
    pattern: "/api/pieces/:id/links",
    methods: {
      PUT: async (_url, init, params) => {
        const body = await readJson(init);
        if (!body || !Array.isArray(body.links)) {
          return badRequest("Expected { links: [...] }");
        }
        const song = demoStore.saveLinks(Number(params.id), body.links as { label: string; url: string }[]);
        if (!song) return notFound();
        return jsonResponse(song);
      },
    },
  },

  // ── Tags ────────────────────────────────────────────────────────────
  {
    pattern: "/api/tags",
    methods: {
      GET: async () => jsonResponse(demoStore.getTags()),
      POST: async (_url, init) => {
        const body = await readJson(init);
        if (!body || !body.name || !body.color || !body.category) {
          return badRequest("Expected { name, color, category }");
        }
        const result = demoStore.createTag({
          name: body.name as string,
          nameAlt: (body.nameAlt as string) ?? "",
          color: body.color as string,
          category: body.category as string,
        });
        if ("error" in result) {
          return jsonResponse({ error: result.error }, result.status);
        }
        return jsonResponse(result);
      },
      PATCH: async (_url, init) => {
        const body = await readJson(init);
        if (!body || !body.oldCategory || !body.newCategory) {
          return badRequest("Expected { oldCategory, newCategory }");
        }
        if (body.oldCategory === body.newCategory) {
          return jsonResponse({ error: "New category must differ from old category" }, 400);
        }
        const tags = demoStore.renameTagCategory(body.oldCategory as string, body.newCategory as string);
        return jsonResponse({ updated: tags.length, tags });
      },
      DELETE: async (url) => {
        const category = url.searchParams.get("category");
        if (!category) return badRequest("category query parameter is required");
        const deleted = demoStore.deleteTagsInCategory(category);
        return jsonResponse({ deleted });
      },
    },
  },
  {
    pattern: "/api/tags/:id",
    methods: {
      PATCH: async (_url, init, params) => {
        const body = await readJson(init);
        if (!body) return badRequest("Invalid JSON body");
        const result = demoStore.updateTag(Number(params.id), {
          name: body.name as string | undefined,
          nameAlt: body.nameAlt as string | undefined,
          color: body.color as string | undefined,
          category: body.category as string | undefined,
        });
        if (result === null) return notFound();
        if ("error" in result) {
          return jsonResponse({ error: result.error }, result.status);
        }
        return jsonResponse(result);
      },
      DELETE: async (_url, _init, params) => {
        demoStore.deleteTag(Number(params.id));
        return okResponse();
      },
    },
  },

  // ── Categories ──────────────────────────────────────────────────────
  {
    pattern: "/api/categories",
    methods: {
      GET: async () => jsonResponse(demoStore.getCategories()),
      POST: async (_url, init) => {
        const body = await readJson(init);
        if (!body || !body.key) return badRequest("Expected { key }");
        const result = demoStore.createCategory({
          key: body.key as string,
          name: body.name as string | undefined,
          nameAlt: body.nameAlt as string | undefined,
        });
        if ("error" in result) {
          return jsonResponse({ error: result.error }, result.status);
        }
        return jsonResponse(result);
      },
      PATCH: async (_url, init) => {
        const body = await readJson(init);
        if (!body || !body.key) return badRequest("Expected { key }");
        const result = demoStore.updateCategory({
          key: body.key as string,
          oldKey: body.oldKey as string | undefined,
          name: body.name as string | undefined,
          nameAlt: body.nameAlt as string | undefined,
        });
        return jsonResponse(result);
      },
      DELETE: async (url) => {
        const key = url.searchParams.get("key");
        if (!key) return badRequest("key query parameter is required");
        demoStore.deleteCategory(key);
        return okResponse();
      },
    },
  },

  // ── Single-Select Categories ────────────────────────────────────────
  {
    pattern: "/api/single-select-categories",
    methods: {
      GET: async () => jsonResponse(demoStore.getSingleSelectCategories()),
      POST: async (_url, init) => {
        const body = await readJson(init);
        if (!body || !body.category) return badRequest("Expected { category }");
        const result = demoStore.addSingleSelectCategory(body.category as string);
        if ("error" in result) {
          return jsonResponse({ error: result.error }, result.status);
        }
        return jsonResponse(result);
      },
      DELETE: async (url) => {
        const category = url.searchParams.get("category");
        if (!category) return badRequest("category query parameter is required");
        demoStore.removeSingleSelectCategory(category);
        return okResponse();
      },
    },
  },

  // ── Device Zoom ─────────────────────────────────────────────────────
  {
    pattern: "/api/device-zoom",
    methods: {
      GET: async (url) => {
        const deviceId = url.searchParams.get("deviceId") ?? "";
        const songId = Number(url.searchParams.get("songId"));
        if (!deviceId || !songId) return jsonResponse({ zoom: 100 });
        return jsonResponse({ zoom: demoStore.getDeviceZoom(deviceId, songId) });
      },
      PUT: async (_url, init) => {
        const body = await readJson(init);
        if (!body || !body.deviceId || !body.songId || body.zoom === undefined) {
          return badRequest("Expected { deviceId, songId, zoom }");
        }
        demoStore.setDeviceZoom(body.deviceId as string, body.songId as number, body.zoom as number);
        return okResponse();
      },
    },
  },

  // ── Health ──────────────────────────────────────────────────────────
  {
    pattern: "/api/health",
    methods: {
      GET: async () => jsonResponse(demoStore.healthCheck()),
    },
  },

  // ── Uploads (not supported in demo - return placeholder) ────────────
  {
    pattern: "/api/uploads/:rest*",
    methods: {
      GET: async () => {
        // Return a transparent 1x1 pixel GIF as a graceful no-image placeholder
        return new Response(
          "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
          {
            status: 200,
            headers: {
              "Content-Type": "image/gif",
              "Cache-Control": "no-cache",
            },
          },
        );
      },
    },
  },
];

// ─── Router ────────────────────────────────────────────────────────────────

function routeRequest(
  url: URL,
  init: RequestInit,
): { handler: RouteHandler; params: Record<string, string> } | null {
  const path = url.pathname.replace(/\/$/, "") || "/";
  const method = (init.method ?? "GET").toUpperCase();

  for (const route of ROUTES) {
    const params = matchPath(path, route.pattern);
    if (!params) continue;
    const handler = route.methods[method];
    if (!handler) continue;
    return { handler, params };
  }

  return null;
}

// ─── Install override ──────────────────────────────────────────────────────

let installed = false;

export function installDemoFetch(): void {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function demoFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = typeof input === "string"
      ? new URL(input, window.location.origin)
      : input instanceof URL
        ? new URL(input.href)
        : new URL(input.url, window.location.origin);

    // Only intercept /api/* calls
    if (!url.pathname.startsWith("/api/")) {
      return originalFetch(input, init);
    }

    const matched = routeRequest(url, init ?? { method: "GET" });
    if (!matched) {
      console.warn(`[demo] Unhandled API route: ${init?.method ?? "GET"} ${url.pathname}`);
      return jsonResponse({ error: "Not implemented in demo mode" }, 501);
    }

    try {
      return await matched.handler(url, init ?? {}, matched.params);
    } catch (err) {
      console.error(`[demo] Error handling ${init?.method ?? "GET"} ${url.pathname}:`, err);
      return jsonResponse({ error: "Internal demo error" }, 500);
    }
  };
}
