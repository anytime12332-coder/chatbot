import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Bot, Save, Building2, MessageSquare, Palette, Plus, Trash2,
  Image, Layout, Star, Sparkles, Moon, Briefcase, Layers,
  Shield, MessageCircle, ThumbsUp
} from 'lucide-react';
import api from '../lib/api';
import { useBots } from '../context/BotContext';

// ─── Template Presets ────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    id: 'hubspot_default',
    name: 'HubSpot Style',
    Icon: MessageCircle,
    badge: 'NEW',
    preview: { from: '#1a1a2e', to: '#ff7a59', bubble: '#f0f0f0', text: '#1a1a2e', userBg: '#ff7a59' },
  },
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
  const tpl = TEMPLATES.find(t => t.id === (theme.templateId || 'hubspot_default')) || TEMPLATES[0];
  const primary = theme.primaryColor || config.primaryColor || tpl.preview.from;
  const isHubspot = theme.templateId === 'hubspot_default';
  const headerBg = theme.templateId === 'modern_gradient'
    ? `linear-gradient(135deg, ${tpl.preview.from} 0%, ${tpl.preview.to} 100%)`
    : isHubspot ? tpl.preview.from
    : (theme.headerBg || tpl.preview.from);
  const userBg = theme.userBubbleColor || (isHubspot ? '#ff7a59' : primary);
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
        boxShadow: isDark ? '0 12px 40px rgba(0,0,0,.5)' : '0 10px 30px rgba(0,0,0,.12)',
        fontFamily: isHubspot ? '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' : theme.templateId === 'corporate' ? 'Georgia, serif' : 'system-ui, sans-serif',
        flexShrink: 0,
        border: isDark ? '1px solid #1e293b' : '1px solid rgba(0,0,0,.07)',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: headerBg,
          padding: isHubspot ? '14px 16px' : '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {/* Avatar in header */}
        {theme.logoUrl ? (
          <img src={theme.logoUrl} alt="Logo" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,.3)' }} />
        ) : (
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
            {(config.name || 'AI').substring(0, 2).toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {config.name || 'Chat'}
          </div>
          {isHubspot && <div style={{ color: 'rgba(255,255,255,.65)', fontSize: 10, marginTop: 1 }}>● Powered by AI</div>}
        </div>
        <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 20, lineHeight: 1, marginLeft: 'auto', cursor: 'pointer' }}>×</span>
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
        {/* Bot welcome row */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, width: '100%' }}>
          {theme.botAvatarUrl ? (
            <img
              src={theme.botAvatarUrl}
              alt="Avatar"
              style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            />
          ) : (
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: primary,
                color: '#fff',
                fontSize: 8,
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {(config.name || 'AI').substring(0, 2).toUpperCase()}
            </div>
          )}
          <div
            style={{
              background: botBg,
              color: botText,
              padding: '8px 12px',
              borderRadius: 12,
              borderBottomLeftRadius: 4,
              fontSize: 12,
              maxWidth: '75%',
            }}
          >
            {config.welcomeMessage || 'Hello! How can I help you today?'}
          </div>
        </div>

        {/* Starter chips */}
        {starterQs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 28 }}>
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

        {/* Thinking indicator preview */}
        {theme.enableThinkingAnimation !== false && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, width: '100%', marginTop: 2 }}>
            {theme.botAvatarUrl ? (
              <img
                src={theme.botAvatarUrl}
                alt="Avatar"
                style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
              />
            ) : (
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: primary,
                  color: '#fff',
                  fontSize: 8,
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {(config.name || 'AI').substring(0, 2).toUpperCase()}
              </div>
            )}
            <div
              style={{
                background: botBg,
                color: botText,
                padding: '6px 10px',
                borderRadius: 12,
                borderBottomLeftRadius: 4,
                fontSize: 12,
                maxWidth: '75%',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"></span>
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0.2s' }}></span>
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0.4s' }}></span>
            </div>
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
      <div style={{ borderTop: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`, background: isDark ? '#0f172a' : '#fff' }}>
        {/* Privacy banner */}
        {theme.privacyPolicyText && (
          <div style={{ background: isDark ? '#1e3a5f' : '#fff9e6', borderBottom: `1px solid ${isDark ? '#2d4a6e' : '#fde68a'}`, padding: '8px 12px', fontSize: 10.5, color: isDark ? '#93c5fd' : '#78350f', display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.4 }}>
            <span style={{ flex: 1 }}>
              {theme.privacyPolicyText}
              {theme.privacyPolicyUrl && <span style={{ color: primary, fontWeight: 600, textDecoration: 'underline', marginLeft: 3 }}>privacy policy</span>}
            </span>
            <span style={{ color: 'inherit', opacity: 0.5, fontSize: 14, cursor: 'pointer' }}>×</span>
          </div>
        )}
        <div style={{ padding: '8px 10px 4px', display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ flex: 1, background: isDark ? '#1e293b' : '#f8fafc', border: `1.5px solid ${isDark ? '#334155' : '#e2e8f0'}`, borderRadius: 10, height: 30, fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
            Type a message…
          </div>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: userBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" width={14} height={14} fill="#fff"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
          </div>
        </div>
        {theme.disclaimerText && (
          <div style={{ fontSize: 9.5, color: '#94a3b8', textAlign: 'center', padding: '0 10px 7px' }}>
            {theme.disclaimerText}
          </div>
        )}
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
    templateId: 'hubspot_default',
    logoUrl: '',
    launcherIconUrl: '',
    primaryColor: '',
    headerBg: '',
    userBubbleColor: '',
    botBubbleColor: '',
    starterQuestions: [],
    botAvatarUrl: '',
    enableThinkingAnimation: true,
    calloutMessage: '',
    calloutDelay: 3,
    disclaimerText: '',
    privacyPolicyUrl: '',
    privacyPolicyText: '',
    feedbackEnabled: true,
    feedbackBadUrl: '',
    feedbackNeutralUrl: '',
    feedbackGoodUrl: '',
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
        templateId: parsedTheme.templateId || 'hubspot_default',
        logoUrl: parsedTheme.logoUrl || '',
        launcherIconUrl: parsedTheme.launcherIconUrl || '',
        primaryColor: parsedTheme.primaryColor || '',
        headerBg: parsedTheme.headerBg || '',
        userBubbleColor: parsedTheme.userBubbleColor || '',
        botBubbleColor: parsedTheme.botBubbleColor || '',
        starterQuestions: parsedTheme.starterQuestions || [],
        botAvatarUrl: parsedTheme.botAvatarUrl || '',
        enableThinkingAnimation: parsedTheme.enableThinkingAnimation ?? true,
        calloutMessage: parsedTheme.calloutMessage || '',
        calloutDelay: parsedTheme.calloutDelay ?? 3,
        disclaimerText: parsedTheme.disclaimerText || '',
        privacyPolicyUrl: parsedTheme.privacyPolicyUrl || '',
        privacyPolicyText: parsedTheme.privacyPolicyText || '',
        feedbackEnabled: parsedTheme.feedbackEnabled ?? true,
        feedbackBadUrl: parsedTheme.feedbackBadUrl || '',
        feedbackNeutralUrl: parsedTheme.feedbackNeutralUrl || '',
        feedbackGoodUrl: parsedTheme.feedbackGoodUrl || '',
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
                        {tpl.badge && !isActive && (
                          <span className="absolute top-1.5 right-1.5 bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                            {tpl.badge}
                          </span>
                        )}
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Bot Message Avatar URL</label>
                    <input
                      type="url"
                      value={theme.botAvatarUrl}
                      onChange={e => updateTheme('botAvatarUrl', e.target.value)}
                      className="input-field text-sm"
                      placeholder="https://yoursite.com/avatar.png"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Avatar shown next to every bot message</p>
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
                <p className="text-xs text-gray-400 mt-1 mb-4">
                  Up to 5 chips. Press Enter or click Add. Users click one to auto-send it.
                </p>
              </div>

              {/* Premium Add-ons Section */}
              <div className="border-t border-gray-150 pt-4 space-y-4">
                <label className="block text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" /> Premium Widget Add-ons
                </label>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">First-Time Notification Callout Message</label>
                    <textarea
                      value={theme.calloutMessage}
                      onChange={e => updateTheme('calloutMessage', e.target.value)}
                      className="input-field text-sm"
                      rows={2}
                      placeholder="e.g. 'Hey there! Have any questions?'"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Appears above the widget launcher button to draw user attention</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Callout Delay (Seconds)</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={theme.calloutDelay}
                      onChange={e => updateTheme('calloutDelay', parseInt(e.target.value) || 3)}
                      className="input-field text-sm"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">How many seconds to wait before callout appears</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Input Disclaimer Text</label>
                    <input
                      type="text"
                      value={theme.disclaimerText}
                      onChange={e => updateTheme('disclaimerText', e.target.value)}
                      className="input-field text-sm"
                      placeholder="e.g. 'AI-generated. Verify important details.'"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Small warning/info message displayed below the input box</p>
                  </div>
                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={theme.enableThinkingAnimation}
                        onChange={e => updateTheme('enableThinkingAnimation', e.target.checked)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                      />
                      <span className="text-xs font-medium text-gray-600">Enable AI Thinking Animation</span>
                    </label>
                  </div>
                </div>

                {/* Privacy Policy Banner */}
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <label className="block text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-yellow-500" /> Privacy Policy Banner
                  </label>
                  <p className="text-[11px] text-gray-400 -mt-1">Shown above the input box. Users can dismiss it. Stays hidden after first dismissal.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Banner Text</label>
                      <textarea
                        value={theme.privacyPolicyText}
                        onChange={e => updateTheme('privacyPolicyText', e.target.value)}
                        className="input-field text-sm"
                        rows={2}
                        placeholder="e.g. We use the info you share to contact you about our services."
                      />
                      <p className="text-[11px] text-gray-400 mt-1">Leave blank to disable the banner</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Privacy Policy URL</label>
                      <input
                        type="url"
                        value={theme.privacyPolicyUrl}
                        onChange={e => updateTheme('privacyPolicyUrl', e.target.value)}
                        className="input-field text-sm"
                        placeholder="https://yoursite.com/privacy"
                      />
                      <p className="text-[11px] text-gray-400 mt-1">Linked as &quot;privacy policy&quot; at the end of the banner text</p>
                    </div>
                  </div>
                </div>

                {/* Feedback Survey */}
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                      <ThumbsUp className="w-4 h-4 text-green-500" /> End-of-Chat Feedback Survey
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={theme.feedbackEnabled}
                        onChange={e => updateTheme('feedbackEnabled', e.target.checked)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                      />
                      <span className="text-xs font-medium text-gray-600">Enabled</span>
                    </label>
                  </div>
                  <p className="text-[11px] text-gray-400 -mt-1">Shows a satisfaction survey when the user says &quot;thanks&quot;, &quot;bye&quot;, &quot;done&quot;, etc. Uses professional icons by default. Optionally replace with your own.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">😞 Not Satisfied Icon URL <span className="text-gray-300">(optional)</span></label>
                      <input
                        type="url"
                        value={theme.feedbackBadUrl}
                        onChange={e => updateTheme('feedbackBadUrl', e.target.value)}
                        className="input-field text-sm"
                        placeholder="https://yoursite.com/bad.png"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">😐 Neutral Icon URL <span className="text-gray-300">(optional)</span></label>
                      <input
                        type="url"
                        value={theme.feedbackNeutralUrl}
                        onChange={e => updateTheme('feedbackNeutralUrl', e.target.value)}
                        className="input-field text-sm"
                        placeholder="https://yoursite.com/neutral.png"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">😊 Satisfied Icon URL <span className="text-gray-300">(optional)</span></label>
                      <input
                        type="url"
                        value={theme.feedbackGoodUrl}
                        onChange={e => updateTheme('feedbackGoodUrl', e.target.value)}
                        className="input-field text-sm"
                        placeholder="https://yoursite.com/good.png"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400">Leave blank to use the built-in professional SVG icons. Upload any PNG/SVG/WebP image or paste a direct URL.</p>
                </div>
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
