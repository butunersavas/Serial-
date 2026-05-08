export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
const USER = 'web-kullanici';

function friendlyError(error) {
  if (error instanceof TypeError) {
    return 'Backend servisine ulaşılamıyor. Lütfen http://localhost:8000/api/health adresini kontrol edin.';
  }
  return error.message || 'İstek başarısız oldu';
}

async function request(path, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
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
    if (options.raw) return response;
    return response.json();
  } catch (error) {
    throw new Error(friendlyError(error));
  }
}

export function getDashboard() {
  return request('/dashboard/summary');
}

export function getLogs() {
  return request('/logs');
}

export function getFindings(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value !== false && value !== null && value !== undefined) params.append(key, value);
  });
  return request(`/findings?${params.toString()}`);
}

export function createFinding(payload) {
  return request('/findings', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateFinding(id, payload) {
  return request(`/findings/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteFinding(id) {
  return request(`/findings/${id}`, { method: 'DELETE' });
}

export function previewExcel(file) {
  const formData = new FormData();
  formData.append('file', file);
  return request('/import/excel?preview=true', { method: 'POST', body: formData });
}

export function importExcel(file) {
  const formData = new FormData();
  formData.append('file', file);
  return request('/import/excel', { method: 'POST', body: formData });
}

export function exportUrl() {
  return `${API_BASE_URL}/export/excel`;
}
