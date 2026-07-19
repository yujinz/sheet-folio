import Detail from "@/components/Detail";

export function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    // Pre-generate detail pages for IDs 1-20 so any piece the user creates
    // (or that exists in seed data) has a working route.
    return Array.from({ length: 20 }, (_, i) => ({ id: String(i + 1) }));
  }
  return [];
}

export default async function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Detail songId={Number(id)} />;
}
