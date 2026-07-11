import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Bot, Save, Building2, MessageSquare, Palette } from 'lucide-react';
import api from '../lib/api';
import { useBots } from '../context/BotContext';

export default function BotConfig() {
  const { botId } = useParams();
  const { loadBots } = useBots();
  const [config, setConfig] = useState({
    name: '', businessName: '', businessInfo: '', systemPrompt: '',
    welcomeMessage: '', primaryColor: '#6366f1', position: 'bottom-right', isActive: true,
  });
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
        name: data.name || '', businessName: data.businessName || '',
        businessInfo: data.businessInfo || '', systemPrompt: data.systemPrompt || '',
        welcomeMessage: data.welcomeMessage || '', primaryColor: data.primaryColor || '#6366f1',
        position: data.position || 'bottom-right', isActive: data.isActive ?? true,
        ragEnabled: data.ragEnabled ?? false,
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
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" /></div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Bot Configuration</h2>
        <p className="text-gray-500 mt-1">Configure this chatbot's behavior and business details</p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Basic Info */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">Basic Info</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Bot Name</label>
              <input type="text" value={config.name} onChange={e => updateField('name', e.target.value)} className="input-field" placeholder="My AI Chatbot" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Welcome Message</label>
              <input type="text" value={config.welcomeMessage} onChange={e => updateField('welcomeMessage', e.target.value)} className="input-field" placeholder="Hello! How can I help you?" />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Active</label>
              <button type="button" onClick={() => updateField('isActive', !config.isActive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.isActive ? 'bg-primary-600' : 'bg-gray-300'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
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
          <p className="text-sm text-gray-500 mb-4">This information is sent with every message so the AI can answer accurately about your business.</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Name</label>
              <input type="text" value={config.businessName} onChange={e => updateField('businessName', e.target.value)} className="input-field" placeholder="Acme Corporation" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Information</label>
              {config.ragEnabled ? (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs mb-3">
                  ⚠️ <strong>RAG Semantic Search is active.</strong> You cannot edit this box directly because your business information is split and managed in the <strong>RAG Knowledge</strong> tab. Please go there to upload or edit data (PDFs, TXT, doc files).
                </div>
              ) : null}
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

        {/* System Prompt */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">System Prompt</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">This prompt defines the AI's personality and behavior. It's sent with every message.</p>
          <textarea value={config.systemPrompt} onChange={e => updateField('systemPrompt', e.target.value)}
            className="input-field min-h-[160px] font-mono text-sm"
            placeholder="You are a helpful customer support assistant..." rows={7} />
        </div>

        {/* Appearance */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">Appearance</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Primary Color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={config.primaryColor} onChange={e => updateField('primaryColor', e.target.value)} className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer" />
                <input type="text" value={config.primaryColor} onChange={e => updateField('primaryColor', e.target.value)} className="input-field flex-1" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Widget Position</label>
              <select value={config.position} onChange={e => updateField('position', e.target.value)} className="input-field">
                <option value="bottom-right">Bottom Right</option>
                <option value="bottom-left">Bottom Left</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </form>
    </div>
  );
}
