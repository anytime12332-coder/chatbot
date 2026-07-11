import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, MessageSquare, Users, Zap, Clock, Plus, ArrowRight } from 'lucide-react';
import { useBots } from '../context/BotContext';
import api from '../lib/api';

export default function Overview() {
  const { bots, selectBot } = useBots();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadOverview();
  }, []);

  async function loadOverview() {
    try {
      const data = await api.get('/dashboard/overview');
      setOverview(data);
    } catch (err) {
      console.error('Overview error:', err);
    } finally {
      setLoading(false);
    }
  }

  function goToBot(bot) {
    selectBot(bot);
    navigate(`/bot/${bot.id}/dashboard`);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    );
  }

  const stats = [
    { label: 'Total Chatbots', value: overview?.chatbotCount || 0, icon: Bot, bg: 'bg-indigo-50', text: 'text-indigo-700' },
    { label: 'Total Conversations', value: overview?.totalConversations || 0, icon: Users, bg: 'bg-blue-50', text: 'text-blue-700' },
    { label: 'Total Messages', value: overview?.totalMessages || 0, icon: MessageSquare, bg: 'bg-green-50', text: 'text-green-700' },
    { label: 'Today Messages', value: overview?.todayMessages || 0, icon: Zap, bg: 'bg-amber-50', text: 'text-amber-700' },
    { label: 'Avg Response', value: `${overview?.avgResponseTime || 0}ms`, icon: Clock, bg: 'bg-purple-50', text: 'text-purple-700' },
    { label: 'Total Tokens', value: (overview?.totalTokens || 0).toLocaleString(), icon: Zap, bg: 'bg-rose-50', text: 'text-rose-700' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Overview</h2>
          <p className="text-gray-500 mt-1">Global stats across all your chatbots</p>
        </div>
        <button onClick={() => navigate('/chatbots')} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Chatbot
        </button>
      </div>

      {/* Global stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="stat-card">
            <div className={`${s.bg} p-2 rounded-lg w-fit mb-2`}>
              <s.icon className={`w-4 h-4 ${s.text}`} />
            </div>
            <p className="text-xs text-gray-500 font-medium">{s.label}</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Chatbot cards */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Chatbots</h3>
        {bots.length === 0 ? (
          <div className="card text-center py-12">
            <Bot className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">No chatbots yet. Create your first one!</p>
            <button onClick={() => navigate('/chatbots')} className="btn-primary">Create Chatbot</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(overview?.chatbots || bots).map((bot) => (
              <div
                key={bot.id}
                onClick={() => goToBot(bot)}
                className="card cursor-pointer hover:shadow-md hover:border-primary-200 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: (bot.primaryColor || '#6366f1') + '20' }}>
                      <Bot className="w-5 h-5" style={{ color: bot.primaryColor || '#6366f1' }} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">{bot.name}</h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        bot.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {bot.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-primary-500 transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-400 text-xs">Conversations</p>
                    <p className="font-semibold text-gray-900">{bot.conversations || bot._count?.conversations || 0}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs">Messages</p>
                    <p className="font-semibold text-gray-900">{bot.messages || bot.messageCount || 0}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
