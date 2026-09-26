import { NextResponse } from "next/server";

import { auth } from "@/auth";

export default auth((req) => {
  if (!req.auth) {
    const login = new URL("/login", req.url);
    login.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
});

export const config = {
  matcher: ["/hub", "/dashboard/:path*", "/service"],
};
