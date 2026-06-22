const API_URL =
  (typeof window === "undefined" ? process.env.API_URL : undefined) ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8010";

export type User = {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
};

export type ProjectType = "advanced" | "photo_series" | "simple";

export type SeriesCategory = string;

export type PhotoSeriesItem = {
  id: string;
  project_id: string;
  category: SeriesCategory;
  sort_order: number;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type SavedPrompt = {
  id: string;
  name: string;
  prompt_text: string;
  created_at: string;
  updated_at: string;
};

export type GeneratedFileScope = "renders" | "series" | "all";

export type GeneratedFile = {
  id: string;
  project_id: string | null;
  project_name: string;
  project_type: ProjectType;
  series_category: SeriesCategory | null;
  source_item_id: string | null;
  label: string | null;
  created_at: string;
};

export type OpenAiBilling = {
  status: "ok" | "usage_only" | "unavailable" | "no_key";
  available_usd: number | null;
  granted_usd: number | null;
  used_usd: number | null;
  pending_usd: number | null;
  month_spend_usd: number | null;
  message: string;
  billing_url: string;
  updated_at: string;
};

export type SavedBackground = {
  id: string;
  filename: string;
  created_at: string;
};

export type Project = {
  id: string;
  name: string;
  project_type: ProjectType;
  car_image_path: string | null;
  background_image_path: string | null;
  result_image_path: string | null;
  settings: Record<string, unknown> | null;
  status: string;
  created_at: string;
  updated_at: string;
  preview_series_item_id?: string | null;
};

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = RequestInit & { timeoutMs?: number };

async function request<T>(
  path: string,
  options: RequestOptions = {},
  token?: string,
): Promise<T> {
  const { timeoutMs = 30_000, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!(fetchOptions.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    let detail = "Wystąpił błąd";
    try {
      const data = await response.json();
      if (typeof data.detail === "string") {
        detail = data.detail;
      } else if (Array.isArray(data.detail)) {
        detail = data.detail
          .map((item: { msg?: string }) => item.msg)
          .filter(Boolean)
          .join(", ");
      }
    } catch {
      // ignore
    }
    throw new ApiError(detail, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const api = {
  register: (email: string, password: string, name?: string) =>
    request<User>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),

  login: (email: string, password: string) =>
    request<{ access_token: string; token_type: string }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: (token: string) => request<User>("/api/v1/auth/me", {}, token),

  listProjects: (token: string) =>
    request<Project[]>("/api/v1/projects", {}, token),

  createProject: (token: string, name = "Nowy projekt", projectType: ProjectType = "advanced") =>
    request<Project>(
      "/api/v1/projects",
      { method: "POST", body: JSON.stringify({ name, project_type: projectType }) },
      token,
    ),

  getProject: (token: string, id: string) =>
    request<Project>(`/api/v1/projects/${id}`, {}, token),

  updateProject: (
    token: string,
    id: string,
    data: { name?: string; settings?: Record<string, unknown> },
  ) =>
    request<Project>(
      `/api/v1/projects/${id}`,
      { method: "PATCH", body: JSON.stringify(data) },
      token,
    ),

  deleteProject: (token: string, id: string) =>
    request<void>(`/api/v1/projects/${id}`, { method: "DELETE" }, token),

  uploadCar: (token: string, id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Project>(
      `/api/v1/projects/${id}/car`,
      { method: "POST", body: form },
      token,
    );
  },

  uploadBackground: (token: string, id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Project>(
      `/api/v1/projects/${id}/background`,
      { method: "POST", body: form },
      token,
    );
  },

  selectProjectBackground: (token: string, id: string, backgroundId: string) =>
    request<Project>(
      `/api/v1/projects/${id}/background/select`,
      { method: "POST", body: JSON.stringify({ background_id: backgroundId }) },
      token,
    ),

  listBackgrounds: (token: string) =>
    request<SavedBackground[]>("/api/v1/backgrounds", {}, token),

  deleteBackground: (token: string, backgroundId: string) =>
    request<void>(
      `/api/v1/backgrounds/${encodeURIComponent(backgroundId)}`,
      { method: "DELETE" },
      token,
    ),

  listGeneratedFiles: (token: string, scope: GeneratedFileScope = "renders") =>
    request<GeneratedFile[]>(`/api/v1/generated-files?scope=${scope}`, {}, token),

  listSavedPrompts: (token: string) =>
    request<SavedPrompt[]>("/api/v1/prompts", {}, token),

  createSavedPrompt: (token: string, data: { name: string; prompt_text: string }) =>
    request<SavedPrompt>(
      "/api/v1/prompts",
      { method: "POST", body: JSON.stringify(data) },
      token,
    ),

  updateSavedPrompt: (
    token: string,
    id: string,
    data: { name?: string; prompt_text?: string },
  ) =>
    request<SavedPrompt>(
      `/api/v1/prompts/${id}`,
      { method: "PATCH", body: JSON.stringify(data) },
      token,
    ),

  deleteSavedPrompt: (token: string, id: string) =>
    request<void>(`/api/v1/prompts/${id}`, { method: "DELETE" }, token),

  getOpenAiBilling: (token: string, options?: { fresh?: boolean }) =>
    request<OpenAiBilling>(
      `/api/v1/billing/openai${options?.fresh ? "?fresh=true" : ""}`,
      {},
      token,
    ),

  aiGenerateProject: (
    token: string,
    id: string,
    data?: { prompt?: string; ai_config?: Record<string, unknown> },
  ) =>
    request<Project>(
      `/api/v1/projects/${id}/ai-generate`,
      {
        method: "POST",
        body: JSON.stringify({
          prompt: data?.prompt ?? null,
          ai_config: data?.ai_config ?? null,
        }),
        timeoutMs: 15_000,
      },
      token,
    ),

  listSeriesItems: (token: string, projectId: string, category?: SeriesCategory) => {
    const params = category ? `?category=${category}` : "";
    return request<PhotoSeriesItem[]>(
      `/api/v1/projects/${projectId}/series-items${params}`,
      {},
      token,
    );
  },

  uploadSeriesItems: (token: string, projectId: string, category: SeriesCategory, files: File[]) => {
    const form = new FormData();
    for (const file of files) {
      form.append("files", file);
    }
    return request<PhotoSeriesItem[]>(
      `/api/v1/projects/${projectId}/series-items?category=${category}`,
      { method: "POST", body: form, timeoutMs: 120_000 },
      token,
    );
  },

  deleteSeriesItem: (token: string, projectId: string, itemId: string) =>
    request<void>(`/api/v1/projects/${projectId}/series-items/${itemId}`, { method: "DELETE" }, token),

  generatePhotoSeries: (
    token: string,
    projectId: string,
    data?: {
      sections?: Array<{ id: string; prompt: string }>;
      section_prompts?: Record<string, string>;
      exterior_prompt?: string;
      interior_prompt?: string;
      ai_config?: Record<string, unknown>;
      section_ai_configs?: Record<string, Record<string, unknown>>;
    },
  ) =>
    request<Project>(
      `/api/v1/projects/${projectId}/series-generate`,
      {
        method: "POST",
        body: JSON.stringify({
          sections: data?.sections ?? null,
          section_prompts: data?.section_prompts ?? null,
          exterior_prompt: data?.exterior_prompt ?? null,
          interior_prompt: data?.interior_prompt ?? null,
          ai_config: data?.ai_config ?? null,
          section_ai_configs: data?.section_ai_configs ?? null,
        }),
        timeoutMs: 15_000,
      },
      token,
    ),

  cancelPhotoSeries: (token: string, projectId: string) =>
    request<Project>(
      `/api/v1/projects/${projectId}/series-cancel`,
      { method: "POST", timeoutMs: 15_000 },
      token,
    ),

  seriesSourceUrl: (projectId: string, itemId: string) =>
    `${API_URL}/api/v1/projects/${projectId}/files/series/${itemId}`,

  seriesResultUrl: (projectId: string, itemId: string) =>
    `${API_URL}/api/v1/projects/${projectId}/files/series-result/${itemId}`,

  fileUrl: (id: string, fileType: "car" | "background" | "result") =>
    `${API_URL}/api/v1/projects/${id}/files/${fileType}`,

  backgroundLibraryFileUrl: (backgroundId: string) =>
    `${API_URL}/api/v1/backgrounds/${encodeURIComponent(backgroundId)}/file`,

  generatedFileUrl: (id: string) => `${API_URL}/api/v1/generated-files/${id}/file`,

  generatedFileSourceUrl: (id: string) => `${API_URL}/api/v1/generated-files/${id}/source`,
};

function formatFetchError(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message;
  }
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || /timed out/i.test(err.message)) {
      return "Przekroczono limit czasu połączenia z API. Generowanie może nadal trwać na serwerze — odśwież projekt za chwilę.";
    }
    return err.message;
  }
  return "Operacja nie powiodła się";
}

export { ApiError, formatFetchError };
