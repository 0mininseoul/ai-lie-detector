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
        {/*
          Preload 의 crossOrigin 속성은 빼면 안 됨. @font-face fetch 는
          항상 anonymous CORS 인데 preload 가 일반 fetch 로 떨어지면
          credentials mode 가 안 맞아서 Safari 가 dedup 실패하면서 face
          자체가 broken state 가 되는 사례 발생. 같은 origin 이라도 반드시
          crossOrigin="anonymous" 로 맞춰야 한다.

          above-the-fold 에서 가장 많이 보이는 두 weight 만 preload:
          ExtraBold(800, 히어로) + Medium(500, 본문). 나머지는 swap 으로 lazy.
        */}
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/Paperlogy-8ExtraBold.woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/Paperlogy-5Medium.woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
