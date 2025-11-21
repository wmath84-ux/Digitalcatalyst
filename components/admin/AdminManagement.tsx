
import React, { useState } from 'react';
import { AdminUser } from '../../App';

interface AdminManagementProps {
    adminUsers: AdminUser[];
    currentAdminUser: AdminUser;
    onUpdateAdminUsers: (users: AdminUser[]) => void;
}

const RoleBadge: React.FC<{ role: AdminUser['role'] }> = ({ role }) => {
    const isDeveloper = role === 'Developer';
    const classes = isDeveloper
        ? "bg-purple-100 text-purple-800"
        : "bg-blue-100 text-blue-800";
    return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${classes}`}>{role}</span>;
};


const AdminManagement: React.FC<AdminManagementProps> = ({ adminUsers, currentAdminUser, onUpdateAdminUsers }) => {
    const [newAdminEmail, setNewAdminEmail] = useState('');
    const [newAdminPassword, setNewAdminPassword] = useState('');
    const [newAdminRole, setNewAdminRole] = useState<AdminUser['role']>('Admin');
    const [error, setError] = useState('');

    const handleAddAdmin = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!newAdminEmail || !newAdminPassword) {
            setError('Email and password are required.');
            return;
        }

        if (adminUsers.some(u => u.email === newAdminEmail)) {
            setError('An admin with this email already exists.');
            return;
        }

        const newAdmin: AdminUser = {
            id: Date.now(),
            email: newAdminEmail,
            password: newAdminPassword,
            role: newAdminRole,
        };

        onUpdateAdminUsers([...adminUsers, newAdmin]);
        setNewAdminEmail('');
        setNewAdminPassword('');
        setNewAdminRole('Admin');
    };

    const handleRemoveAdmin = (id: number) => {
        if (id === currentAdminUser.id) {
            alert("You cannot remove your own account.");
            return;
        }
        if (window.confirm('Are you sure you want to remove this admin? This action is permanent.')) {
            onUpdateAdminUsers(adminUsers.filter(u => u.id !== id));
        }
    };

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Admin User Management</h1>

            {/* Add New Admin Form */}
            <div className="bg-white p-6 rounded-lg shadow-md border mb-8">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Add New Admin</h2>
                <form onSubmit={handleAddAdmin} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Email Address</label>
                        <input type="email" value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} placeholder="new.admin@example.com" required className="mt-1 w-full p-2 border rounded-md" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Password</label>
                        <input type="password" value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} placeholder="••••••••" required className="mt-1 w-full p-2 border rounded-md" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Role</label>
                        <select value={newAdminRole} onChange={e => setNewAdminRole(e.target.value as AdminUser['role'])} className="mt-1 w-full p-2 border rounded-md bg-white">
                            <option value="Admin">Admin</option>
                            <option value="Developer">Developer</option>
                        </select>
                    </div>
                    <div className="md:col-span-4 flex justify-between items-center mt-2">
                         {error && <p className="text-red-500 text-sm">{error}</p>}
                         <button type="submit" className="bg-blue-600 text-white font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors ml-auto">
                            + Add Admin
                        </button>
                    </div>
                </form>
            </div>

            {/* List of Existing Admins */}
            <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-max text-left">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="p-4 font-semibold">Email</th>
                                <th className="p-4 font-semibold">Role</th>
                                <th className="p-4 font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {adminUsers.map(user => (
                                <tr key={user.id} className="border-b hover:bg-gray-50">
                                    <td className="p-4 font-medium text-gray-800">{user.email}</td>
                                    <td className="p-4"><RoleBadge role={user.role} /></td>
                                    <td className="p-4">
                                        <button 
                                            onClick={() => handleRemoveAdmin(user.id)} 
                                            disabled={user.id === currentAdminUser.id}
                                            className="text-red-600 hover:underline disabled:text-gray-400 disabled:cursor-not-allowed disabled:no-underline"
                                            aria-label={user.id === currentAdminUser.id ? "Cannot remove your own account" : `Remove ${user.email}`}
                                        >
                                            Remove
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AdminManagement;
