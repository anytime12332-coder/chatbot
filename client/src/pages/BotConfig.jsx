import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Bot, Save, Building2, MessageSquare, Palette, Sparkles, Headset, User,
  Layout, Eye, Sliders, Type, Check, HelpCircle, Mic, Send
} from 'lucide-react';
import api from '../lib/api';
import { useBots } from '../context/BotContext';

export default function BotConfig() {
  const { botId } = useParams();
  const { loadBots } = useBots();
  const [config, setConfig] = useState({
    name: '',
    welcomeMessage: '',
    businessName: '',
    businessInfo: '',
    systemPrompt: '',
    primaryColor: '#6366f1',
    position: 'bottom-right',
    isActive: true,
    statusText: 'Online',
    avatarIcon: 'bot',
    avatarUrl: '',
    placeholderText: 'Type a message...',
    launcherText: '',
    theme: 'light',
    fontSize: 'medium',
    borderRadius: '18px',
    starterPrompts: '',
    hideBranding: false,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('design');

  const colorPresets = [
    { name: 'Indigo', hex: '#6366f1' },
    { name: 'Emerald', hex: '#10b981' },
    { name: 'Rose', hex: '#f43f5e' },
    { name: 'Violet', hex: '#8b5cf6' },
    { name: 'Ocean', hex: '#0284c7' },
    { name: 'Amber', hex: '#d97706' },
    { name: 'Dark Slate', hex: '#334155' },
  ];

  useEffect(() => {
    if (botId) loadConfig();
  }, [botId]);

  async function loadConfig() {
    setLoading(true);
    try {
      const data = await api.get(`/chatbots/${botId}`);
      setConfig({
        name: data.name || '',
        welcomeMessage: data.welcomeMessage || '',
        businessName: data.businessName || '',
        businessInfo: data.businessInfo || '',
        systemPrompt: data.systemPrompt || '',
        primaryColor: data.primaryColor || '#6366f1',
        position: data.position || 'bottom-right',
        isActive: data.isActive ?? true,
        statusText: data.statusText || 'Online',
        avatarIcon: data.avatarIcon || 'bot',
        avatarUrl: data.avatarUrl || '',
        placeholderText: data.placeholderText || 'Type a message...',
        launcherText: data.launcherText || '',
        theme: data.theme || 'light',
        fontSize: data.fontSize || 'medium',
        borderRadius: data.borderRadius || '18px',
        starterPrompts: data.starterPrompts || '',
        hideBranding: data.hideBranding ?? false,
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
      await api.put(`/chatbots/${botId}`, config);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    );
  }

  // Calculate live preview prompts array
  const promptList = config.starterPrompts.split('\n').map(s => s.trim()).filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Bot Configuration & Customization</h2>
          <p className="text-gray-500 mt-1">Customize design, colors, header, voice settings, and AI behavior</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2 self-start sm:self-auto shadow-md hover:shadow-lg transition-all"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-sm font-medium ${
          message.startsWith('Error')
            ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-green-50 text-green-700 border border-green-200 shadow-sm'
        }`}>
          {message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-6">
        <button
          onClick={() => setActiveTab('design')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'design'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Palette className="w-4 h-4" /> Widget Design & Appearance
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'ai'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Bot className="w-4 h-4" /> AI Behavior & Knowledge
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Form Fields (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {activeTab === 'design' ? (
            <>
              {/* Header & Avatar */}
              <div className="card">
                <div className="flex items-center gap-2 mb-4">
                  <Layout className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Header & Avatar</h3>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bot Name</label>
                      <input
                        type="text"
                        value={config.name}
                        onChange={e => updateField('name', e.target.value)}
                        className="input-field"
                        placeholder="My AI Chatbot"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status / Subtitle</label>
                      <input
                        type="text"
                        value={config.statusText}
                        onChange={e => updateField('statusText', e.target.value)}
                        className="input-field"
                        placeholder="Online, Replies instantly, etc."
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Avatar Icon</label>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { id: 'bot', label: 'Bot', icon: Bot },
                        { id: 'sparkles', label: 'Sparkles', icon: Sparkles },
                        { id: 'headset', label: 'Support', icon: Headset },
                        { id: 'user', label: 'Agent', icon: User },
                      ].map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => updateField('avatarIcon', item.id)}
                          className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                            config.avatarIcon === item.id
                              ? 'border-primary-600 bg-primary-50 text-primary-600 font-semibold shadow-sm'
                              : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                          }`}
                        >
                          <item.icon className="w-5 h-5" />
                          <span className="text-xs">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Custom Avatar Image URL (Optional)</label>
                    <input
                      type="url"
                      value={config.avatarUrl}
                      onChange={e => updateField('avatarUrl', e.target.value)}
                      className="input-field"
                      placeholder="https://example.com/avatar.png"
                    />
                  </div>
                </div>
              </div>

              {/* Theme & Colors */}
              <div className="card">
                <div className="flex items-center gap-2 mb-4">
                  <Palette className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Color Palette & Theme</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Primary Brand Color</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={config.primaryColor}
                        onChange={e => updateField('primaryColor', e.target.value)}
                        className="w-11 h-11 rounded-xl border border-gray-300 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={config.primaryColor}
                        onChange={e => updateField('primaryColor', e.target.value)}
                        className="input-field w-36 font-mono text-sm uppercase"
                      />
                      <div className="flex flex-wrap gap-1.5 ml-auto">
                        {colorPresets.map(p => (
                          <button
                            key={p.hex}
                            type="button"
                            onClick={() => updateField('primaryColor', p.hex)}
                            title={p.name}
                            className="w-7 h-7 rounded-full border border-black/10 transition-transform hover:scale-110"
                            style={{ backgroundColor: p.hex }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Theme Mode</label>
                      <select
                        value={config.theme}
                        onChange={e => updateField('theme', e.target.value)}
                        className="input-field"
                      >
                        <option value="light">Light Mode</option>
                        <option value="dark">Dark Mode</option>
                        <option value="slate">Soft Slate</option>
                        <option value="indigo">Soft Indigo</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Font Size</label>
                      <select
                        value={config.fontSize}
                        onChange={e => updateField('fontSize', e.target.value)}
                        className="input-field"
                      >
                        <option value="small">Small (12.5px)</option>
                        <option value="medium">Medium (13.5px)</option>
                        <option value="large">Large (15px)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Border Roundness</label>
                      <select
                        value={config.borderRadius}
                        onChange={e => updateField('borderRadius', e.target.value)}
                        className="input-field"
                      >
                        <option value="12px">Slight (12px)</option>
                        <option value="18px">Medium (18px)</option>
                        <option value="24px">Extra Rounded (24px)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Launcher & Input */}
              <div className="card">
                <div className="flex items-center gap-2 mb-4">
                  <Sliders className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Launcher & Input Box</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Widget Position</label>
                    <select
                      value={config.position}
                      onChange={e => updateField('position', e.target.value)}
                      className="input-field"
                    >
                      <option value="bottom-right">Bottom Right</option>
                      <option value="bottom-left">Bottom Left</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Launcher Button Label</label>
                    <input
                      type="text"
                      value={config.launcherText}
                      onChange={e => updateField('launcherText', e.target.value)}
                      className="input-field"
                      placeholder="e.g. Chat with us (or leave empty for icon)"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Input Placeholder Text</label>
                    <input
                      type="text"
                      value={config.placeholderText}
                      onChange={e => updateField('placeholderText', e.target.value)}
                      className="input-field"
                      placeholder="Ask us anything..."
                    />
                  </div>
                </div>
              </div>

              {/* Starter Prompts & Branding */}
              <div className="card">
                <div className="flex items-center gap-2 mb-4">
                  <HelpCircle className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Starter Questions & Footer</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quick Starter Questions (One per line)
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      These clickable suggestion chips appear below the welcome message for instant answers.
                    </p>
                    <textarea
                      value={config.starterPrompts}
                      onChange={e => updateField('starterPrompts', e.target.value)}
                      className="input-field min-h-[90px] font-mono text-sm"
                      placeholder={"What are your operating hours?\nHow do I contact customer support?\nTell me about pricing plans"}
                      rows={3}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div>
                      <span className="text-sm font-medium text-gray-800">Hide "Powered by" Branding</span>
                      <p className="text-xs text-gray-500">Remove the branding footer link at bottom of chatbot widget</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateField('hideBranding', !config.hideBranding)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        config.hideBranding ? 'bg-primary-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          config.hideBranding ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Basic Info */}
              <div className="card">
                <div className="flex items-center gap-2 mb-4">
                  <Bot className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Basic & Active Status</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Welcome Message</label>
                    <input
                      type="text"
                      value={config.welcomeMessage}
                      onChange={e => updateField('welcomeMessage', e.target.value)}
                      className="input-field"
                      placeholder="Hello! How can I help you today?"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div>
                      <span className="text-sm font-medium text-gray-800">Chatbot Active</span>
                      <p className="text-xs text-gray-500">Enable or disable chatbot on website embeds</p>
                    </div>
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

              {/* Business Details */}
              <div className="card">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Business Details</h3>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  This context is automatically passed to the AI to accurately answer visitor questions about your company.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Name</label>
                    <input
                      type="text"
                      value={config.businessName}
                      onChange={e => updateField('businessName', e.target.value)}
                      className="input-field"
                      placeholder="Acme Inc."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Information & FAQs</label>
                    <textarea
                      value={config.businessInfo}
                      onChange={e => updateField('businessInfo', e.target.value)}
                      className="input-field min-h-[140px]"
                      placeholder="Describe products, services, operating hours, refund policies, contact emails..."
                      rows={6}
                    />
                  </div>
                </div>
              </div>

              {/* System Prompt */}
              <div className="card">
                <div className="flex items-center gap-2 mb-4">
                  <MessageSquare className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-semibold text-gray-900">System Prompt</h3>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Defines the chatbot persona, tone, language, and guidelines.
                </p>
                <textarea
                  value={config.systemPrompt}
                  onChange={e => updateField('systemPrompt', e.target.value)}
                  className="input-field min-h-[160px] font-mono text-sm"
                  placeholder="You are a polite customer support assistant for Acme Inc..."
                  rows={7}
                />
              </div>
            </>
          )}
        </div>

        {/* Live Interactive Preview Panel (5 cols) */}
        <div className="lg:col-span-5 sticky top-6">
          <div className="card bg-gray-50/80 border border-gray-200">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary-600" />
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Live Widget Preview</h3>
              </div>
              <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">
                Real-time Sync
              </span>
            </div>

            {/* Simulated Webpage Container */}
            <div className="bg-white rounded-2xl shadow-inner border border-gray-200 p-4 h-[580px] flex flex-col justify-end relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-100 opacity-60 pointer-events-none" />

              {/* Chatbot Window Preview */}
              <div
                className={`w-full flex flex-col shadow-2xl overflow-hidden relative z-10 transition-all duration-200 border ${
                  config.theme === 'dark'
                    ? 'bg-slate-900 border-slate-800 text-slate-100'
                    : config.theme === 'indigo'
                    ? 'bg-white border-indigo-100 text-slate-900'
                    : 'bg-white border-gray-200 text-slate-900'
                }`}
                style={{
                  borderRadius: config.borderRadius,
                  height: '460px',
                  fontSize: config.fontSize === 'small' ? '12.5px' : config.fontSize === 'large' ? '15px' : '13.5px',
                }}
              >
                {/* Header */}
                <div
                  className="px-4 py-3 text-white flex items-center justify-between shadow-sm"
                  style={{ backgroundColor: config.primaryColor }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs overflow-hidden">
                      {config.avatarUrl ? (
                        <img src={config.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                      ) : config.avatarIcon === 'sparkles' ? (
                        <Sparkles className="w-4 h-4 text-white" />
                      ) : config.avatarIcon === 'headset' ? (
                        <Headset className="w-4 h-4 text-white" />
                      ) : config.avatarIcon === 'user' ? (
                        <User className="w-4 h-4 text-white" />
                      ) : (
                        <span>{config.name.slice(0, 2).toUpperCase() || 'AI'}</span>
                      )}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm leading-tight text-white">{config.name || 'AI Chatbot'}</h4>
                      <p className="text-[11px] opacity-90 flex items-center gap-1 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block shadow-[0_0_4px_#4ade80]" />
                        {config.statusText || 'Online'}
                      </p>
                    </div>
                  </div>
                  <span className="text-xl font-medium opacity-80">&times;</span>
                </div>

                {/* Messages Body */}
                <div
                  className={`flex-1 p-4 overflow-y-auto space-y-3 ${
                    config.theme === 'dark'
                      ? 'bg-slate-800'
                      : config.theme === 'indigo'
                      ? 'bg-indigo-50/50'
                      : config.theme === 'slate'
                      ? 'bg-slate-100'
                      : 'bg-gray-50'
                  }`}
                >
                  {/* Bot Welcome Bubble */}
                  <div className="flex items-start gap-2.5">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0 overflow-hidden"
                      style={{ backgroundColor: config.primaryColor }}
                    >
                      {config.avatarUrl ? (
                        <img src={config.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span>{config.name.slice(0, 2).toUpperCase() || 'AI'}</span>
                      )}
                    </div>
                    <div className="max-w-[80%] space-y-1">
                      <div
                        className={`p-3 rounded-2xl border text-sm leading-relaxed shadow-sm ${
                          config.theme === 'dark'
                            ? 'bg-slate-700 text-slate-100 border-slate-600'
                            : 'bg-white text-slate-800 border-gray-100'
                        }`}
                      >
                        {config.welcomeMessage || 'Hello! How can I help you today?'}
                      </div>
                    </div>
                  </div>

                  {/* Starter Chips Preview */}
                  {promptList.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pl-9">
                      {promptList.map((promptText, i) => (
                        <button
                          key={i}
                          type="button"
                          className="text-xs px-3 py-1.5 rounded-full font-medium border transition-all text-left"
                          style={{
                            color: config.primaryColor,
                            borderColor: config.primaryColor + '44',
                            backgroundColor: config.primaryColor + '12',
                          }}
                        >
                          {promptText}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Sample User Bubble */}
                  <div className="flex items-end justify-end">
                    <div
                      className="p-3 rounded-2xl text-white text-sm leading-relaxed max-w-[78%] shadow-sm"
                      style={{ backgroundColor: config.primaryColor }}
                    >
                      Can you tell me more about your service?
                    </div>
                  </div>
                </div>

                {/* Input Area Preview */}
                <div
                  className={`p-3 border-t ${
                    config.theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'
                  }`}
                >
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
                      config.theme === 'dark'
                        ? 'bg-slate-800 border-slate-700 text-slate-200'
                        : 'bg-gray-100 border-gray-200 text-slate-800'
                    }`}
                  >
                    <input
                      type="text"
                      readOnly
                      value=""
                      placeholder={config.placeholderText || 'Type a message...'}
                      className="flex-1 bg-transparent border-none outline-none text-xs pointer-events-none"
                    />
                    <button type="button" className="text-gray-400 p-1">
                      <Mic className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white shadow-sm"
                      style={{ backgroundColor: config.primaryColor }}
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {!config.hideBranding && (
                    <div className="text-center text-[10px] text-gray-400 mt-1.5">
                      Powered by <span className="font-semibold" style={{ color: config.primaryColor }}>AI Chatbot</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Launcher Preview Button */}
              <div className="flex justify-end mt-3 relative z-10">
                <div
                  className="flex items-center justify-center gap-2 text-white font-semibold shadow-lg text-sm transition-all"
                  style={{
                    backgroundColor: config.primaryColor,
                    borderRadius: config.launcherText ? '24px' : '50%',
                    height: '46px',
                    padding: config.launcherText ? '0 18px' : '0',
                    width: config.launcherText ? 'auto' : '46px',
                  }}
                >
                  <Bot className="w-5 h-5 text-white" />
                  {config.launcherText && <span>{config.launcherText}</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
