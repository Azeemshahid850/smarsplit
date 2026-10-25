import { api } from './client.js';

const data = (res) => res.data.data;

export const listPrices = () => api.get('/prices').then(data);
export const upsertPrice = (body) => api.post('/prices', body).then(data);
export const deletePrice = (id) => api.delete(`/prices/${id}`).then(data);

export const importPrices = (file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/prices/import', form).then(data);
};

/** Streams the Excel file with the auth header, then saves it through a temporary link. */
export async function downloadPriceBook() {
  const res = await api.get('/prices/export', { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const link = Object.assign(document.createElement('a'), { href: url, download: 'smartsplit-price-book.xlsx' });
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const seedDefaultPrices = () => api.post('/prices/seed').then(data);
