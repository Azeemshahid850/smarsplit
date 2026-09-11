import { api } from './client.js';

const data = (res) => res.data.data;

export const registerUser = (body) => api.post('/auth/register', body).then(data);
export const loginUser = (body) => api.post('/auth/login', body).then(data);
export const refreshSession = () => api.post('/auth/refresh').then(data);
export const logoutUser = () => api.post('/auth/logout').then(data);
export const fetchMe = () => api.get('/auth/me').then(data);
export const loginWithGoogle = (idToken) => api.post('/auth/google', { idToken }).then(data);
export const forgotPassword = (email) => api.post('/auth/forgot-password', { email }).then(data);
export const resetPassword = (token, password) => api.post(`/auth/reset-password/${token}`, { password }).then(data);
