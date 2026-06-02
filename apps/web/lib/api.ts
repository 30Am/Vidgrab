import type {
  CreateJobResponse,
  JobStatusResponse,
  ProbeResponse,
  StatsResponse,
} from "@vidgrab/shared";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("NETWORK", "Couldn't reach the server. Check your connection.");
  }

  if (!res.ok) {
    let code = "INTERNAL";
    let message = "Something went wrong.";
    try {
      const body = (await res.json()) as { error?: { code: string; message: string } };
      if (body.error) {
        code = body.error.code;
        message = body.error.message;
      }
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(code, message);
  }

  return (await res.json()) as T;
}

export function probe(url: string, turnstileToken?: string): Promise<ProbeResponse> {
  return request<ProbeResponse>("/api/probe", {
    method: "POST",
    body: JSON.stringify({ url, turnstileToken }),
  });
}

export function createJob(input: {
  url: string;
  formatId: string;
  audioOnly?: boolean;
  container?: "mp4" | "mkv" | "mp3" | "m4a";
  turnstileToken?: string;
}): Promise<CreateJobResponse> {
  return request<CreateJobResponse>("/api/jobs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getJob(jobId: string): Promise<JobStatusResponse> {
  return request<JobStatusResponse>(`/api/jobs/${jobId}`);
}

export function getStats(): Promise<StatsResponse> {
  return request<StatsResponse>("/api/stats");
}

/**
 * Routes a thumbnail through our API image proxy. Some CDNs (Instagram) send
 * `Cross-Origin-Resource-Policy: same-origin`, which makes browsers block the
 * image when loaded cross-origin in an <img> tag.
 */
export function thumbnailProxyUrl(url: string | undefined): string {
  if (!url) return "";
  return `${BASE}/api/thumb?u=${encodeURIComponent(url)}`;
}
