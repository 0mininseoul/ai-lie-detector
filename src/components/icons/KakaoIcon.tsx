import type { SVGProps } from "react";

/**
 * KakaoTalk speech-bubble logo. Two-tone (bubble fill + face mark).
 * Designed to sit inside a kakao-yellow button — the bubble fill defaults to
 * currentColor so it inherits the button's foreground color.
 */
export function KakaoIcon({ size = 18, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      aria-hidden
      {...props}
    >
      <path
        fill="currentColor"
        d="M128 36C68.2 36 20 73.6 20 120.1c0 30 20 56.3 50.1 71.2-1.4 5-9 31.5-10.3 35.5-1.4 4.7 1.7 4.7 3.6 3.4 1.4-1 22.2-15.1 31.3-21.3 10.7 1.6 21.9 2.4 33.3 2.4 59.8 0 108-37.6 108-84.2S187.8 36 128 36Z"
      />
    </svg>
  );
}
