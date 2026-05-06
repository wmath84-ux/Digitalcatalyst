
import React from 'react';
import { User } from '../../App';

interface UserManagementProps {
    users: User[];
    onDeleteUser: (userId: number) => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ users, onDeleteUser }) => {
    return (
        <div className="animate-fade-in-up">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-800">Customers</h1>
                    <p className="text-slate-500 mt-1">Manage registered users and accounts.</p>
                </div>
            </div>
            
            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-max text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">User ID</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Learner</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Mobile</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Joined Date</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Last Login</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {users.length > 0 ? (
                                users.map(user => (
                                    <tr key={user.id} className="hover:bg-slate-50/80 transition-all duration-200 hover:shadow-inner group">
                                        <td className="p-3 sm:p-5 font-mono text-xs text-slate-400">{user.id}</td>
                                        <td className="p-3 sm:p-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                                                    {(user.name || user.email).charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <span className="block font-bold text-slate-700">{user.name || 'Learner'}</span>
                                                    <span className="block text-xs text-slate-500">{user.email}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-3 sm:p-5 text-sm text-slate-600 font-medium">{user.mobile ? `+91 ${user.mobile}` : 'Not added'}</td>
                                        <td className="p-3 sm:p-5 text-sm text-slate-600 font-medium">
                                            {new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                        </td>
                                        <td className="p-3 sm:p-5 text-sm text-slate-600 font-medium">
                                            {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Never'}
                                        </td>
                                        <td className="p-3 sm:p-5 text-right">
                                            <button 
                                                onClick={() => onDeleteUser(user.id)} 
                                                className="px-3 py-1 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors border border-red-100"
                                            >
                                                Delete User
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} className="text-center p-12 text-slate-400">
                                        No users found.
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

export default UserManagement;
