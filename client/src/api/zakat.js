import { api } from './client.js';

const data = (res) => res.data.data;

export const getZakatOverview = () => api.get('/zakat').then(data);
export const calculateZakat = (body) => api.post('/zakat/calculate', body).then(data);
export const saveMetalRates = (body) => api.put('/zakat/rates', body).then(data);
