import { connection } from "next/server";
import Directory from "@/components/Directory";

export default async function Home() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    // Demo mode is a static export: no SQLite on the server — Directory
    // fetches via the window.fetch interceptor (src/demo/fetch.ts).
    return <Directory />;
  }

  // Mark the route dynamic so production renders per request (always-fresh DB
  // data) instead of baking a build-time snapshot. Demo mode returns above,
  // so the static export path never reaches this.
  await connection();

  // Dynamic import keeps better-sqlite3 out of the demo static export
  // (build-demo renames src/app/api away for the same reason).
  const { getSongs, getTags, getCategories, getSingleSelectCategories } = await import("@/lib/data");
  const [pieces, tags, categories, singleSelectCategories] = await Promise.all([
    getSongs(),
    getTags(),
    getCategories(),
    getSingleSelectCategories(),
  ]);

  return (
    <Directory
      initialData={{ pieces, tags, categories, singleSelectCategories }}
    />
  );
}
