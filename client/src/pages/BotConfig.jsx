import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Bot, Save, Building2, MessageSquare, Palette, Plus, Trash2,
  Image, Layout, Star, Sparkles, Moon, Briefcase, Layers
} from 'lucide-react';
import api from '../lib/api';
import { useBots } from '../context/BotContext';

// ─── Template Presets ────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    id: 'modern_gradient',
    name: 'Modern Gradient',
    Icon: Sparkles,
    preview: { from: '#6366f1', to: '#a855f7', bubble: '#f3e8ff', text: '#1e1b4b' },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    Icon: Layers,
    preview: { from: '#18181b', to: '#3f3f46', bubble: '#f4f4f5', text: '#18181b' },
  },
  {
    id: 'corporate',
    name: 'Corporate',
    Icon: Briefcase,
    preview: { from: '#1e293b', to: '#0284c7', bubble: '#f8fafc', text: '#0f172a' },
  },
  {
    id: 'playful',
    name: 'Playful',
    Icon: Star,
    preview: { from: '#f43f5e', to: '#fb923c', bubble: '#ffe4e6', text: '#881337' },
  },
  {
    id: 'dark_mode',
    name: 'Dark Mode',
    Icon: Moon,
    preview: { from: '#0f172a', to: '#1e293b', bubble: '#334155', text: '#f8fafc' },
  },
];

