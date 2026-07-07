export const isSupportTicketNeedsAttention = (ticket) => {
  if (!ticket || typeof ticket !== 'object') return false;
  const status = ticket.status;
  const isOpenOrPending = status === 'Open' || status === 'Pending';
  const isUnread = !ticket.inboxRead;
  return isUnread && isOpenOrPending;
};

export const mergeCommunitySupportTickets = (tickets = [], extraTickets = []) => {
  const merged = [...tickets, ...extraTickets].filter((ticket, index, all) => {
    const exists = all.findIndex((candidate) => candidate && candidate.id === ticket.id);
    return exists === index;
  });

  return merged.sort((left, right) => {
    const leftKey = String(left.repliedAt || left.date || '');
    const rightKey = String(right.repliedAt || right.date || '');
    return rightKey.localeCompare(leftKey);
  });
};
