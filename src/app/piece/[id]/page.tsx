import Detail from "@/components/Detail";

export default async function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Detail songId={Number(id)} />;
}
