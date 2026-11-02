import { api } from './client.js';

const data = (res) => res.data.data;

export const getAdminOverview = () => api.get('/admin/overview').then(data);
export const getPriceSync = () => api.get('/admin/price-sync').then(data);
export const runPriceSync = () => api.post('/admin/price-sync').then(data);
