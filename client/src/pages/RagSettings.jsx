import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Database, Save, Sparkles, RefreshCw, Key, ShieldAlert, Check, HelpCircle, FileText, Upload, Copy, Edit, FileCode, Search } from 'lucide-react';
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
  const [parsingFile, setParsingFile] = useState(false);
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

  // Tab state for knowledge source input
  const [inputTab, setInputTab] = useState('text'); // 'text' or 'upload'
  const [fileProgress, setFileProgress] = useState('');

  // RAG Search inspector states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [expandedChunks, setExpandedChunks] = useState({});

  async function handleSearch(e) {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError('');
    setSearchResults([]);
    try {
      const res = await api.post(`/rag/${botId}/search`, { query: searchQuery.trim(), limit: 8 });
      setSearchResults(res.results || []);
      if (!res.results || res.results.length === 0) {
        setSearchError('No matching chunks found in the database for this query.');
      }
    } catch (err) {
      setSearchError(err.message || 'Failed to query RAG search endpoint.');
    } finally {
      setSearching(false);
    }
  }

  function toggleExpandChunk(idx) {
    setExpandedChunks(prev => ({ ...prev, [idx]: !prev[idx] }));
  }

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
    if (e) e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await api.put(`/rag/${botId}`, config);
      await loadBots();
      setChunkCount(res.chunkCount || 0);
      setMessage('RAG Knowledge configurations and data saved successfully!');
      setTimeout(() => setMessage(''), 3500);
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
    if (!config.businessInfo?.trim()) {
      alert('Please add some business details/files first before rebuilding.');
      return;
    }
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

  // Load PDF.js worker dynamically from CDN
  const loadPdfJs = () => {
    return new Promise((resolve, reject) => {
      if (window.pdfjsLib) return resolve(window.pdfjsLib);
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      script.onerror = () => reject(new Error('Failed to load PDF parser library from CDN'));
      document.head.appendChild(script);
    });
  };

  // Browser-side PDF text parser
  const parsePdfText = async (file) => {
    const pdfjsLib = await loadPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      setFileProgress(`Parsing PDF page ${i} of ${pdf.numPages}...`);
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map(item => item.str);
      text += strings.join(' ') + '\n';
    }
    return text;
  };

  // Browser-side text/md parser
  const parseTxtText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  // File drop/upload handler
  async function handleFileUpload(e, mode) {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsingFile(true);
    setFileProgress('Initializing file parser...');
    
    try {
      let extractedText = '';
      if (file.type === 'application/pdf') {
        extractedText = await parsePdfText(file);
      } else if (file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.json') || file.name.endsWith('.csv')) {
        extractedText = await parseTxtText(file);
      } else {
        throw new Error('Unsupported file format. Please upload PDF, TXT, MD, CSV, or JSON.');
      }

      if (!extractedText.trim()) {
        throw new Error('Extracted text is empty. Verify file contents.');
      }

      setFileProgress('Text successfully extracted!');
      setTimeout(() => setFileProgress(''), 3000);

      // Save to config state
      setConfig(prev => {
        const newText = mode === 'append' && prev.businessInfo
          ? `${prev.businessInfo}\n\n${extractedText}`
          : extractedText;
        return { ...prev, businessInfo: newText };
      });
      
      alert(`Text successfully loaded (${extractedText.length} characters). Click "Save Configuration" at the bottom to rebuild vector chunks!`);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
      setFileProgress('');
    } finally {
      setParsingFile(false);
    }
  }

  function updateField(field, value) {
    setConfig(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'ragProvider') {
        if (value === 'openai') updated.ragModel = 'text-embedding-3-small';
        else if (value === 'gemini') updated.ragModel = 'text-embedding-004';
        else if (value === 'openrouter') updated.ragModel = 'openai/text-embedding-3-small';
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
        <h2 className="text-2xl font-bold text-gray-900">RAG (Retrieval-Augmented Generation) Knowledge</h2>
        <p className="text-gray-500 mt-1">Optimize chatbot answers by performing real-time semantic context retrieval for massive business files</p>
      </div>

      {message && (
        <div className={`p-3.5 rounded-xl text-sm border ${message.startsWith('Error') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
          {message}
        </div>
      )}

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

      <form onSubmit={handleSave} className="space-y-6">
        {/* Knowledge Base Input Options */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary-600" />
              <h3 className="text-lg font-semibold text-gray-900">Manage Knowledge Base Data</h3>
            </div>
            
            {/* Input option tab selector */}
            <div className="flex bg-gray-100 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setInputTab('text')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${inputTab === 'text' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                Paste Plain Text
              </button>
              <button
                type="button"
                onClick={() => setInputTab('upload')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${inputTab === 'upload' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                Import Files (PDF, TXT)
              </button>
            </div>
          </div>

          {!config.ragEnabled && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
              ℹ️ <strong>RAG is currently disabled.</strong> While RAG is off, the text inside this box is sent entirely to the LLM system prompt. Enable RAG above to utilize dynamic vector chunking.
            </div>
          )}

          {inputTab === 'text' ? (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Raw Business Details</label>
              <textarea
                value={config.businessInfo}
                onChange={e => updateField('businessInfo', e.target.value)}
                className="input-field min-h-[220px] font-mono text-sm leading-relaxed"
                placeholder="Describe your business, products, services, FAQs, and database info here..."
                rows={10}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-200 hover:border-primary-400 rounded-xl p-8 text-center bg-gray-50/50 cursor-pointer transition-colors relative">
                <input
                  type="file"
                  accept=".txt,.md,.pdf,.json,.csv"
                  onChange={e => handleFileUpload(e, 'replace')}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={parsingFile}
                />
                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2.5" />
                <h4 className="font-semibold text-gray-800 text-sm">Upload & Replace Knowledge Source</h4>
                <p className="text-xs text-gray-400 mt-1">Supports PDF, TXT, MD, CSV, or JSON (max 10MB)</p>
              </div>

              <div className="flex items-center justify-center gap-4 text-xs">
                <span className="text-gray-400">Or append to current knowledge:</span>
                <label className="text-primary-600 hover:text-primary-700 font-bold cursor-pointer border border-primary-200 rounded-lg px-3 py-1.5 hover:bg-primary-50 transition-colors">
                  <input
                    type="file"
                    accept=".txt,.md,.pdf,.json,.csv"
                    onChange={e => handleFileUpload(e, 'append')}
                    className="hidden"
                    disabled={parsingFile}
                  />
                  + Append File
                </label>
              </div>

              {parsingFile && (
                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-700 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{fileProgress}</span>
                </div>
              )}

              {config.businessInfo && (
                <div className="border border-gray-200 rounded-xl bg-gray-50 p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-gray-400 uppercase">Extracted Knowledge Base Character Preview</span>
                    <span className="text-[10px] text-gray-500 font-medium">({config.businessInfo.length.toLocaleString()} characters)</span>
                  </div>
                  <pre className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap">
                    {config.businessInfo.substring(0, 1000)}
                    {config.businessInfo.length > 1000 ? '...' : ''}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Configurations Details */}
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
                    <option value="openrouter">OpenRouter</option>
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

            {/* RAG Query Inspector */}
            {chunkCount > 0 && (
              <div className="card space-y-4 border border-indigo-100 shadow-sm hover:shadow-md transition-all rounded-2xl bg-white p-6">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                  <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                    <Search className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-950 text-sm">RAG Query Inspector & Tester</h4>
                    <p className="text-[11px] text-gray-400">Test search queries to see exactly which chunks will be retrieved for your bot's system prompt</p>
                  </div>
                </div>

                <form onSubmit={handleSearch} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Type a test question (e.g., 'What is your refund policy?')..."
                      className="input-field pl-9 text-sm py-2.5"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={searching}
                    className="btn-primary py-2.5 px-4 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors disabled:opacity-50"
                  >
                    {searching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    Test Retrieval
                  </button>
                </form>

                {searchError && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
                    ⚠️ {searchError}
                  </div>
                )}

                {searchResults.length > 0 && (
                  <div className="space-y-3 pt-1">
                    <div className="flex justify-between items-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      <span>Retrieved Chunks ({searchResults.length})</span>
                      <span className="text-[10px] text-indigo-500 font-medium lowercase">sorted by hybrid match rank</span>
                    </div>

                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                      {searchResults.map((item, idx) => {
                        const isExpanded = !!expandedChunks[item.chunkIndex];
                        return (
                          <div
                            key={item.id}
                            className="bg-white border border-gray-150 hover:border-indigo-200 rounded-xl p-3.5 transition-all text-xs space-y-2.5 relative shadow-sm"
                          >
                            {/* Header details */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-50 pb-2">
                              <div className="flex items-center gap-2">
                                <span className="bg-indigo-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-full shadow-sm">
                                  Rank #{idx + 1}
                                </span>
                                <span className="text-[10px] text-gray-400 font-medium">
                                  Chunk Index: #{item.chunkIndex}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 font-semibold px-2 py-0.5 rounded-md text-[9px]">
                                  Semantic: {(item.semanticSim * 100).toFixed(0)}%
                                </span>
                                <span className="bg-sky-50 text-sky-700 border border-sky-100 font-semibold px-2 py-0.5 rounded-md text-[9px]">
                                  Keyword: {(item.lexicalScore * 100).toFixed(0)}%
                                </span>
                                <span className="bg-indigo-50 text-indigo-700 border border-indigo-150 font-bold px-2 py-0.5 rounded-md text-[9px]">
                                  Score: {item.hybridScore.toFixed(3)}
                                </span>
                              </div>
                            </div>

                            {/* Section heading path */}
                            {item.sectionHeading && (
                              <div className="text-[10px] text-indigo-600 font-semibold bg-indigo-50/50 py-0.5 px-2 rounded inline-block">
                                Heading: {item.sectionHeading}
                              </div>
                            )}

                            {/* Text content */}
                            <div className="relative">
                              <p className={`text-gray-755 leading-relaxed font-sans ${isExpanded ? 'whitespace-pre-wrap font-mono bg-gray-50 p-2.5 rounded-lg border border-gray-100' : 'line-clamp-3'}`}>
                                {item.content}
                              </p>
                              
                              {item.content.length > 250 && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpandChunk(item.chunkIndex)}
                                  className="text-indigo-600 hover:text-indigo-700 font-bold mt-1.5 block focus:outline-none transition-colors"
                                >
                                  {isExpanded ? 'Show Less ▲' : 'Show Full Content ▼'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Guidelines Sidebar */}
          <div className="space-y-6">
            <div className="p-5 bg-indigo-950 text-white rounded-2xl shadow-xl space-y-4">
              <h4 className="font-bold text-base flex items-center gap-1.5">
                <HelpCircle className="w-5 h-5 text-indigo-300" /> What is RAG?
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
