import { api } from './client.js';

const data = (res) => res.data.data;

export const listGroups = () => api.get('/groups').then(data);
export const createGroup = (body) => api.post('/groups', body).then(data);
export const getGroup = (id) => api.get(`/groups/${id}`).then(data);
export const updateGroup = (id, body) => api.patch(`/groups/${id}`, body).then(data);
export const inviteMember = (id, body) => api.post(`/groups/${id}/members`, body).then(data);
export const removeMember = (id, userId) => api.delete(`/groups/${id}/members/${userId}`).then(data);
export const joinGroup = (inviteToken) => api.post(`/join/${inviteToken}`).then(data);
