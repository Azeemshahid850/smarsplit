import { api } from './client.js';

const data = (res) => res.data.data;

export const getAdminOverview = () => api.get('/admin/overview').then(data);
