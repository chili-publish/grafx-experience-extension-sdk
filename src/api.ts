import type { ExtensionDetails } from "./types";

interface ApiRequestContext {
  apiUrl: string;
  tenantDomain: string;
  authTokenJwt: string;
}

/** Derives the Platform API origin from handshake `baseUrl`. */
export function deriveApiUrl(baseUrl: string): string {
  if (baseUrl.startsWith("/")) {
    return baseUrl;
  }

  const url = new URL(baseUrl);
  url.hostname = `api.${url.hostname}`;
  return url.origin;
}

/**
 * Platform API base URL from handshake context.
 *
 * Prefers the host-sent `apiUrl` as-is; otherwise derives it from `baseUrl`
 * (hosts that predate `apiUrl`).
 */
export function resolveApiUrl(
  extensionDetails: ExtensionDetails | null,
): string | null {
  const apiUrl = extensionDetails?.apiUrl;
  if (typeof apiUrl === "string" && apiUrl) {
    return apiUrl;
  }

  const baseUrl = extensionDetails?.baseUrl;
  if (!baseUrl) {
    return null;
  }

  try {
    return deriveApiUrl(baseUrl);
  } catch {
    return null;
  }
}

function resolveApiEndpoint(apiUrl: string, endpoint: string): string {
  if (!endpoint.startsWith("/") || endpoint.startsWith("//")) {
    throw new Error(
      'API endpoint must be a root-relative path starting with a single "/".',
    );
  }

  return `${apiUrl.replace(/\/+$/, "")}${endpoint}`;
}

export async function callApi<T>(
  endpoint: string,
  context: ApiRequestContext,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  headers.set("Authorization", `Bearer ${context.authTokenJwt}`);
  headers.set("X-Tenant", context.tenantDomain);

  const response = await fetch(resolveApiEndpoint(context.apiUrl, endpoint), {
    ...options,
    headers,
  });

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    throw new Error(`API call failed: ${response.status}${statusText}.`);
  }

  return (await response.json()) as T;
}
