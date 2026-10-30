import { api } from './client.js';

const data = (res) => res.data.data;

export const listGoals = () => api.get('/goals').then(data);
export const createGoal = (body) => api.post('/goals', body).then(data);
export const updateGoal = (id, body) => api.patch(`/goals/${id}`, body).then(data);
export const deleteGoal = (id) => api.delete(`/goals/${id}`).then(data);
export const addContribution = (id, body) => api.post(`/goals/${id}/contributions`, body).then(data);
export const removeContribution = (id, contributionId) => api.delete(`/goals/${id}/contributions/${contributionId}`).then(data);
