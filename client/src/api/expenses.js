import { api } from './client.js';

const data = (res) => res.data.data;
const qs = (params) =>
  Object.entries(params)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

export const listExpenses = (groupId, params = {}) => api.get(`/groups/${groupId}/expenses?${qs(params)}`).then(data);
export const createExpense = (groupId, body) => api.post(`/groups/${groupId}/expenses`, body).then(data);
export const getExpense = (expenseId) => api.get(`/expenses/${expenseId}`).then(data);
export const updateExpense = (expenseId, body) => api.patch(`/expenses/${expenseId}`, body).then(data);
export const deleteExpense = (expenseId) => api.delete(`/expenses/${expenseId}`).then(data);
export const getBalances = (groupId) => api.get(`/groups/${groupId}/balances`).then(data);
