import axios from 'axios';

export const api = axios.create({
  // Production builds are served by the API itself, so the API is same-origin.
  baseURL: import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api/v1' : 'http://localhost:5000/api/v1'),
  withCredentials: true, // refresh cookie rides along
});

// Access token lives in memory only — never localStorage, so XSS cannot read it.
let accessToken = null;
export const setAccessToken = (token) => { accessToken = token; };
export const getAccessToken = () => accessToken;

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// Silent refresh: one retry per request, and concurrent 401s share a single refresh call.
let refreshing = null;
const isRefreshCall = (url = '') => url.includes('/auth/refresh');

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const { response, config } = err;
    const code = response?.data?.error?.code;

    if (response?.status === 401 && config && !config._retried && !isRefreshCall(config.url) && code !== 'BAD_CREDENTIALS') {
      config._retried = true;
      refreshing ||= api
        .post('/auth/refresh')
        .then((refreshed) => {
          setAccessToken(refreshed.data.data.accessToken);
          return refreshed.data.data.accessToken;
        })
        .catch(() => {
          setAccessToken(null);
          return null;
        })
        .finally(() => { refreshing = null; });

      const token = await refreshing;
      if (token) return api(config);
    }

    const e = response?.data?.error;
    return Promise.reject(e ? Object.assign(new Error(e.message), { code: e.code }) : err);
  },
);

export const getHealth = async () => (await api.get('/health')).data.data;
