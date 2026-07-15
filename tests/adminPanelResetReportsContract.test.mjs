import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const app = fs.readFileSync('App.tsx', 'utf8');
const dashboard = fs.readFileSync('components/admin/AdminDashboard.tsx', 'utf8');
const sidebar = fs.readFileSync('components/admin/Sidebar.tsx', 'utf8');
const adminManagement = fs.readFileSync('components/admin/AdminManagement.tsx', 'utf8');
const reports = fs.readFileSync('components/admin/Reports.tsx', 'utf8');

test('admin reward logic page is removed while EduCoin Economy remains', () => {
  assert.doesNotMatch(dashboard, /rewardSettings/);
  assert.doesNotMatch(dashboard, /EduCoinRewardSettings/);
  assert.doesNotMatch(sidebar, /Reward Logic/);
  assert.match(sidebar, /EduCoin Economy/);
});

test('admin customers are read from real Firebase users collection', () => {
  assert.match(app, /onSnapshot\(collection\(db, 'users'\)/);
  assert.match(app, /normalizeAdminUserSnapshot/);
  assert.match(app, /Admin customers/);
});

test('latest-only destructive reset contracts are explicit and backed by markers', () => {
  assert.match(app, /ADMIN_ORDER_LATEST_ONLY_RESET_DOC/);
  assert.match(app, /latest-order-only-v2/);
  assert.match(app, /const keepOrders = \[latestOrder\]/);
  assert.match(app, /ADMIN_SUPPORT_TICKET_LATEST_RESET_DOC/);
  assert.match(app, /latest-ticket-only-v1/);
  assert.match(app, /batch\.delete\(doc\(db, GLOBAL_TICKETS_COLLECTION/);
});

test('admin account email is always shown and signout button is removed', () => {
  assert.match(adminManagement, /currentAdminUser \? \[currentAdminUser\]/);
  assert.match(sidebar, /resolvedAdminEmail/);
  assert.doesNotMatch(sidebar, /Sign Out/);
  assert.doesNotMatch(sidebar, /onLogout/);
  assert.doesNotMatch(dashboard, /onLogout/);
  assert.match(app, /Firebase admin auto sign-out failed/);
});

test('reports page uses real dashboard data sources', () => {
  assert.match(dashboard, /<Reports products=\{props\.products\} reviews=\{props\.reviews\} orders=\{props\.orders\} users=\{props\.users\} tickets=\{props\.tickets\}/);
  assert.match(reports, /Database-backed reports/);
  assert.match(reports, /orders: Order\[\]/);
  assert.match(reports, /users: User\[\]/);
  assert.match(reports, /tickets: SupportTicket\[\]/);
  assert.doesNotMatch(reports, /mock|demo|sample|placeholder/i);
});
