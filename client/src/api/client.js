import axios from 'axios';

// Single axios instance. Pages must call src/api functions, never axios directly.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1',
  withCredentials: true,
});

// Unwraps the { success, data } envelope; throws { code, message } on failure.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const e = err.response?.data?.error;
    return Promise.reject(e ? Object.assign(new Error(e.message), { code: e.code }) : err);
  },
);

export const getHealth = async () => (await api.get('/health')).data.data;
