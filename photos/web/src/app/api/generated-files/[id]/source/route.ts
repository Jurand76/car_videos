import { auth } from "@/auth";
import { api } from "@/lib/api";
import { proxyImageResponse } from "@/lib/proxy-image-response";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.accessToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const response = await fetch(api.generatedFileSourceUrl(id), {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });

  if (!response.ok) {
    return new Response("Not found", { status: response.status });
  }

  return proxyImageResponse(response, "private, max-age=300");
}
