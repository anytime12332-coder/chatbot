import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Key, Save, TestTube, CheckCircle, XCircle, Cpu } from 'lucide-react';
import api from '../lib/api';

export default function ApiConfig() {
  const { botId } = useParams();
  const [config, setConfig] = useState({
    provider: 'openai', apiKey: '', model: '', baseUrl: '', maxTokens: 1024, temperature: 0.7,
  });
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (botId) loadData();
  }, [botId]);

  async function loadData() {
    setLoading(true);
    try {
      const [botData, providerData] = await Promise.all([
        api.get(`/chatbots/${botId}`),
        api.get('/api-config/providers'),
      ]);
      if (botData.apiConfig) {
        setConfig({
          provider: botData.apiConfig.provider || 'openai',
          apiKey: botData.apiConfig.apiKey || '',
          model: botData.apiConfig.model || '',
          baseUrl: botData.apiConfig.baseUrl || '',
          maxTokens: botData.apiConfig.maxTokens || 1024,
          temperature: botData.apiConfig.temperature || 0.7,
        });
      }
      setProviders(providerData);
    } catch (err) {
      console.error('Load API config error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.put(`/api-config/${botId}`, config);
      setMessage('API configuration saved!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.post(`/api-config/${botId}/test`);
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  }

  function updateField(field, value) {
    setConfig(prev => ({ ...prev, [field]: value }));
  }

  const currentProvider = providers.find(p => p.id === config.provider);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" /></div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">API Configuration</h2>
        <p className="text-gray-500 mt-1">Configure the AI provider for this chatbot</p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Provider Selection */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">AI Provider</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {providers.map(provider => (
              <button key={provider.id} type="button"
                onClick={() => { updateField('provider', provider.id); updateField('model', provider.defaultModel); if (provider.id !== 'custom') updateField('baseUrl', ''); }}
                className={`p-4 rounded-xl border-2 text-center transition-all ${config.provider === provider.id ? 'border-primary-500 bg-primary-50 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
                <div className="text-2xl mb-1">
                  {provider.id === 'openai' && '\ud83d\udfe2'}{provider.id === 'gemini' && '\ud83d\udd35'}{provider.id === 'claude' && '\ud83d\udfe0'}{provider.id === 'openrouter' && '\ud83d\udfe3'}{provider.id === 'custom' && '\u2699\ufe0f'}
                </div>
                <p className="text-sm font-medium text-gray-900">{provider.name}</p>
                {provider.supportsStreaming && <p className="text-xs text-green-600 mt-1">Streaming \u2713</p>}
              </button>
            ))}
          </div>
        </div>

        {/* API Key & Model */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Key className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">API Settings</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">API Key</label>
              <input type="password" value={config.apiKey} onChange={e => updateField('apiKey', e.target.value)} className="input-field font-mono" placeholder="sk-..." />
              <p className="text-xs text-gray-400 mt-1">\ud83d\udd12 Your API key is encrypted with AES-256-GCM before storage</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Model</label>
                {currentProvider?.models?.length > 0 ? (
                  <select value={config.model} onChange={e => updateField('model', e.target.value)} className="input-field">
                    {currentProvider.models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <input type="text" value={config.model} onChange={e => updateField('model', e.target.value)} className="input-field" placeholder="model-name" />
                )}
              </div>
              {(config.provider === 'custom' || config.provider === 'openai') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {config.provider === 'custom' ? 'Base URL (Required)' : 'Custom Base URL (Optional)'}
                  </label>
                  <input type="url" value={config.baseUrl} onChange={e => updateField('baseUrl', e.target.value)} className="input-field" placeholder="https://api.example.com/v1/chat/completions" required={config.provider === 'custom'} />
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Max Tokens: {config.maxTokens}</label>
                <input type="range" min="256" max="4096" step="256" value={config.maxTokens} onChange={e => updateField('maxTokens', parseInt(e.target.value))} className="w-full accent-primary-600" />
                <div className="flex justify-between text-xs text-gray-400"><span>256</span><span>4096</span></div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Temperature: {config.temperature}</label>
                <input type="range" min="0" max="2" step="0.1" value={config.temperature} onChange={e => updateField('temperature', parseFloat(e.target.value))} className="w-full accent-primary-600" />
                <div className="flex justify-between text-xs text-gray-400"><span>Precise (0)</span><span>Creative (2)</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <button type="button" onClick={handleTest} disabled={testing} className="btn-secondary flex items-center gap-2">
            <TestTube className="w-4 h-4" />{testing ? 'Testing...' : 'Test Connection'}
          </button>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>

        {testResult && (
          <div className={`card ${testResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <div className="flex items-center gap-2 mb-2">
              {testResult.success ? <CheckCircle className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
              <span className={`font-semibold ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                {testResult.success ? 'Connection Successful!' : 'Connection Failed'}
              </span>
            </div>
            {testResult.success ? (
              <div className="text-sm text-green-700 space-y-1">
                <p>Response: {testResult.message}</p>
                <p>Provider: {testResult.provider} | Model: {testResult.model} | Time: {testResult.responseTimeMs}ms</p>
              </div>
            ) : (
              <p className="text-sm text-red-700">{testResult.error}</p>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
