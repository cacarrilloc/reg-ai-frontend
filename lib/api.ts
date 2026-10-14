const DEFAULT_API_PORT = "8000";
const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const LOCAL_API_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);
/** Same-origin prefix; Next.js rewrites this to NEXT_PUBLIC_API_BASE_URL. */
export const BROWSER_API_PROXY_PREFIX = "/backend-api";
/** Matches backend MAX_POLICY_UPLOAD_MB. Vercel/Next proxies reject much sooner (~4.5–10 MB). */
export const MAX_UPLOAD_MB = 50;
const MULTIPART_TIMEOUT_MS = 180_000;

type GetAccessToken = () => Promise<string | null>;

export type ApiFetchOptions = {
  token?: string | null;
  orgId?: string | null;
  orgName?: string | null;
  timeoutMs?: number;
  /** Skip the Vercel/Next rewrite. Long Railway calls (redline sync) otherwise 502. */
  direct?: boolean;
};

async function readResponseText(response: Response): Promise<string> {
  if (typeof response.text === "function") {
    return response.text();
  }

  // Vitest mocks sometimes only implement json(); keep CI resilient.
  const maybeJson = (response as { json?: () => Promise<unknown> }).json;
  if (typeof maybeJson === "function") {
    return JSON.stringify(await maybeJson.call(response));
  }

  return "";
}

/**
 * Resolves the Supabase access token used to authenticate backend requests.
 * `getToken` typically wraps the current Supabase session's access token.
 */
export async function getBackendAuthToken(getToken: GetAccessToken): Promise<string | null> {
  return getToken();
}

export function getDirectApiBaseUrl(): string {
  const configuredUrl = configuredApiBaseUrl?.trim().replace(/\/$/, "") || "";

  if (typeof window === "undefined") {
    return configuredUrl || "https://reg-ai-backend-dev.up.railway.app";
  }

  if (!configuredUrl) {
    return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_API_PORT}`;
  }

  return configuredUrl;
}

export function getApiBaseUrl(): string {
  const configuredUrl = configuredApiBaseUrl?.trim().replace(/\/$/, "") || "";

  if (typeof window === "undefined") {
    return configuredUrl || "https://reg-ai-backend-dev.up.railway.app";
  }

  // Hosted backends (Railway) are third-party to Vercel/local UIs. Firefox
  // tracking protection surfaces that as NetworkError; proxy through this origin.
  // Multipart uploads skip this proxy — Vercel/Next reject bodies over ~4.5–10 MB (413).
  if (configuredUrl && shouldProxyHostedApiThroughFrontend(configuredUrl)) {
    return `${browserOrigin()}${BROWSER_API_PROXY_PREFIX}`;
  }

  if (!configuredUrl) {
    return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_API_PORT}`;
  }

  return configuredUrl;
}

function resolveApiBaseUrl(init?: RequestInit, options: ApiFetchOptions = {}): string {
  if (init?.body instanceof FormData || options.direct) {
    return getDirectApiBaseUrl();
  }
  return getApiBaseUrl();
}

function browserOrigin(): string {
  const { origin, protocol, hostname, port } = window.location;
  if (origin) {
    return origin;
  }
  const portPart = port ? `:${port}` : "";
  return `${protocol}//${hostname}${portPart}`;
}

function shouldProxyHostedApiThroughFrontend(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return !LOCAL_API_HOSTNAMES.has(hostname) && !isPrivateNetworkHostname(hostname);
  } catch {
    return false;
  }
}

function canUsePageHostnameForLocalApi(hostname: string): boolean {
  if (LOCAL_API_HOSTNAMES.has(hostname)) {
    return true;
  }

  if (/^10(?:\.\d{1,3}){3}$/.test(hostname)) {
    return true;
  }

  if (/^192\.168(?:\.\d{1,3}){2}$/.test(hostname)) {
    return true;
  }

  return /^172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(hostname);
}

function isPrivateNetworkHostname(hostname: string): boolean {
  return canUsePageHostnameForLocalApi(hostname);
}

