import { api } from './client.js';

const data = (res) => res.data.data;

export const getRates = () => api.get('/fx/rates').then(data);
