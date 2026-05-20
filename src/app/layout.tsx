import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 거짓말탐지기",
  description: "AI는 과연 거짓말을 알아챌 수 있을까?"
};

export const viewport: Viewport = {
  themeColor: "#060a10",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" data-theme="liquid-glass" className="dark">
      <head>
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/Pretendard-Bold.subset.woff2"
        />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/Pretendard-Regular.subset.woff2"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
