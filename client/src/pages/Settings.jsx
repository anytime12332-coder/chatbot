import { useState } from 'react';
import { Settings as SettingsIcon, Lock, Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';

export default function Settings() {
  const { admin } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function handleChangePassword(e) {
    e.preventDefault();
    setMessage('');
    if (newPassword !== confirmPassword) { setMessage('Error: Passwords do not match'); return; }
    if (newPassword.length < 6) { setMessage('Error: Password must be at least 6 characters'); return; }
    setSaving(true);
    try {
      await api.put('/auth/update-password', { currentPassword, newPassword });
      setMessage('Password updated successfully!');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="text-gray-500 mt-1">Manage your account settings</p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {message}
        </div>
      )}

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <SettingsIcon className="w-5 h-5 text-primary-600" />
          <h3 className="text-lg font-semibold text-gray-900">Account Info</h3>
        </div>
        <div className="space-y-3">
          <div><label className="block text-sm font-medium text-gray-500">Name</label><p className="text-gray-900">{admin?.name || 'Admin'}</p></div>
          <div><label className="block text-sm font-medium text-gray-500">Email</label><p className="text-gray-900">{admin?.email}</p></div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-5 h-5 text-primary-600" />
          <h3 className="text-lg font-semibold text-gray-900">Change Password</h3>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Current Password</label>
            <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="input-field" required minLength={6} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm New Password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="input-field" required />
          </div>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" />{saving ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