function getLocalApiFallbackUrls(url: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.pathname === BROWSER_API_PROXY_PREFIX || parsedUrl.pathname.startsWith(`${BROWSER_API_PROXY_PREFIX}/`)) {
      return [];
    }
    // Never rewrite hosted API origins (Railway/Vercel) onto loopback — that
    // produces nonsense like https://localhost/api/... without a port.
    if (
      !LOCAL_API_HOSTNAMES.has(parsedUrl.hostname) &&
      !isPrivateNetworkHostname(parsedUrl.hostname)
    ) {
      return [];
    }

    const pageHostname = window.location.hostname;
    const fallbackHosts = new Set<string>();

    if (LOCAL_API_HOSTNAMES.has(parsedUrl.hostname)) {
      fallbackHosts.add("127.0.0.1");
      fallbackHosts.add("localhost");
    }

    if (isPrivateNetworkHostname(parsedUrl.hostname)) {
      fallbackHosts.add("127.0.0.1");
      fallbackHosts.add("localhost");
    }

    // When the UI is opened via a LAN IP, also try that host for the API.
    if (canUsePageHostnameForLocalApi(pageHostname)) {
      fallbackHosts.add(pageHostname);
    }

    const port = parsedUrl.port || DEFAULT_API_PORT;

    return [...fallbackHosts]
      .filter((hostname) => hostname !== parsedUrl.hostname)
      .map((hostname) => {
        const fallbackUrl = new URL(parsedUrl);
        fallbackUrl.protocol = "http:";
        fallbackUrl.hostname = hostname;
        fallbackUrl.port = port;
        return fallbackUrl.toString().replace(/\/$/, "");
      });
  } catch {
    return [];
  }
}

async function readHttpErrorDetail(response: Response): Promise<string> {
  const statusLine = `${response.status} ${response.statusText}`.trim();
  try {
    const payload = (await response.json()) as { detail?: unknown; error?: unknown };
    if (typeof payload.detail === "string" && payload.detail.trim()) {
      if (response.status === 413 && /^\d{3}(\b|$)/.test(payload.detail.trim())) {
        // Proxies sometimes JSON-encode only the status code.
      } else {
        return payload.detail;
      }
    }
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  } catch {
    // Proxies often return an empty 413 with no JSON.
  }
  if (response.status === 413) {
    return `This file is too large to upload. Pitch decks and documents can be up to ${MAX_UPLOAD_MB} MB.`;
  }
  return statusLine;
}

export async function apiFetch<T>(path: string, init?: RequestInit, options: ApiFetchOptions = {}): Promise<T> {
  const headers = new Headers(init?.headers);
  const isMultipart = init?.body instanceof FormData;
  if (!isMultipart && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }
  if (options.orgId) {
    headers.set("x-org-id", options.orgId);
  }
  if (options.orgName) {
    headers.set("x-org-name", options.orgName);
  }

  const url = `${resolveApiBaseUrl(init, options)}${path}`;
  const urls = [url, ...getLocalApiFallbackUrls(url)];
  const timeoutMs = options.timeoutMs ?? (isMultipart ? MULTIPART_TIMEOUT_MS : undefined);
  let response: Response | undefined;
  const errors: string[] = [];

  for (const requestUrl of urls) {
    try {
      response = await fetch(requestUrl, {
        ...init,
        headers,
        cache: "no-store",
        signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined
      });
      break;
    } catch (error) {
      errors.push(`${requestUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!response) {
    throw new Error(
      `Unable to reach API. Tried ${urls.join(", ")}. Confirm the backend is running and CORS is allowed. ${errors.join("; ")}`
    );
  }

  if (!response.ok) {
    throw new Error(`API request failed: ${await readHttpErrorDetail(response)}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await readResponseText(response);
  if (!text.trim()) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export async function apiDownloadFile(
  path: string,
  filename: string,
  options: ApiFetchOptions = {}
): Promise<void> {
  const headers = new Headers();
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }
  if (options.orgId) {
    headers.set("x-org-id", options.orgId);
  }
  if (options.orgName) {
    headers.set("x-org-name", options.orgName);
  }

  const url = `${(options.direct ? getDirectApiBaseUrl() : getApiBaseUrl())}${path}`;
  const urls = [url, ...getLocalApiFallbackUrls(url)];
  const timeoutMs = options.timeoutMs ?? 180_000;
  let response: Response | undefined;
  const errors: string[] = [];

  for (const requestUrl of urls) {
    try {
      response = await fetch(requestUrl, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs)
      });
      break;
    } catch (error) {
      errors.push(`${requestUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!response) {
    throw new Error(
      `Unable to reach API. Tried ${urls.join(", ")}. Confirm the backend is running. ${errors.join("; ")}`
    );
  }

  if (!response.ok) {
    throw new Error(`API request failed: ${await readHttpErrorDetail(response)}`);
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}

export async function downloadBlobFromUrl(url: string, filename: string): Promise<void> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}
