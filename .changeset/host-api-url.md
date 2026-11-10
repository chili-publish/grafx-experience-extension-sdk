---
"@kadanza/extension-sdk": minor
---

Read the Platform API base URL from the host.

- `ExtensionDetails` gains an optional `apiUrl`: the parent's API client base URL (origin, or origin plus path).
- `getApiUrl()` and `apiCall` prefer `apiUrl`. Hosts that omit it still fall back to `api.{hostname}` derived from `baseUrl`.
- `baseUrl` stays the parent application URL.
