type ApiResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

/**
 * Fetch JSON from `url`, never throwing. Checks `res.ok` and safely parses the
 * response body, surfacing failures as `{ error }` instead of letting a bad
 * response or malformed JSON crash the caller (e.g. leave a page spinning forever).
 */
export async function apiGet<T>(url: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { error: `Request failed (${res.status})` };
    }
    const data = (await res.json()) as T;
    return { data };
  } catch {
    return { error: "Network error" };
  }
}

/**
 * Send JSON to `url` via POST/PATCH/DELETE/etc, never throwing. Checks `res.ok`
 * and safely parses the response body, surfacing failures as `{ error }`.
 */
export async function apiSend<T>(
  url: string,
  method: "POST" | "PATCH" | "DELETE" | "PUT",
  body?: unknown
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      return { error: `Request failed (${res.status})` };
    }
    const text = await res.text();
    const data = (text ? JSON.parse(text) : undefined) as T;
    return { data };
  } catch {
    return { error: "Network error" };
  }
}
