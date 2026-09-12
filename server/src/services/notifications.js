import { Notification } from '../models/Notification.js';

/**
 * Fans one event out to several recipients, skipping the person who caused it.
 * Never throws into the request path — a missing notification must not fail a
 * money operation.
 */
export async function notify({ recipients = [], exclude = null, type, message, groupId = null, meta = {} }) {
  const targets = [...new Set(recipients.map(String))].filter((id) => id !== String(exclude));
  if (!targets.length) return [];

  try {
    return await Notification.insertMany(
      targets.map((userId) => ({ userId, type, message, groupId, meta })),
    );
  } catch (err) {
    console.error('notify failed:', err.message);
    return [];
  }
}

/** Every active member of a group, as plain id strings. */
export const activeMemberIds = (group) =>
  group.members.filter((member) => member.status === 'active' && member.user).map((member) => String(member.user._id ?? member.user));
