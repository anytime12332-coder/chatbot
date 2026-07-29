import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { MessageSquare, Users, Clock, Zap, TrendingUp, Activity, ArrowUpRight } from 'lucide-react';
import api from '../lib/api';

export default function BotDashboard() {
  const { botId } = useParams();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [messageChart, setMessageChart] = useState([]);
  const [convChart, setConvChart] = useState([]);
  const [responseChart, setResponseChart] = useState([]);
  const [recentConvs, setRecentConvs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!botId) return;
    loadDashboard();
  }, [botId]);

  async function loadDashboard() {
    setLoading(true);
    try {
      const [s, mc, cc, rc, recent] = await Promise.all([
        api.get(`/dashboard/stats/${botId}`),
        api.get(`/dashboard/chart/${botId}/messages?days=30`),
        api.get(`/dashboard/chart/${botId}/conversations?days=30`),
        api.get(`/dashboard/chart/${botId}/response-times?days=30`),
        api.get(`/dashboard/recent/${botId}`),
      ]);
      setStats(s);
      setMessageChart(mc);
      setConvChart(cc);
      setResponseChart(rc);
      setRecentConvs(recent);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    );
  }

  const statCards = [
    { label: 'Conversations', value: stats?.totalConversations || 0, icon: Users, bg: 'bg-blue-50', text: 'text-blue-700', change: stats?.weekConversations || 0, changeLabel: 'this week' },
    { label: 'Messages', value: stats?.totalMessages || 0, icon: MessageSquare, bg: 'bg-green-50', text: 'text-green-700', change: stats?.todayMessages || 0, changeLabel: 'today' },
    { label: 'Avg Response', value: `${stats?.avgResponseTime || 0}ms`, icon: Clock, bg: 'bg-amber-50', text: 'text-amber-700', change: null },
    { label: 'Tokens Used', value: (stats?.totalTokens || 0).toLocaleString(), icon: Zap, bg: 'bg-purple-50', text: 'text-purple-700', change: stats?.activeConversations || 0, changeLabel: 'active now' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-500 mt-1">Analytics for this chatbot</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="stat-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
              </div>
              <div className={`${card.bg} p-2.5 rounded-lg`}>
                <card.icon className={`w-5 h-5 ${card.text}`} />
              </div>
            </div>
            {card.change !== null && card.change !== undefined && (
              <div className="mt-3 flex items-center gap-1 text-sm">
                <ArrowUpRight className="w-4 h-4 text-green-500" />
                <span className="text-green-600 font-medium">{card.change}</span>
                <span className="text-gray-400">{card.changeLabel}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Messages (30 days)</h3>
            <Activity className="w-5 h-5 text-gray-400" />
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={messageChart}>
              <defs>
                <linearGradient id="cUser" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cBot" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="userMessages" name="User" stroke="#6366f1" fill="url(#cUser)" strokeWidth={2} />
              <Area type="monotone" dataKey="botMessages" name="Bot" stroke="#10b981" fill="url(#cBot)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Conversations (30 days)</h3>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={convChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="conversations" name="Conversations" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Avg Response Time (ms)</h3>
            <Clock className="w-5 h-5 text-gray-400" />
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={responseChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="avgResponseTime" name="Response Time" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Recent Conversations</h3>
            <button onClick={() => navigate(`/bot/${botId}/conversations`)} className="text-sm text-primary-600 hover:text-primary-700 font-medium">View all</button>
          </div>
          <div className="space-y-3 max-h-[280px] overflow-y-auto">
            {recentConvs.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">No conversations yet</p>
            ) : (
              recentConvs.map((conv) => (
                <div key={conv.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => navigate(`/bot/${botId}/conversations`)}>
                  <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-4 h-4 text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 truncate">{conv.visitorName || 'Visitor'}</p>
                      <span className="text-xs text-gray-400">{new Date(conv.updatedAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{conv.messages?.[0]?.content || 'No messages'}</p>
                    <span className="text-xs text-gray-400">{conv._count?.messages || 0} messages</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
