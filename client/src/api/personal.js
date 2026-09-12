import { api } from './client.js';

const data = (res) => res.data.data;
const qs = (params) =>
  Object.entries(params)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

export const listTransactions = (params = {}) => api.get(`/transactions?${qs(params)}`).then(data);
export const createTransaction = (body) => api.post('/transactions', body).then(data);
export const updateTransaction = (id, body) => api.patch(`/transactions/${id}`, body).then(data);
export const deleteTransaction = (id) => api.delete(`/transactions/${id}`).then(data);
export const getSummary = (month) => api.get(`/personal/summary?${qs({ month })}`).then(data);
export const listBudgets = () => api.get('/budgets').then(data);
export const setBudget = (body) => api.put('/budgets', body).then(data);
export const deleteBudget = (id) => api.delete(`/budgets/${id}`).then(data);
