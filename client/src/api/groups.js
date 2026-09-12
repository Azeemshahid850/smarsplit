import { api } from './client.js';

const data = (res) => res.data.data;

export const listGroups = () => api.get('/groups').then(data);
export const createGroup = (body) => api.post('/groups', body).then(data);
export const getGroup = (id) => api.get(`/groups/${id}`).then(data);
export const updateGroup = (id, body) => api.patch(`/groups/${id}`, body).then(data);
export const inviteMember = (id, body) => api.post(`/groups/${id}/members`, body).then(data);
export const removeMember = (id, userId) => api.delete(`/groups/${id}/members/${userId}`).then(data);
export const joinGroup = (inviteToken) => api.post(`/join/${inviteToken}`).then(data);

export const searchUsers = (q) => api.get(`/users/search?q=${encodeURIComponent(q)}`).then(data);
export const resendInvite = (groupId, memberId) => api.post(`/groups/${groupId}/members/${memberId}/resend`).then(data);
export const approveMember = (groupId, memberId) => api.patch(`/groups/${groupId}/members/${memberId}/approve`).then(data);
export const rotateJoinCode = (groupId) => api.post(`/groups/${groupId}/join-code/rotate`).then(data);
export const previewJoinCode = (code) => api.get(`/join-request/${code}`).then(data);
export const requestToJoin = (code) => api.post(`/join-request/${code}`).then(data);
