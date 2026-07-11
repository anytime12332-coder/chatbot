import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Database, Save, Sparkles, RefreshCw, Key, ShieldAlert, Check, HelpCircle, Code, HelpCircle as Info } from 'lucide-react';
import api from '../lib/api';
import { useBots } from '../context/BotContext';

export default function RagSettings() {
  const { botId } = useParams();
  const navigate = useNavigate();
  const { loadBots } = useBots();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [message, setMessage] = useState('');
  
  const [config, setConfig] = useState({
    ragEnabled: false,
    ragProvider: 'openai',
    ragApiKey: '',
    ragModel: 'text-embedding-3-small',
    businessInfo: ''
  });

  const [hasApiKey, setHasApiKey] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  const [sampleChunks, setSampleChunks] = useState([]);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (botId) loadRagConfig();
  }, [botId]);

  async function loadRagConfig() {
    setLoading(true);
    try {
      const data = await api.get(`/rag/${botId}`);
      setConfig({
        ragEnabled: data.ragEnabled ?? false,
        ragProvider: data.ragProvider || 'openai',
        ragApiKey: data.ragApiKey || '',
        ragModel: data.ragModel || 'text-embedding-3-small',
        businessInfo: data.businessInfo || ''
      });
      setHasApiKey(data.hasApiKey ?? false);
      setChunkCount(data.chunkCount || 0);
      setSampleChunks(data.sampleChunks || []);
    } catch (err) {
      console.error('Load RAG config error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await api.put(`/rag/${botId}`, config);
      await loadBots();
      setChunkCount(res.chunkCount || 0);
      setMessage('RAG Knowledge configuration saved successfully!');
      setTimeout(() => setMessage(''), 3000);
      // Reload config to update masked key and sample chunks if rebuilt
      loadRagConfig();
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post(`/rag/${botId}/test`, {
        provider: config.ragProvider,
        apiKey: config.ragApiKey,
        model: config.ragModel
      });
      if (res.success) {
        setTestResult({ success: true, vectorLength: res.vectorLength });
      }
    } catch (err) {
      setTestResult({ error: err.message || 'API connection test failed' });
    } finally {
      setTesting(false);
    }
  }

  async function handleRebuildDatabase() {
    if (!window.confirm('This will recreate all text chunks and regenerate vector embeddings. Continue?')) return;
    setRebuilding(true);
    setMessage('');
    try {
      const res = await api.post(`/rag/${botId}/rebuild`);
      if (res.success) {
        setMessage(`Vector database rebuilt successfully with ${res.chunksCount} chunks!`);
        loadRagConfig();
      }
    } catch (err) {
      setMessage('Rebuild failed: ' + err.message);
    } finally {
      setRebuilding(false);
    }
  }

  function updateField(field, value) {
    setConfig(prev => {
      const updated = { ...prev, [field]: value };
      // Auto-set default models on provider switch
      if (field === 'ragProvider') {
        if (value === 'openai') updated.ragModel = 'text-embedding-3-small';
        else if (value === 'gemini') updated.ragModel = 'text-embedding-004';
        else if (value === 'custom') updated.ragModel = 'text-embedding-3-small|https://api.myendpoint.com/v1/embeddings';
      }
      return updated;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">RAG (Retrieval-Augmented Generation) Knowledge Settings</h2>
        <p className="text-gray-500 mt-1">Optimize chatbot answers by performing real-time semantic context retrieval for massive business files</p>
      </div>

      {message && (
        <div className={`p-3.5 rounded-xl text-sm border ${message.startsWith('Error') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Toggle RAG */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <Database className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Enable RAG Semantic Search</h3>
                <p className="text-sm text-gray-500 mt-0.5">When active, the AI splits your business details and retrieves matching parts in real-time, preventing context window limits.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => updateField('ragEnabled', !config.ragEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.ragEnabled ? 'bg-primary-600' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.ragEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        {/* Configuration details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Settings Box */}
          <div className="lg:col-span-2 space-y-6">
            <div className="card space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary-600" />
                <h4 className="font-semibold text-gray-900">Embedding API Provider</h4>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase mb-1.5">Provider</label>
                  <select
                    value={config.ragProvider}
                    onChange={e => updateField('ragProvider', e.target.value)}
                    className="input-field text-sm"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="custom">Custom Endpoint (OpenAI Compatible)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase mb-1.5">Embedding Model</label>
                  <input
                    type="text"
                    value={config.ragModel}
                    onChange={e => updateField('ragModel', e.target.value)}
                    className="input-field text-sm font-mono"
                    placeholder={config.ragProvider === 'openai' ? 'text-embedding-3-small' : 'text-embedding-004'}
                    required
                  />
                  {config.ragProvider === 'custom' && (
                    <span className="text-[10px] text-gray-400 mt-1 block">Format: `model_name|endpoint_url`</span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1.5">API Key</label>
                <div className="relative">
                  <Key className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    value={config.ragApiKey}
                    onChange={e => updateField('ragApiKey', e.target.value)}
                    className="input-field pl-9 text-sm"
                    placeholder={hasApiKey ? '••••••••••••••••••••••••' : 'Enter API Key for embeddings'}
                    required={!hasApiKey}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing || !config.ragApiKey && !hasApiKey}
                  className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-4"
                >
                  {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  Test API Connection
                </button>
                
                {chunkCount > 0 && (
                  <button
                    type="button"
                    onClick={handleRebuildDatabase}
                    disabled={rebuilding}
                    className="btn-secondary text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50/50 flex items-center gap-1.5 py-2 px-4"
                  >
                    {rebuilding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Force Rebuild Vector DB
                  </button>
                )}
              </div>

              {testResult && (
                <div className={`p-3 rounded-lg text-xs flex items-center gap-2 border ${testResult.success ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                  {testResult.success ? (
                    <>
                      <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span>Embedding API connection succeeded! Return vector dimensions: <strong>{testResult.vectorLength}</strong></span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
                      <span>Embeddings failed: {testResult.error}</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Document stats */}
            <div className="card space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h4 className="font-semibold text-gray-900 flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-primary-600" /> Vector Database Statistics
                </h4>
                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                  {chunkCount} Chunks Generated
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <span className="block text-xs font-semibold text-gray-400 uppercase">Knowledge File Size</span>
                  <span className="text-lg font-bold text-gray-900 mt-1 block">{(config.businessInfo?.length || 0).toLocaleString()} chars</span>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <span className="block text-xs font-semibold text-gray-400 uppercase">Search Method</span>
                  <span className="text-lg font-bold text-gray-900 mt-1 block">
                    {config.ragEnabled ? 'Cosine Semantic' : 'Keyword Text Match'}
                  </span>
                </div>
              </div>

              {/* Chunk previews */}
              {sampleChunks.length > 0 && (
                <div className="space-y-2 pt-2">
                  <label className="block text-xs font-semibold text-gray-400 uppercase">Vector Chunks Preview (Top 5)</label>
                  <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                    {sampleChunks.map((chunk, idx) => (
                      <div key={chunk.id} className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs leading-relaxed text-gray-600 relative group">
                        <span className="absolute top-2 right-2 text-[9px] bg-gray-200 text-gray-500 font-bold px-1.5 py-0.5 rounded">Chunk #{idx + 1}</span>
                        <p className="pr-12 truncate">{chunk.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Guidelines Sidebar */}
          <div className="space-y-6">
            <div className="p-5 bg-indigo-950 text-white rounded-2xl shadow-xl space-y-4">
              <h4 className="font-bold text-base flex items-center gap-1.5">
                <Info className="w-5 h-5 text-indigo-300" /> What is RAG?
              </h4>
              <p className="text-xs leading-relaxed text-indigo-200">
                RAG (Retrieval-Augmented Generation) is an industry-grade approach to handle huge company files, catalogs, or knowledge bases.
              </p>
              <ul className="text-xs leading-relaxed text-indigo-200 list-disc list-inside space-y-2">
                <li>Splits your business description into semantic text chunks.</li>
                <li>Converts each chunk into a mathematical vector representation.</li>
                <li>When visitors ask questions, the system instantly matches the question to relevant chunks and feeds only relevant paragraphs to the AI.</li>
              </ul>
              <div className="p-3 bg-indigo-900/60 border border-indigo-800 rounded-xl text-[11px] text-indigo-300">
                <strong>Pro-Tip:</strong> Using RAG keeps LLM tokens low and costs minimal while ensuring highly accurate response retrieval.
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 py-2 px-5 font-medium">
            <Save className="w-4 h-4" />
            {saving ? 'Saving Config...' : 'Save Configuration'}
          </button>
        </div>
      </form>
    </div>
  );
}
