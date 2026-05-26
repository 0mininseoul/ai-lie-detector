export type PassId = "day" | "weekend" | "week";

export type PassProduct = {
  id: PassId;
  name: string;
  tagline: string;
  price: number; // KRW
  durationSeconds: number;
  badge?: string;
};

export const PASS_PRODUCTS: PassProduct[] = [
  {
    id: "day",
    name: "오늘 무제한",
    tagline: "결제 후 24시간 무제한",
    price: 2900,
    durationSeconds: 86_400,
    badge: "🔥 인기"
  },
  {
    id: "weekend",
    name: "주말 무제한",
    tagline: "3일 동안 무제한",
    price: 4900,
    durationSeconds: 259_200
  },
  {
    id: "week",
    name: "1주 무제한",
    tagline: "7일 동안 무제한",
    price: 7900,
    durationSeconds: 604_800
  }
];

const wonFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

export function formatWon(amount: number): string {
  return wonFormatter.format(amount);
}

export function getPassProduct(id: string): PassProduct | undefined {
  return PASS_PRODUCTS.find((product) => product.id === id);
}
