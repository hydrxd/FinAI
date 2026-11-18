import { auth } from './firebase';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

// Calls the FinAI backend, attaching the signed-in user's Firebase ID token.
// Throws an Error carrying the backend's `detail` message when the request fails.
export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth.currentUser) headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const detail = typeof error.detail === 'string' ? error.detail : `Request failed (${response.status})`;
    throw new Error(detail);
  }
  return response.status === 204 ? null : response.json();
}
