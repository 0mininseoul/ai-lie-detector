import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 거짓말탐지기",
  description: "AI는 과연 거짓말을 알아챌 수 있을까?"
};

export const viewport: Viewport = {
  themeColor: "#72e3ad",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" data-theme="liquid-glass">
      <body>{children}</body>
    </html>
  );
}
