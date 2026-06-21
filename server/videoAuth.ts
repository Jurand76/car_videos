import type { NextFunction, Request, Response } from "express";

const PHOTOS_WEB_URL = process.env.PHOTOS_WEB_URL ?? "http://localhost:3010";
const PHOTOS_API_URL = process.env.PHOTOS_API_URL ?? "http://localhost:8010";

export type VideoUser = {
  id: string;
  email: string;
  name: string | null;
};

declare global {
  namespace Express {
    interface Request {
      videoUser?: VideoUser;
      videoAccessToken?: string;
    }
  }
}

const loginRedirect = (res: Response) => {
  const target = `${PHOTOS_WEB_URL}/login?callbackUrl=${encodeURIComponent("/video")}`;
  res.redirect(target);
};

export const getVideoAccessToken = (req: Request): string | undefined => {
  if (typeof req.query.token === "string") {
    return req.query.token;
  }
  if (typeof req.cookies?.videoAccess === "string") {
    return req.cookies.videoAccess;
  }
  return undefined;
};

const fetchVideoUser = async (token: string): Promise<VideoUser | null> => {
  try {
    const response = await fetch(`${PHOTOS_API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as {
      id: string;
      email: string;
      name?: string | null;
    };
    return {
      id: data.id,
      email: data.email,
      name: data.name ?? null,
    };
  } catch {
    return null;
  }
};

export const requireVideoAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = getVideoAccessToken(req);

  if (!token) {
    loginRedirect(res);
    return;
  }

  const user = await fetchVideoUser(token);
  if (!user) {
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

  req.videoUser = user;
  req.videoAccessToken = token;
  next();
};

export const requireVideoAuthApi = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = getVideoAccessToken(req);

  if (!token) {
    res.status(401).json({ error: "Wymagane logowanie." });
    return;
  }

  const user = await fetchVideoUser(token);
  if (!user) {
    res.status(401).json({ error: "Sesja wygasła — zaloguj się ponownie." });
    return;
  }

  req.videoUser = user;
  req.videoAccessToken = token;
  next();
};
