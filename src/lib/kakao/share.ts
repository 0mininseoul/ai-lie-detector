"use client";

const kakaoSdkUrl = "https://t1.kakaocdn.net/kakao_js_sdk/2.8.1/kakao.min.js";
const kakaoShareDescription = "지금 AI 거짓말탐지기에서 결과를 확인하세요.";

type KakaoShareLink = {
  mobileWebUrl: string;
  webUrl: string;
};

type KakaoShareTemplate = {
  objectType: "feed";
  content: {
    title: string;
    description: string;
    imageUrl: string;
    link: KakaoShareLink;
  };
  buttons: Array<{
    title: string;
    link: KakaoShareLink;
  }>;
};

type KakaoSdk = {
  init: (key: string) => void;
  isInitialized?: () => boolean;
  Share?: {
    sendDefault: (template: KakaoShareTemplate) => void;
  };
};

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

let kakaoSdkPromise: Promise<KakaoSdk> | null = null;

export function hasKakaoShareConfig() {
  return Boolean(process.env.NEXT_PUBLIC_KAKAO_JS_KEY);
}

export async function prepareKakaoShare() {
  const jsKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  if (!jsKey || typeof window === "undefined") return false;

  try {
    const kakao = await loadKakaoSdk();
    initializeKakao(kakao, jsKey);
    return Boolean(kakao.Share?.sendDefault);
  } catch {
    return false;
  }
}

export function shareResultWithKakao({
  url,
  question,
  imageUrl
}: {
  url: string;
  question: string;
  imageUrl: string;
}) {
  const jsKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  if (!jsKey || typeof window === "undefined" || !imageUrl) return false;

  const kakao = window.Kakao;
  if (!kakao) return false;
  if (!kakao.Share?.sendDefault) return false;

  try {
    initializeKakao(kakao, jsKey);

    const link = { mobileWebUrl: url, webUrl: url };

    kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title: question,
        description: kakaoShareDescription,
        imageUrl,
        link
      },
      buttons: [
        {
          title: "결과 보러가기",
          link
        }
      ]
    });
  } catch {
    return false;
  }

  return true;
}

async function loadKakaoSdk() {
  if (window.Kakao) return window.Kakao;
  if (kakaoSdkPromise) return kakaoSdkPromise;

  kakaoSdkPromise = new Promise<KakaoSdk>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${kakaoSdkUrl}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Kakao as KakaoSdk), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = kakaoSdkUrl;
    script.async = true;
    script.onload = () => {
      if (window.Kakao) {
        resolve(window.Kakao);
      } else {
        reject(new Error("Kakao SDK did not initialize"));
      }
    };
    script.onerror = () => reject(new Error("Failed to load Kakao SDK"));
    document.head.appendChild(script);
  });

  return kakaoSdkPromise;
}

function initializeKakao(kakao: KakaoSdk, jsKey: string) {
  if (!kakao.isInitialized?.()) {
    kakao.init(jsKey);
  }
}
