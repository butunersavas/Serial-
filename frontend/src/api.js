const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const USER = 'web-kullanici';

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'X-User': USER,
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'İstek başarısız oldu');
  }
  return response.json();
}

export function getDashboard() {
  return request('/dashboard');
}

export function getLogs() {
  return request('/logs');
}

export function getFindings(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value !== false && value !== null && value !== undefined) params.append(key, value);
  });
  return request(`/findings?${params.toString()}`);
}

export function updateFinding(id, payload) {
  return request(`/findings/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function importExcel(file) {
  const formData = new FormData();
  formData.append('file', file);
  return request('/import', { method: 'POST', body: formData });
}

export function exportUrl() {
  return `${API_URL}/export`;
}
