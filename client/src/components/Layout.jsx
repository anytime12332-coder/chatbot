import { useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBots } from '../context/BotContext';
import {
  LayoutDashboard, Bot, Key, Code, MessageSquare, Settings,
  LogOut, Menu, X, ChevronDown, Plus, List, BarChart3,
} from 'lucide-react';

export default function Layout({ children }) {
  const { admin, logout } = useAuth();
  const { bots, activeBot, selectBot } = useBots();
  const navigate = useNavigate();
  const { botId } = useParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [botDropdownOpen, setBotDropdownOpen] = useState(false);

  // Determine current bot from URL or context
  const currentBot = botId ? bots.find(b => b.id === botId) : activeBot;

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function handleSelectBot(bot) {
    selectBot(bot);
    setBotDropdownOpen(false);
    navigate(`/bot/${bot.id}/dashboard`);
    setSidebarOpen(false);
  }

  const globalNav = [
    { to: '/', icon: BarChart3, label: 'Overview', end: true },
    { to: '/chatbots', icon: List, label: 'My Chatbots', end: true },
  ];

  const botNav = currentBot ? [
    { to: `/bot/${currentBot.id}/dashboard`, icon: LayoutDashboard, label: 'Dashboard' },
    { to: `/bot/${currentBot.id}/config`, icon: Bot, label: 'Bot Config' },
    { to: `/bot/${currentBot.id}/api`, icon: Key, label: 'API Settings' },
    { to: `/bot/${currentBot.id}/embed`, icon: Code, label: 'Embed & API' },
    { to: `/bot/${currentBot.id}/conversations`, icon: MessageSquare, label: 'Conversations' },
  ] : [];

  return (
    <div className="min-h-screen flex bg-gray-50">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-gray-200">
          <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">AI Chatbot</h1>
            <p className="text-xs text-gray-500">Admin Panel</p>
          </div>
          <button className="ml-auto lg:hidden text-gray-400 hover:text-gray-600" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {/* Global nav */}
          {globalNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                  isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}

          {/* Bot Switcher */}
          {bots.length > 0 && (
            <div className="pt-4 pb-2">
              <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Active Chatbot</p>
              <div className="relative">
                <button
                  onClick={() => setBotDropdownOpen(!botDropdownOpen)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: currentBot?.primaryColor || '#6366f1' }} />
                  <span className="text-sm font-medium text-gray-900 truncate flex-1">
                    {currentBot?.name || 'Select a bot'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${botDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {botDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                    {bots.map((bot) => (
                      <button
                        key={bot.id}
                        onClick={() => handleSelectBot(bot)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors text-left ${
                          currentBot?.id === bot.id ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                        }`}
                      >
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: bot.primaryColor || '#6366f1' }} />
                        <span className="truncate">{bot.name}</span>
                        <span className="ml-auto text-xs text-gray-400">{bot._count?.conversations || 0}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => { setBotDropdownOpen(false); navigate('/chatbots'); setSidebarOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary-600 hover:bg-primary-50 border-t border-gray-100"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Create New Bot</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bot-specific nav */}
          {currentBot && botNav.length > 0 && (
            <div className="space-y-1">
              {botNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                      isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`
                  }
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          )}

          {/* Settings */}
          <div className="pt-4">
            <NavLink
              to="/settings"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                  isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <Settings className="w-5 h-5 flex-shrink-0" />
              <span>Settings</span>
            </NavLink>
          </div>
        </nav>

        {/* User */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
              <span className="text-sm font-semibold text-primary-700">{admin?.name?.[0] || 'A'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{admin?.name || 'Admin'}</p>
              <p className="text-xs text-gray-500 truncate">{admin?.email}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 lg:px-8 sticky top-0 z-30">
          <button className="lg:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg mr-3" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          {currentBot && (
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: currentBot.primaryColor || '#6366f1' }} />
              <span className="text-sm font-medium text-gray-700">{currentBot.name}</span>
              {currentBot.isActive ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />Active
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">Inactive</span>
              )}
            </div>
          )}
          <div className="flex-1" />
          <span className="text-xs text-gray-400">{bots.length} chatbot{bots.length !== 1 ? 's' : ''}</span>
        </header>
        <main className="flex-1 p-4 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
