import { afterEach, describe, expect, it, vi } from "vitest";
import { getApiBaseUrl, getBackendAuthToken } from "./api";
import { apiFetch } from "./api";

describe("getBackendAuthToken", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves the Supabase access token from the provided getter", async () => {
    const getToken = vi.fn().mockResolvedValue("supabase-access-token");

    await expect(getBackendAuthToken(getToken)).resolves.toBe("supabase-access-token");
    expect(getToken).toHaveBeenCalledWith();
  });

  it("returns null when there is no active session", async () => {
    const getToken = vi.fn().mockResolvedValue(null);

    await expect(getBackendAuthToken(getToken)).resolves.toBeNull();
  });
});

describe("getApiBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the browser hostname for local API calls when no env URL is set", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    vi.stubGlobal("window", {
      location: {
        hostname: "127.0.0.1",
        protocol: "http:"
      }
    });

    expect(getApiBaseUrl()).toBe("http://127.0.0.1:8000");
  });

  it("keeps an explicit localhost API URL when the UI is opened via a LAN IP", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:8000");
    vi.resetModules();
    const { getApiBaseUrl: getApiBaseUrlWithEnv } = await import("./api");
    vi.stubGlobal("window", {
      location: {
        hostname: "192.168.4.30",
        protocol: "http:"
      }
    });

    expect(getApiBaseUrlWithEnv()).toBe("http://localhost:8000");
  });

  it("proxies hosted Railway APIs through the current frontend origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://reg-ai-backend-dev.up.railway.app");
    vi.resetModules();
    const { getApiBaseUrl: getApiBaseUrlWithEnv } = await import("./api");
    vi.stubGlobal("window", {
      location: {
        hostname: "reg-ai-dev.vercel.app",
        protocol: "https:",
        origin: "https://reg-ai-dev.vercel.app",
      }
    });

    expect(getApiBaseUrlWithEnv()).toBe("https://reg-ai-dev.vercel.app/backend-api");
  });

  it("keeps the hosted Railway origin for direct multipart uploads", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://reg-ai-backend-dev.up.railway.app");
    vi.resetModules();
    const { getDirectApiBaseUrl } = await import("./api");
    vi.stubGlobal("window", {
      location: {
        hostname: "reg-ai-dev.vercel.app",
        protocol: "https:",
        origin: "https://reg-ai-dev.vercel.app",
      }
    });

    expect(getDirectApiBaseUrl()).toBe("https://reg-ai-backend-dev.up.railway.app");
  });
});

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses backend error details when requests fail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: vi.fn().mockResolvedValue({ detail: "Missing bearer token" })
    }));

    await expect(apiFetch("/api/v1/policies")).rejects.toThrow("API request failed: Missing bearer token");
  });

  it("accepts fetch mocks that only implement json()", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ status: "ok" })
    }));

    await expect(apiFetch<{ status: string }>("/health")).resolves.toEqual({ status: "ok" });
  });

  it("returns undefined for 204 responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn().mockResolvedValue("")
    }));

    await expect(apiFetch("/api/v1/reviews/kick")).resolves.toBeUndefined();
  });

  it("returns undefined for empty successful bodies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("   ")
    }));

    await expect(apiFetch("/api/v1/health")).resolves.toBeUndefined();
  });

  it("retries local API calls with the alternate loopback hostname", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    vi.stubGlobal("window", {
      location: {
        hostname: "localhost",
        protocol: "http:"
      }
    });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("NetworkError when attempting to fetch resource."))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(JSON.stringify({ status: "ok" }))
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch<{ status: string }>("/health")).resolves.toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8000/health",
      expect.objectContaining({ cache: "no-store" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8000/health",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("falls back from a LAN API URL to loopback on the dev machine", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://192.168.4.30:8000");
    vi.resetModules();
    const { apiFetch: apiFetchWithEnv } = await import("./api");
    vi.stubGlobal("window", {
      location: {
        hostname: "192.168.4.30",
        protocol: "http:"
      }
    });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("NetworkError when attempting to fetch resource."))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue("[]")
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetchWithEnv<[]>("/api/v1/regulatory/publications?limit=50")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://192.168.4.30:8000/api/v1/regulatory/publications?limit=50",
      expect.objectContaining({ cache: "no-store" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8000/api/v1/regulatory/publications?limit=50",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("does not rewrite hosted API URLs onto localhost", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://reg-ai-backend-dev.up.railway.app");
    vi.resetModules();
    const { apiFetch: apiFetchWithEnv } = await import("./api");
    vi.stubGlobal("window", {
      location: {
        hostname: "localhost",
        protocol: "http:",
        origin: "http://localhost:3000",
      }
    });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("NetworkError when attempting to fetch resource."));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetchWithEnv("/api/v1/organizations/mine")).rejects.toThrow(
      /Unable to reach API\. Tried http:\/\/localhost:3000\/backend-api\/api\/v1\/organizations\/mine/
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/backend-api/api/v1/organizations/mine",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("sends multipart uploads directly to the hosted API instead of the frontend proxy", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://reg-ai-backend-dev.up.railway.app");
    vi.resetModules();
    const { apiFetch: apiFetchWithEnv } = await import("./api");
    vi.stubGlobal("window", {
      location: {
        hostname: "reg-ai-dev.vercel.app",
        protocol: "https:",
        origin: "https://reg-ai-dev.vercel.app",
      }
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: vi.fn().mockResolvedValue("{}")
    });
    vi.stubGlobal("fetch", fetchMock);

    const body = new FormData();
    body.append("title", "Deck");
    await apiFetchWithEnv("/api/v1/marketing/contents/upload", { method: "POST", body });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://reg-ai-backend-dev.up.railway.app/api/v1/marketing/contents/upload",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("sends direct long-running requests to the hosted API instead of the frontend proxy", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://reg-ai-backend-dev.up.railway.app");
    vi.resetModules();
    const { apiFetch: apiFetchWithEnv } = await import("./api");
    vi.stubGlobal("window", {
      location: {
        hostname: "reg-ai-dev.vercel.app",
        protocol: "https:",
        origin: "https://reg-ai-dev.vercel.app",
      }
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue("{}")
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiFetchWithEnv(
      "/api/v1/reviews/rev-1/generate-redline/sync",
      { method: "POST" },
      { direct: true, timeoutMs: 180_000 }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://reg-ai-backend-dev.up.railway.app/api/v1/reviews/rev-1/generate-redline/sync",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("explains empty 413 responses as an upload size limit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      statusText: "",
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected end of JSON input"))
    }));

    await expect(apiFetch("/api/v1/marketing/contents/upload")).rejects.toThrow(
      "API request failed: This file is too large to upload. Pitch decks and documents can be up to 50 MB."
    );
  });

  it("treats a JSON 413 status-only detail as an upload size limit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      statusText: "",
      json: vi.fn().mockResolvedValue({ detail: "413" })
    }));

    await expect(apiFetch("/api/v1/marketing/contents/upload")).rejects.toThrow(
      "API request failed: This file is too large to upload. Pitch decks and documents can be up to 50 MB."
    );
  });
});
