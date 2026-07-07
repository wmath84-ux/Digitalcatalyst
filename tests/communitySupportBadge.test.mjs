import test from 'node:test';
import assert from 'node:assert/strict';

import { isSupportTicketNeedsAttention, mergeCommunitySupportTickets } from '../utils/communitySupportBadge.js';

test('counts only unread open support tickets and ignores resolved or inbox-read items', () => {
  const tickets = [
    { id: 'a', status: 'Open', inboxRead: false },
    { id: 'b', status: 'Resolved', inboxRead: false },
    { id: 'c', status: 'Pending', inboxRead: true },
    { id: 'd', status: 'Open', inboxRead: false, adminReply: 'reply' },
  ];

  const attentionTickets = mergeCommunitySupportTickets(tickets, [{ id: 'a', status: 'Open', inboxRead: false }, { id: 'e', status: 'Open', inboxRead: false }]);
  const unreadCount = attentionTickets.filter((ticket) => isSupportTicketNeedsAttention(ticket)).length;

  assert.equal(unreadCount, 3);
  assert.deepEqual(attentionTickets.map((ticket) => ticket.id), ['a', 'b', 'c', 'd', 'e']);
});
