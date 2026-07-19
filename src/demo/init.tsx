"use client";

import { useEffect } from "react";
import { installDemoFetch } from "@/demo/fetch";

/**
 * Client-side initializer for demo mode.
 * Installs the fetch interceptor that routes all /api/* calls through
 * the IndexedDB demo store.
 */
export default function DemoInit() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      installDemoFetch();
    }
  }, []);

  return null;
}
