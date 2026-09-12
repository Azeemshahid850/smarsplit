import { api } from './client.js';

const data = (res) => res.data.data;

export const listCategories = () => api.get('/categories').then(data);
export const createCategory = (name) => api.post('/categories', { name }).then(data);
export const categoryUsage = (id) => api.get(`/categories/${id}/usage`).then(data);
export const deleteCategory = (id) => api.delete(`/categories/${id}`).then(data);