// ─── Live Widget Preview ──────────────────────────────────────────────────────
function WidgetPreview({ config, theme }) {
  const tpl = TEMPLATES.find(t => t.id === (theme.templateId || 'modern_gradient')) || TEMPLATES[0];
  const primary = theme.primaryColor || config.primaryColor || tpl.preview.from;
  const headerBg = theme.templateId === 'modern_gradient'
    ? `linear-gradient(135deg, ${tpl.preview.from} 0%, ${tpl.preview.to} 100%)`
    : (theme.headerBg || tpl.preview.from);
  const userBg = theme.userBubbleColor || primary;
  const botBg = theme.botBubbleColor || tpl.preview.bubble;
  const botText = tpl.preview.text;
  const isDark = theme.templateId === 'dark_mode';

  const starterQs = (theme.starterQuestions || []).slice(0, 3);

  return (
    <div
      style={{
        width: 280,
        borderRadius: theme.templateId === 'corporate' ? 0 : theme.templateId === 'playful' ? 24 : 16,
        overflow: 'hidden',
        boxShadow: isDark
          ? '0 12px 40px rgba(0,0,0,.5)'
          : '0 10px 30px rgba(99,102,241,.12)',
        fontFamily: theme.templateId === 'corporate' ? 'Georgia, serif' : 'system-ui, sans-serif',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: headerBg,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {theme.logoUrl && (
          <img
            src={theme.logoUrl}
            alt="Logo"
            style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
          />
        )}
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>
          {config.name || 'Chat'}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            color: 'rgba(255,255,255,.7)',
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ×
        </span>
      </div>

      {/* Messages area */}
      <div
        style={{
          background: isDark ? '#1e293b' : '#fff',
          padding: '12px 12px 8px',
          minHeight: 130,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {/* Bot welcome bubble */}
        <div
          style={{
            background: botBg,
            color: botText,
            padding: '8px 12px',
            borderRadius: 12,
            borderBottomLeftRadius: 4,
            fontSize: 12,
            maxWidth: '80%',
            alignSelf: 'flex-start',
          }}
        >
          {config.welcomeMessage || 'Hello! How can I help you today?'}
        </div>

        {/* Starter chips */}
        {starterQs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 4 }}>
            {starterQs.map((q, i) => (
              <button
                key={i}
                style={{
                  background: isDark ? '#334155' : '#f1f5f9',
                  color: primary,
                  border: `1px solid ${isDark ? '#475569' : '#e2e8f0'}`,
                  padding: '4px 10px',
                  borderRadius: 14,
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: 500,
                  textAlign: 'left',
                  width: 'fit-content',
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* User bubble */}
        <div
          style={{
            background: userBg,
            color: '#fff',
            padding: '8px 12px',
            borderRadius: 12,
            borderBottomRightRadius: 4,
            fontSize: 12,
            maxWidth: '70%',
            alignSelf: 'flex-end',
          }}
        >
          Hi, I need more info…
        </div>
      </div>

      {/* Input area */}
      <div
        style={{
          background: isDark ? '#0f172a' : '#fff',
          borderTop: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
          padding: '8px 10px',
          display: 'flex',
          gap: 6,
          alignItems: 'center',
        }}
      >
        <div
          style={{
            flex: 1,
            background: isDark ? '#1e293b' : '#f8fafc',
            border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
            borderRadius: 8,
            height: 28,
            fontSize: 11,
            color: isDark ? '#94a3b8' : '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 8,
          }}
        >
          Type a message…
        </div>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg viewBox="0 0 24 24" width={14} height={14} fill="#fff">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function BotConfig() {
  const { botId } = useParams();
  const { loadBots } = useBots();

  const [config, setConfig] = useState({
    name: '', businessName: '', businessInfo: '', systemPrompt: '',
    welcomeMessage: '', primaryColor: '#6366f1', position: 'bottom-right',
    isActive: true, ragEnabled: false,
  });

  const [theme, setTheme] = useState({
    templateId: 'modern_gradient',
    logoUrl: '',
    launcherIconUrl: '',
    primaryColor: '',
    headerBg: '',
    userBubbleColor: '',
    botBubbleColor: '',
    starterQuestions: [],
  });

  const [newChip, setNewChip] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (botId) loadConfig();
  }, [botId]);

  async function loadConfig() {
    setLoading(true);
    try {
      const data = await api.get(`/chatbots/${botId}`);
      setConfig({
        name: data.name || '',
        businessName: data.businessName || '',
        businessInfo: data.businessInfo || '',
        systemPrompt: data.systemPrompt || '',
        welcomeMessage: data.welcomeMessage || '',
        primaryColor: data.primaryColor || '#6366f1',
        position: data.position || 'bottom-right',
        isActive: data.isActive ?? true,
        ragEnabled: data.ragEnabled ?? false,
      });

      let parsedTheme = {};
      try {
        parsedTheme = JSON.parse(data.widgetTheme || '{}');
      } catch (_) {}

      setTheme({
        templateId: parsedTheme.templateId || 'modern_gradient',
        logoUrl: parsedTheme.logoUrl || '',
        launcherIconUrl: parsedTheme.launcherIconUrl || '',
        primaryColor: parsedTheme.primaryColor || '',
        headerBg: parsedTheme.headerBg || '',
        userBubbleColor: parsedTheme.userBubbleColor || '',
        botBubbleColor: parsedTheme.botBubbleColor || '',
        starterQuestions: parsedTheme.starterQuestions || [],
      });
    } catch (err) {
      console.error('Load config error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const widgetTheme = JSON.stringify(theme);
      await api.put(`/chatbots/${botId}`, { ...config, widgetTheme });
      await loadBots();
      setMessage('Configuration saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function updateField(field, value) {
    setConfig(prev => ({ ...prev, [field]: value }));
  }

  function updateTheme(field, value) {
    setTheme(prev => ({ ...prev, [field]: value }));
  }

  function addChip() {
    const q = newChip.trim();
    if (!q || theme.starterQuestions.includes(q)) return;
    updateTheme('starterQuestions', [...theme.starterQuestions, q]);
    setNewChip('');
  }

  function removeChip(i) {
    updateTheme('starterQuestions', theme.starterQuestions.filter((_, idx) => idx !== i));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Bot Configuration</h2>
        <p className="text-gray-500 mt-1">Configure chatbot behaviour, appearance, and widget design</p>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm border ${
            message.startsWith('Error')
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-green-50 text-green-700 border-green-200'
          }`}
        >
          {message}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">

        {/* ── Basic Info ─────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">Basic Info</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Bot Name</label>
              <input
                type="text"
                value={config.name}
                onChange={e => updateField('name', e.target.value)}
                className="input-field"
                placeholder="My AI Chatbot"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Welcome Message</label>
              <input
                type="text"
                value={config.welcomeMessage}
                onChange={e => updateField('welcomeMessage', e.target.value)}
                className="input-field"
                placeholder="Hello! How can I help you?"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Active</label>
              <button
                type="button"
                onClick={() => updateField('isActive', !config.isActive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  config.isActive ? 'bg-primary-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.isActive ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* ── Business Details ────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">Business Details</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            This information is sent with every message so the AI can answer accurately about your business.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Name</label>
              <input
                type="text"
                value={config.businessName}
                onChange={e => updateField('businessName', e.target.value)}
                className="input-field"
                placeholder="Acme Corporation"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Information</label>
              {config.ragEnabled && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs mb-3">
                  ⚠️ <strong>RAG Semantic Search is active.</strong> You cannot edit this box directly.
                  Please manage content in the <strong>RAG Knowledge</strong> tab.
                </div>
              )}
              <textarea
                value={config.businessInfo}
                onChange={e => updateField('businessInfo', e.target.value)}
                className="input-field min-h-[120px] disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                placeholder="Describe your business, products, services, hours, location, policies, FAQs, etc."
                rows={5}
                disabled={config.ragEnabled}
              />
            </div>
          </div>
        </div>

        {/* ── System Prompt ──────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">System Prompt</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            This prompt defines the AI's personality and behaviour. It's sent with every message.
          </p>
          <textarea
            value={config.systemPrompt}
            onChange={e => updateField('systemPrompt', e.target.value)}
            className="input-field min-h-[160px] font-mono text-sm"
            placeholder="You are a helpful customer support assistant..."
            rows={7}
          />
        </div>

        {/* ── Appearance & Widget Design ─────────────────────────────── */}
        <div className="card space-y-6">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">Appearance & Widget Design</h3>
          </div>

          {/* Two-column layout: Controls | Preview */}
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left — Controls */}
            <div className="flex-1 space-y-6 min-w-0">

              {/* Basic position / color */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Primary Accent Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={config.primaryColor}
                      onChange={e => updateField('primaryColor', e.target.value)}
                      className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={config.primaryColor}
                      onChange={e => updateField('primaryColor', e.target.value)}
                      className="input-field flex-1"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Widget Position</label>
                  <select
                    value={config.position}
                    onChange={e => updateField('position', e.target.value)}
                    className="input-field"
                  >
                    <option value="bottom-right">Bottom Right</option>
                    <option value="bottom-left">Bottom Left</option>
                  </select>
                </div>
              </div>

              {/* Template selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Layout className="w-4 h-4 inline-block mr-1.5 text-primary-500" />
                  Design Template
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {TEMPLATES.map(tpl => {
                    const Icon = tpl.Icon;
                    const isActive = theme.templateId === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => updateTheme('templateId', tpl.id)}
                        className={`relative p-3 rounded-xl border-2 text-left transition-all ${
                          isActive
                            ? 'border-primary-500 bg-primary-50/60 shadow-sm'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {/* colour swatch */}
                        <div
                          className="w-full h-8 rounded-lg mb-2"
                          style={{
                            background: `linear-gradient(135deg, ${tpl.preview.from} 0%, ${tpl.preview.to} 100%)`,
                          }}
                        />
                        <div className="flex items-center gap-1.5">
                          <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-primary-600' : 'text-gray-400'}`} />
                          <span className={`text-xs font-semibold ${isActive ? 'text-primary-700' : 'text-gray-600'}`}>
                            {tpl.name}
                          </span>
                        </div>
                        {isActive && (
                          <span className="absolute top-2 right-2 w-4 h-4 bg-primary-500 rounded-full flex items-center justify-center">
                            <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white fill-white">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Brand assets */}
              <div className="space-y-4">
                <label className="block text-sm font-medium text-gray-700">
                  <Image className="w-4 h-4 inline-block mr-1.5 text-primary-500" />
                  Brand Assets (Image URLs)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Header Logo URL</label>
                    <input
                      type="url"
                      value={theme.logoUrl}
                      onChange={e => updateTheme('logoUrl', e.target.value)}
                      className="input-field text-sm"
                      placeholder="https://yoursite.com/logo.png"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Shown in chat header next to bot name</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Launcher Button Icon URL</label>
                    <input
                      type="url"
                      value={theme.launcherIconUrl}
                      onChange={e => updateTheme('launcherIconUrl', e.target.value)}
                      className="input-field text-sm"
                      placeholder="https://yoursite.com/chat-icon.png"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Replaces the default chat bubble icon</p>
                  </div>
                </div>
              </div>

              {/* Color overrides */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Color Overrides (optional)</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Widget Primary Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={theme.primaryColor || config.primaryColor}
                        onChange={e => updateTheme('primaryColor', e.target.value)}
                        className="w-8 h-8 rounded-md border border-gray-300 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={theme.primaryColor}
                        onChange={e => updateTheme('primaryColor', e.target.value)}
                        className="input-field flex-1 text-xs"
                        placeholder="Inherits primary"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">User Bubble Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={theme.userBubbleColor || config.primaryColor}
                        onChange={e => updateTheme('userBubbleColor', e.target.value)}
                        className="w-8 h-8 rounded-md border border-gray-300 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={theme.userBubbleColor}
                        onChange={e => updateTheme('userBubbleColor', e.target.value)}
                        className="input-field flex-1 text-xs"
                        placeholder="Inherits primary"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Bot Bubble Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={theme.botBubbleColor || '#f4f4f5'}
                        onChange={e => updateTheme('botBubbleColor', e.target.value)}
                        className="w-8 h-8 rounded-md border border-gray-300 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={theme.botBubbleColor}
                        onChange={e => updateTheme('botBubbleColor', e.target.value)}
                        className="input-field flex-1 text-xs"
                        placeholder="From template"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Starter question chips */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Starter Question Chips
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">(shown below the welcome message)</span>
                </label>

                {/* Existing chips */}
                {theme.starterQuestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {theme.starterQuestions.map((q, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 bg-primary-50 border border-primary-200 text-primary-700 rounded-full px-3 py-1 text-xs font-medium"
                      >
                        {q}
                        <button
                          type="button"
                          onClick={() => removeChip(i)}
                          className="hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Add new chip */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newChip}
                    onChange={e => setNewChip(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addChip())}
                    className="input-field flex-1 text-sm"
                    placeholder='e.g. "What are your pricing plans?"'
                    maxLength={80}
                  />
                  <button
                    type="button"
                    onClick={addChip}
                    disabled={!newChip.trim()}
                    className="btn-secondary flex items-center gap-1.5 text-sm py-2 px-3 disabled:opacity-40"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Up to 5 chips. Press Enter or click Add. Users click one to auto-send it.
                </p>
              </div>
            </div>

            {/* Right — Live Preview */}
            <div className="flex-shrink-0 lg:w-auto flex flex-col items-center gap-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider self-start lg:self-auto">
                Live Preview
              </p>
              <WidgetPreview config={config} theme={theme} />
              <p className="text-[11px] text-gray-400 text-center">
                Updates in real time as you adjust settings
              </p>
            </div>
          </div>
        </div>

        {/* ── Save ──────────────────────────────────────────────────── */}
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </form>
    </div>
  );
}
