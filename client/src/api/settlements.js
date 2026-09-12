import { api } from './client.js';

const data = (res) => res.data.data;

export const previewSettlement = (groupId) => api.post(`/groups/${groupId}/settle/preview`).then(data);
export const recordSettlement = (groupId) => api.post(`/groups/${groupId}/settle`).then(data);
export const listSettlements = (groupId) => api.get(`/groups/${groupId}/settlements`).then(data);
export const markPaid = (settlementId, isPaid = true) => api.patch(`/settlements/${settlementId}/pay`, { isPaid }).then(data);
