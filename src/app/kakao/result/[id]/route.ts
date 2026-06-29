import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const resultUrl = new URL(`/result/${encodeURIComponent(id)}`, request.url);

  return NextResponse.redirect(resultUrl, { status: 302 });
}
