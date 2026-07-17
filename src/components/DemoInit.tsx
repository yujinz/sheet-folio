"use client";

import { useEffect } from "react";
import { installDemoFetch } from "@/lib/demo-fetch";

/**
 * Client-side initializer for demo mode.
 * Installs the fetch interceptor that routes all /api/* calls through
 * the sessionStorage-based demo store.
 */
export default function DemoInit() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      installDemoFetch();
    }
  }, []);

  return null;
}
