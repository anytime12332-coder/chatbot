import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Plus, Trash2, Settings, BarChart3, Copy, Check, Power } from 'lucide-react';
import { useBots } from '../context/BotContext';
import api from '../lib/api';

export default function ChatbotList() {
  const { bots, loadBots, selectBot } = useBots();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newBot, setNewBot] = useState({ name: '', businessName: '' });
  const [deleting, setDeleting] = useState(null);
  const [copied, setCopied] = useState('');
  const [message, setMessage] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    if (!newBot.name.trim()) return;
    setCreating(true);
    try {
      const created = await api.post('/chatbots', {
        name: newBot.name,
        businessName: newBot.businessName,
      });
      await loadBots();
      selectBot(created);
      setShowCreate(false);
      setNewBot({ name: '', businessName: '' });
      navigate(`/bot/${created.id}/config`);
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(botId, botName) {
    if (!window.confirm(`Delete "${botName}"? This will remove ALL conversations and data. This cannot be undone.`)) return;
    setDeleting(botId);
    try {
      await api.delete(`/chatbots/${botId}`);
      await loadBots();
      setMessage(`"${botName}" deleted successfully`);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setDeleting(null);
    }
  }

  async function toggleActive(bot) {
    try {
      await api.put(`/chatbots/${bot.id}`, { isActive: !bot.isActive });
      await loadBots();
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
  }

  function copyId(id) {
    navigator.clipboard.writeText(id);
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Chatbots</h2>
          <p className="text-gray-500 mt-1">Create and manage your AI chatbots</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Chatbot
        </button>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {message}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Chatbot</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Chatbot Name *</label>
                <input
                  type="text"
                  value={newBot.name}
                  onChange={e => setNewBot(p => ({ ...p, name: e.target.value }))}
                  className="input-field"
                  placeholder="e.g. Customer Support Bot"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Name</label>
                <input
                  type="text"
                  value={newBot.businessName}
                  onChange={e => setNewBot(p => ({ ...p, businessName: e.target.value }))}
                  className="input-field"
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={creating} className="btn-primary">
                  {creating ? 'Creating...' : 'Create Chatbot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bot list */}
      {bots.length === 0 ? (
        <div className="card text-center py-16">
          <Bot className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No chatbots yet</h3>
          <p className="text-gray-500 mb-6">Create your first AI chatbot to get started</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create Your First Chatbot
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {bots.map((bot) => (
            <div key={bot.id} className="card hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Bot info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: (bot.primaryColor || '#6366f1') + '20' }}>
                    <Bot className="w-6 h-6" style={{ color: bot.primaryColor || '#6366f1' }} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900">{bot.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${bot.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {bot.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span className="text-xs text-gray-400">{bot._count?.conversations || 0} conversations</span>
                      <span className="text-xs text-gray-400">{bot.messageCount || 0} messages</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <code className="text-xs text-gray-400 font-mono">{bot.id.slice(0, 16)}...</code>
                      <button onClick={() => copyId(bot.id)} className="p-0.5 hover:bg-gray-100 rounded">
                        {copied === bot.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-gray-400" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => toggleActive(bot)}
                    className={`p-2 rounded-lg transition-colors ${bot.isActive ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                    title={bot.isActive ? 'Deactivate' : 'Activate'}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { selectBot(bot); navigate(`/bot/${bot.id}/dashboard`); }}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Dashboard"
                  >
                    <BarChart3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { selectBot(bot); navigate(`/bot/${bot.id}/config`); }}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Settings"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(bot.id, bot.name)}
                    disabled={deleting === bot.id}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
