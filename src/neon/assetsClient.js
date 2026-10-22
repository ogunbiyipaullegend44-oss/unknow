import { neon, neonConfigError } from '../community/neonClient.js';

const assetsUrl = import.meta.env.VITE_NEON_FUNCTION_ASSETS_BASE_URL?.trim().replace(/\/+$/, '') || '';

function requireConfiguration() {
  if (!neon) throw new Error(neonConfigError);
  if (!assetsUrl) {
    throw new Error('Neon asset storage is not configured. Set VITE_NEON_FUNCTION_ASSETS_BASE_URL and restart the app.');
  }
}

async function authorizedFetch(path, options = {}) {
  requireConfiguration();
  const { data, error } = await neon.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in to use private asset storage.');
  const response = await fetch(`${assetsUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!response.ok) {
    let message = `Neon asset request failed (${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body.error === 'string') message = body.error;
    } catch {
      throw new Error(message);
    }
    throw new Error(message);
  }
  return response;
}

export async function uploadAvatar(file) {
  const response = await authorizedFetch('/assets/upload/avatar', {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  return (await response.json()).key;
}

export async function getAvatarUrl(key) {
  if (!key) return '';
  const response = await authorizedFetch(`/assets/avatar-url?key=${encodeURIComponent(key)}`);
  return (await response.json()).url;
}

export async function uploadPublicationDocument(content) {
  const response = await authorizedFetch('/assets/upload/publication', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: content,
  });
  return (await response.json()).key;
}

export async function getPublicationDocument(publicationId) {
  const response = await authorizedFetch(
    `/assets/publications/${encodeURIComponent(publicationId)}/document`,
  );
  return response.text();
}

export async function deleteAsset(key) {
  await authorizedFetch('/assets', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
}
