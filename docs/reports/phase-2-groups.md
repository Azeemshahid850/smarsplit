# Phase 2 — Groups & membership

**Date:** 2026-09-12 · **Status:** ✅ done, verified · **Kit prompt:** Prompt 2

## Scope
Groups, invitations, join links, and the authorization layer every later phase leans on.
Balances and totals are stubbed at 0 — they are computed from expenses in phase 3.

## Backend

### Model — `Group`
title, description, type (`trip|home|event|other`), baseCurrency, tags[], startDate,
createdBy, status (`ACTIVE|SETTLED`), settings `{ simplifyDebts:true, anyoneCanEdit:false }`,
timestamps, and `members[]` subdocs:

`{ user | null, email, name, role admin|member, status active|pending, inviteToken, joinedAt }`

Indexes: `{ 'members.user': 1, status: 1 }` for the list query, `{ 'members.inviteToken': 1 }` for joins.
`group.memberFor(userId)` returns the **active** membership — the one authorization primitive.

### Routes
| Method | Path | Guard |
|---|---|---|
| POST | `/groups` | auth |
| GET | `/groups` | auth — only groups where I am active |
| GET | `/groups/:id` | auth + member |
| PATCH | `/groups/:id` | auth + member + **admin** |
| POST | `/groups/:id/members` | auth + member + **admin** |
| DELETE | `/groups/:id/members/:userId` | auth + member + **admin** |
| POST | `/join/:inviteToken` | auth |

### Authorization design
`middleware/membership.js` → `requireMember` loads the group by the **URL id**, then looks up
the caller's own membership from `req.user._id`. No client-sent member or user id is ever trusted.
- non-member → `403 NOT_A_MEMBER`
- unknown/again-not-yours id → `404 GROUP_NOT_FOUND` (ids cannot be probed)
- member doing an admin action → `403 NOT_ADMIN`

`canEditExpense(group, membership, expense)` also lives here, ready for phase 3.

### Invite semantics
- Invited email **has an account** → added `active` immediately, no link.
- Invited email **has no account** → `pending` + 24-byte `inviteToken`, response carries
  `joinLink = CLIENT_URL/join/<token>` for the inviter to share.
- `POST /join/:token` claims the pending slot, sets `user`, flips to `active`, and **nulls the
  token — single use**. Replay → `404 BAD_INVITE`.
- Duplicate email on a group → `409 ALREADY_INVITED`. Removing the only admin → `400 LAST_ADMIN`.
- `inviteToken` never appears in any response body; only the assembled `joinLink` does.

## Frontend
| File | Role |
|---|---|
| `pages/Groups.jsx` | table: name, stacked member avatars (pending ones greyed), total spent, my balance (green/red/"settled up"), status — with loading, empty and error states |
| `pages/CreateGroup.jsx` | name, type chips, currency, start date, description, email chips (Enter or Add, removable), both setting toggles |
| `pages/GroupDetail.jsx` | header + tabs **Expenses / Balances / Members**; Members is live, the other two are phase-3/4 placeholders |
| `components/MembersTab.jsx` | member list with admin badge and pending badge, invite form with role select, join-link copy button, remove with confirm |
| `pages/Join.jsx` | claims `/join/:token`; if signed out it redirects to login and returns to the invite afterwards |
| `components/AppLayout.jsx` | shared top nav (Dashboard, Groups, avatar, sign out) wrapping every protected page |
| `components/States.jsx`, `hooks/useAsync.js` | the loading/empty/error triple CLAUDE.md requires, in one place |
| `utils/format.js` | `formatMoney` → `Rs 4,200`, `formatSigned`, `formatDate`, `initials` |

## Bug found and fixed during verification
`router.use(requireAuth)` inside the groups router turned **every unmatched path** into
`401` instead of `404` — the router is mounted at `/api/v1`, so its middleware ran before
the 404 handler. Caught by the phase-0 health test. Fixed by attaching `requireAuth` per
route, with a comment in the file so it does not come back.

## Verification run
```
server: npm test        → 36 passed (3 files)
client: npm run build   → built, 0 errors
```
New tests (17): creation with creator as active admin, existing-vs-stranger invites, owner
deduped, no `inviteToken` leak, short title 400, unauthenticated 401, list scoping, pending
invite not listed, **403 on read/update/invite/remove for a non-member**, 404 unknown id,
403 admin-only actions for a plain member, plain member can read, join link shape + join +
single-use replay 404, duplicate invite 409, garbage token 404, remove member, last-admin 400,
patch merges settings.

## Not done (by design)
`totalSpent` and `myBalance` return 0 until phase 3 computes them from expenses.
No email is sent for invites yet — the link is returned for the inviter to share.

## Next
**Phase 3 — Group expenses**: multi-payer, EQUAL/EXACT/PERCENTAGE/LINE_ITEM splits,
server-side invariants, balances aggregation, Add Expense page with live validation.

## Resume this session
```bash
cd /home/pisces/Projects/smartsplit && claude --resume 216976ad-54e0-41a4-802b-9ac1a4b9747c
```
