import { NextResponse } from "next/server";
import { z } from "zod";
import { getDeviceZoom, upsertDeviceZoom } from "@/lib/data";
import { apiError, serverError } from "@/lib/api";

const zoomSchema = z.object({
  deviceId: z.string().min(1),
  songId: z.number().int(),
  zoom: z.number().int().min(25).max(220)
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const deviceId = url.searchParams.get("deviceId") ?? "";
    const songId = Number(url.searchParams.get("songId"));
    if (!deviceId || !songId) return NextResponse.json({ zoom: 100 });
    return NextResponse.json({ zoom: getDeviceZoom(deviceId, songId) });
  } catch (error) {
    return serverError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = zoomSchema.safeParse(await request.json());
    if (!body.success) return apiError(body.error.flatten().fieldErrors);
    upsertDeviceZoom(body.data.deviceId, body.data.songId, body.data.zoom);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
