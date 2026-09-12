import { api } from './client.js';

const data = (res) => res.data.data;
const qs = (params) =>
  Object.entries(params)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

export const monthlyReport = (month) => api.get(`/reports/personal/monthly?${qs({ month })}`).then(data);
export const trendsReport = (months = 6) => api.get(`/reports/personal/trends?months=${months}`).then(data);
export const groupReport = (groupId) => api.get(`/reports/groups/${groupId}/summary`).then(data);

export const listNotifications = (params = {}) => api.get(`/notifications?${qs(params)}`).then(data);
export const markNotificationRead = (id) => api.patch(`/notifications/${id}/read`).then(data);
export const markAllNotificationsRead = () => api.patch('/notifications/read-all').then(data);

/**
 * Exports stream a file. Fetched as a blob and saved through a temporary link so
 * the request still carries the Authorization header.
 */
export async function downloadExport(params) {
  const res = await api.get(`/reports/export?${qs(params)}`, { responseType: 'blob' });

  const disposition = res.headers['content-disposition'] || '';
  const filename = disposition.match(/filename="?([^"]+)"?/)?.[1] || `smartsplit-export.${params.format}`;

  const url = URL.createObjectURL(res.data);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
