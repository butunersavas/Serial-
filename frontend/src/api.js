export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
const USER = 'admin';

function friendlyError(error) {
  if (error instanceof TypeError || /Failed to fetch/i.test(error.message || '')) {
    return 'API servisine ulaşılamıyor. Lütfen backend servisinin çalıştığını kontrol edin.';
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
      const detail = Array.isArray(error.detail) ? error.detail.map((x) => x.msg).join(', ') : error.detail;
      throw new Error(detail || 'İstek başarısız oldu');
    }
    if (options.raw) return response;
    return response.json();
  } catch (error) {
    throw new Error(friendlyError(error));
  }
}

export const getDashboard = () => request('/dashboard/summary');
export const getLogs = () => request('/logs');
export const getActions = (id) => request(`/findings/${id}/actions`);
export const addAction = (id, payload) => request(`/findings/${id}/actions`, { method: 'POST', body: JSON.stringify(payload) });
export const closeFindingApi = (id, note = '') => request(`/findings/${id}/close`, { method: 'POST', body: JSON.stringify({ note }) });
export const reopenFindingApi = (id, note = '') => request(`/findings/${id}/reopen`, { method: 'POST', body: JSON.stringify({ note }) });
export const bulkUpdate = (payload) => request('/findings/bulk-update', { method: 'POST', body: JSON.stringify(payload) });
export const bulkClose = (ids, note = 'Toplu kapatma') => request('/findings/bulk-close', { method: 'POST', body: JSON.stringify({ ids, note }) });

export function getFindings(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value !== false && value !== null && value !== undefined) params.append(key, value);
  });
  return request(`/findings?${params.toString()}`);
}

export const createFinding = (payload) => request('/findings', { method: 'POST', body: JSON.stringify(payload) });
export const updateFinding = (id, payload) => request(`/findings/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
export const deleteFinding = (id) => request(`/findings/${id}`, { method: 'DELETE' });

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

export function exportUrl(ids = []) {
  const qs = ids.length ? `?ids=${ids.join(',')}` : '';
  return `${API_BASE_URL}/export/excel${qs}`;
}
