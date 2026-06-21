import { auth } from "@/auth";
import { api } from "@/lib/api";

type Params = {
  params: Promise<{ projectId: string; fileType: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.accessToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { projectId, fileType } = await params;
  const allowed = ["car", "background", "result"];
  if (!allowed.includes(fileType)) {
    return new Response("Not found", { status: 404 });
  }

  const url = api.fileUrl(
    projectId,
    fileType as "car" | "background" | "result",
  );

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });

  if (!response.ok) {
    return new Response("Not found", { status: response.status });
  }

  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "image/jpeg";

  return new Response(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=60",
    },
  });
}
