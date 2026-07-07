import React from 'react';
import { AdminUser } from '../../App';

interface AdminManagementProps {
    adminUsers: AdminUser[];
    currentAdminUser: AdminUser | null;
    onUpdateAdminUsers: (updatedUsers: AdminUser[]) => void;
}

const AdminManagement: React.FC<AdminManagementProps> = ({ adminUsers, currentAdminUser }) => {
    const visibleAdmins = adminUsers.filter((admin) => admin.email);

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Admin Access</h1>

            <div className="bg-white/80 backdrop-blur-xl p-6 rounded-lg shadow-[0_8px_30px_rgb(0,0,0,0.04)] border mb-8">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Firebase Admin Role Required</h2>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-7 text-amber-900">
                    Admin accounts must be created in Firebase Authentication by a trusted operator.
                    Grant dashboard access by setting the matching Firestore user document role to
                    <code className="mx-1 rounded bg-white px-1 py-0.5">admin</code>
                    or
                    <code className="mx-1 rounded bg-white px-1 py-0.5">super_admin</code>.
                    Passwords are never created, stored, or managed in this client dashboard.
                </div>

                {currentAdminUser && (
                    <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
                        Signed in as {currentAdminUser.email} with {currentAdminUser.firebaseRole || currentAdminUser.role} access.
                    </div>
                )}
            </div>

            <div className="bg-white/80 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-lg overflow-hidden border border-slate-200/80">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-max text-left">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="p-4 font-semibold">Email</th>
                                <th className="p-4 font-semibold">Dashboard Role</th>
                                <th className="p-4 font-semibold">Firebase Role</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleAdmins.length > 0 ? (
                                visibleAdmins.map((admin) => (
                                    <tr key={admin.id} className="border-b hover:bg-slate-100/80">
                                        <td className="p-4 font-medium text-gray-800">{admin.email}</td>
                                        <td className="p-4 text-gray-600">{admin.role}</td>
                                        <td className="p-4 text-gray-600">{admin.firebaseRole || 'role checked at login'}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={3} className="p-8 text-center text-slate-600">
                                        No client-managed admin accounts are stored. Use Firebase Auth + Firestore roles.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AdminManagement;
