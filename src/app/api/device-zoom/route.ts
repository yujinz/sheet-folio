import { NextResponse } from "next/server";
import { z } from "zod";
import { getDeviceZoom, upsertDeviceZoom } from "@/lib/data";

const zoomSchema = z.object({
  deviceId: z.string().min(1),
  songId: z.number().int(),
  zoom: z.number().int().min(25).max(220)
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get("deviceId") ?? "";
  const songId = Number(url.searchParams.get("songId"));
  if (!deviceId || !songId) return NextResponse.json({ zoom: 100 });
  return NextResponse.json({ zoom: getDeviceZoom(deviceId, songId) });
}

export async function PUT(request: Request) {
  const body = zoomSchema.parse(await request.json());
  upsertDeviceZoom(body.deviceId, body.songId, body.zoom);
  return NextResponse.json({ ok: true });
}
