import { api } from './client.js';

const data = (res) => res.data.data;

export const scanReceipt = (file) => {
  const form = new FormData();
  form.append('image', file);
  return api.post('/receipts/scan', form).then(data);
};

export const getReceipt = (id) => api.get(`/receipts/${id}`).then(data);
export const listReceipts = () => api.get('/receipts').then(data);
export const updateReceiptItem = (id, index, body) => api.patch(`/receipts/${id}/items/${index}`, body).then(data);
export const addReceiptItem = (id, body) => api.post(`/receipts/${id}/items`, body).then(data);
export const removeReceiptItem = (id, index) => api.delete(`/receipts/${id}/items/${index}`).then(data);
export const commitReceipt = (id, body) => api.post(`/receipts/${id}/commit`, body).then(data);
