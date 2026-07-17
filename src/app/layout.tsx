import type { Metadata, Viewport } from "next";
import "./globals.css";
import DemoInit from "@/components/DemoInit";

export const metadata: Metadata = {
  title: "乐谱管理器",
  description: "Sheet Music Manager"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <DemoInit />
        {children}
      </body>
    </html>
  );
}
