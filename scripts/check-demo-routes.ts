/**
 * Check that every API route in src/app/api/ has a matching handler
 * in src/lib/demo-fetch.ts ROUTES array.
 *
 * Run: npx tsx scripts/check-demo-routes.ts
 *
 * 🔄 Run this after adding/modifying API routes on the main branch
 *    to ensure the demo branch's fetch interceptor covers them.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

function findRouteFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findRouteFiles(fullPath));
    } else if (entry.name === "route.ts") {
      results.push(fullPath);
    }
  }
  return results;
}

function extractPattern(filePath: string): string {
  // Convert src/app/api/pieces/[id]/route.ts → /api/pieces/:id
  const relative = filePath.replace(/^.*src\/app\/api\//, "").replace(/\/route\.ts$/, "");
  const parts = relative.split("/");
  const pattern = parts
    .map((p) => {
      // Catch-all: [...path] → :*
      if (p.startsWith("[...") && p.endsWith("]")) return ":*";
      // Dynamic segment: [id] → :id
      if (p.startsWith("[") && p.endsWith("]")) return `:${p.slice(1, -1)}`;
      return p;
    })
    .join("/");
  return `/api/${pattern}`;
}

function extractMethods(filePath: string): string[] {
  const content = readFileSync(filePath, "utf-8");
  const methods: string[] = [];
  // Match: export async function METHOD or export const METHOD = ...
  const regex = /\bexport\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)|export\s+const\s+(GET|POST|PATCH|PUT|DELETE)\b/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const method = match[1] || match[2];
    if (method) methods.push(method);
  }
  return [...new Set(methods)];
}

interface RouteEntry {
  pattern: string;
  methods: string[];
}

function parseDemoFetchRoutes(filePath: string): RouteEntry[] {
  const content = readFileSync(filePath, "utf-8");
  const entries: RouteEntry[] = [];

  // Match each route entry block — from "{" before pattern to the closing "}," or "}\n"
  // Use a balanced-brace approach: find each pattern, then scan forward for method names
  const patternRegex = /pattern:\s*"([^"]+)"/g;
  let patternMatch;
  while ((patternMatch = patternRegex.exec(content)) !== null) {
    const pattern = patternMatch[1].replace(/:(\w+)\*/g, ":*");
    const methods: string[] = [];

    // Get text from this pattern line to the next pattern line (or end)
    const startPos = patternMatch.index;
    const nextMatch = patternRegex.lastIndex; // position after this pattern's closing quote

    // Find the methods: {...} block after this pattern
    const methodsMatch = content.slice(nextMatch).match(/methods:\s*\{([\s\S]*?)\},\s*\n\s*\},?\s*\n/);
    if (methodsMatch) {
      const block = methodsMatch[1];
      const methodRegex = /\b(GET|POST|PATCH|PUT|DELETE):\s+async/g;
      let m;
      while ((m = methodRegex.exec(block)) !== null) {
        methods.push(m[1]);
      }
    }

    entries.push({ pattern, methods });
  }

  return entries;
}

function main(): void {
  const apiDir = join(process.cwd(), "src/app/api");
  const demoFetchPath = join(process.cwd(), "src/lib/demo-fetch.ts");

  if (!existsSync(apiDir)) {
    console.error("❌ src/app/api/ not found. Run from project root.");
    process.exit(1);
  }

  if (!existsSync(demoFetchPath)) {
    console.error("❌ src/lib/demo-fetch.ts not found. Run from project root.");
    process.exit(1);
  }

  const routeFiles = findRouteFiles(apiDir);
  const serverRoutes: RouteEntry[] = routeFiles.map((f) => ({
    pattern: extractPattern(f),
    methods: extractMethods(f),
  }));

  const demoRoutes = parseDemoFetchRoutes(demoFetchPath);

  console.log(`\n📋 Server API routes: ${serverRoutes.length}`);
  console.log(`📋 Demo fetch routes: ${demoRoutes.length}\n`);

  let errors = 0;

  for (const server of serverRoutes) {
    const match = demoRoutes.find((d) => d.pattern === server.pattern);
    if (!match) {
      console.error(`❌ MISSING: ${server.pattern} (${server.methods.join(", ")})`);
      errors++;
      continue;
    }

    // Check each method
    for (const method of server.methods) {
      if (!match.methods.includes(method)) {
        console.error(`❌ MISSING METHOD: ${method} ${server.pattern}`);
        errors++;
      }
    }
  }

  if (errors === 0) {
    console.log("✅ All API routes have matching demo-fetch handlers!\n");
  } else {
    console.error(`\n❌ ${errors} issue(s) found. Update src/lib/demo-fetch.ts to add missing handlers.\n`);
    process.exit(1);
  }
}

main();
