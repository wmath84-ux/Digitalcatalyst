import React, { useState } from 'react';
import { User } from '../../App';
import UserAvatar from '../common/UserAvatar';
import { cleanupLegacyIdentityRecords, LegacyIdentityCleanupResult } from '../../utils/legacyIdentityCleanup';

interface UserManagementProps {
  users: User[];
  onDeleteUser: (userId: string) => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ users, onDeleteUser }) => {
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupError, setCleanupError] = useState('');
  const [cleanupResult, setCleanupResult] = useState<LegacyIdentityCleanupResult | null>(null);

  const runCleanup = async () => {
    const approved = window.confirm('This downloads a full JSON backup first, merges same-email numeric legacy users into their stable UID account, then removes blank legacy IDs, orphan profiles and orphan follow links. Continue?');
    if (!approved) return;
    setCleanupBusy(true);
    setCleanupError('');
    setCleanupResult(null);
    try {
      const result = await cleanupLegacyIdentityRecords();
      setCleanupResult(result);
    } catch (error) {
      setCleanupError(error instanceof Error ? error.message : 'Legacy identity cleanup failed.');
    } finally {
      setCleanupBusy(false);
    }
  };

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800">Customers</h1>
          <p className="mt-1 text-slate-600">Stable Firebase UID accounts and customer access.</p>
        </div>
        <button type="button" disabled={cleanupBusy} onClick={() => void runCleanup()} className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-55">
          {cleanupBusy ? 'Cleaning legacy IDs…' : 'Clean legacy IDs'}
        </button>
      </div>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <h2 className="font-black text-amber-950">Safe identity cleanup</h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-amber-900/80">A backup downloads before any write. Stable UID users are kept; same-email numeric records are merged; blank numeric records and orphan Community profiles/follows are removed. Ambiguous records stay for manual review.</p>
        {cleanupError ? <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-bold text-rose-700">{cleanupError}</p> : null}
        {cleanupResult ? (
          <div className="mt-3 rounded-xl bg-white p-3 text-sm font-semibold text-slate-700">
            <p className="font-black text-emerald-700">Cleanup complete · backup: {cleanupResult.backupFileName}</p>
            <p className="mt-1">Merged {cleanupResult.mergedLegacyUsers}, deleted {cleanupResult.deletedBlankLegacyUsers} blank users, {cleanupResult.deletedOrphanProfiles} orphan profiles and {cleanupResult.deletedOrphanFollows} orphan follows.</p>
            {cleanupResult.manualReviewIds.length ? <p className="mt-1 text-amber-700">Manual review kept: {cleanupResult.manualReviewIds.join(', ')}</p> : null}
          </div>
        ) : null}
      </section>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-left">
            <thead><tr className="border-b border-slate-200 bg-slate-100/80"><th className="p-3 text-xs font-bold uppercase tracking-wider text-slate-600 sm:p-5">User ID</th><th className="p-3 text-xs font-bold uppercase tracking-wider text-slate-600 sm:p-5">Learner</th><th className="p-3 text-xs font-bold uppercase tracking-wider text-slate-600 sm:p-5">Mobile</th><th className="p-3 text-xs font-bold uppercase tracking-wider text-slate-600 sm:p-5">Provider</th><th className="p-3 text-xs font-bold uppercase tracking-wider text-slate-600 sm:p-5">Joined</th><th className="p-3 text-right text-xs font-bold uppercase tracking-wider text-slate-600 sm:p-5">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {users.length ? users.map((user) => (
                <tr key={user.id} className="transition hover:bg-slate-50">
                  <td className="p-3 font-mono text-xs text-slate-600 sm:p-5">{user.id}</td>
                  <td className="p-3 sm:p-5"><div className="flex items-center gap-3"><UserAvatar name={user.name} email={user.email} photoURL={user.profilePhotoSet ? user.photoURL : ''} size={34} /><div><span className="block font-bold text-slate-700">{user.name || 'Learner'}</span><span className="block text-xs text-slate-500">{user.email}</span></div></div></td>
                  <td className="p-3 text-sm font-medium text-slate-600 sm:p-5">{user.mobile ? `+91 ${user.mobile}` : 'Not added'}</td>
                  <td className="p-3 text-sm font-medium text-slate-600 sm:p-5">{user.authProvider === 'google' ? 'Google' : 'Email/Password'}</td>
                  <td className="p-3 text-sm font-medium text-slate-600 sm:p-5">{user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN') : 'Unknown'}</td>
                  <td className="p-3 text-right sm:p-5"><button type="button" onClick={() => onDeleteUser(user.id)} className="rounded-lg border border-red-100 bg-red-50 px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-100">Delete User</button></td>
                </tr>
              )) : <tr><td colSpan={6} className="p-12 text-center text-slate-500">No users found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
