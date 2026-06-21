import type { NextFunction, Request, Response } from "express";

const PHOTOS_WEB_URL = process.env.PHOTOS_WEB_URL ?? "http://localhost:3010";
const PHOTOS_API_URL = process.env.PHOTOS_API_URL ?? "http://localhost:8010";

const loginRedirect = (res: Response) => {
  const target = `${PHOTOS_WEB_URL}/login?callbackUrl=${encodeURIComponent("/video")}`;
  res.redirect(target);
};

export const requireVideoAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token =
    typeof req.query.token === "string"
      ? req.query.token
      : typeof req.cookies?.videoAccess === "string"
        ? req.cookies.videoAccess
        : undefined;

  if (!token) {
    loginRedirect(res);
    return;
  }

  try {
    const response = await fetch(`${PHOTOS_API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      loginRedirect(res);
      return;
    }

    if (typeof req.query.token === "string") {
      res.cookie("videoAccess", token, {
        httpOnly: true,
        maxAge: 8 * 60 * 60 * 1000,
        sameSite: "lax",
      });
    }

    next();
  } catch {
    loginRedirect(res);
  }
};
