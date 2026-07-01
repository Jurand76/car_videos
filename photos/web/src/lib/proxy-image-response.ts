/** Przekazuje odpowiedź obrazu z API jako stream (bez buforowania całego pliku w RAM). */
export function proxyImageResponse(
  upstream: Response,
  cacheControl: string,
  fallbackContentType = "image/jpeg",
): Response {
  const headers = new Headers();
  headers.set(
    "Content-Type",
    upstream.headers.get("content-type") ?? fallbackContentType,
  );

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  headers.set("Cache-Control", cacheControl);

  if (upstream.body) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  }

  return new Response(null, {
    status: upstream.status,
    headers,
  });
}
