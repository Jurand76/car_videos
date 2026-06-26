import { NextResponse } from "next/server";

import { auth } from "@/auth";

export default auth((req) => {
  if (!req.auth) {
    const login = new URL("/login", req.url);
    login.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  const protectedPanels = ["/video", "/service"];
  if (
    protectedPanels.includes(req.nextUrl.pathname) &&
    !req.nextUrl.searchParams.has("token") &&
    typeof req.auth.accessToken === "string"
  ) {
    const url = req.nextUrl.clone();
    url.searchParams.set("token", req.auth.accessToken);
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: ["/hub", "/dashboard/:path*", "/video", "/service"],
};
