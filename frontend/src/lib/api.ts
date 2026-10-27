const DEFAULT_API_ORIGIN = "http://127.0.0.1:8013";

function getApiOrigin() {
  return (process.env.NEXT_PUBLIC_VUMAGRID_API_URL || DEFAULT_API_ORIGIN).replace(/\/$/, "");
}

export function apiUrl(path: string) {
  return `${getApiOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}

const ACCESS_TOKEN_KEY = "vumagrid-access-token";

export function setAccessToken(token: string) {
  if (typeof window === "undefined") return;
  if (token) window.sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
  else window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init?.headers);
    if (typeof window !== "undefined") {
      const token = window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }
    response = await fetch(apiUrl(path), { ...init, headers });
  } catch {
    throw new Error("Could not reach the Vuma Grid API. Check the API address and connection.");
  }

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (typeof body.message === "string") detail = body.message;
    } catch {
      // Keep the status-based message when the server did not return JSON.
    }
    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}
