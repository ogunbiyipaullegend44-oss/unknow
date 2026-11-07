function configuredApiBaseUrl() {
  return import.meta.env?.VITE_API_BASE_URL ?? '';
}

export function resolveApiUrl(path, baseUrl = configuredApiBaseUrl()) {
  if (typeof path !== 'string' || !path.startsWith('/api/')) {
    throw new TypeError('API paths must begin with /api/.');
  }
  const base = baseUrl.trim().replace(/\/+$/, '');
  return base ? `${base}${path}` : path;
}

export function apiUrl(path) {
  return resolveApiUrl(path);
}
