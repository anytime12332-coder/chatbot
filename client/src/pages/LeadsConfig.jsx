import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Bot, Save, Plus, Trash2, ArrowLeft, ArrowUp, ArrowDown, Webhook, ShieldAlert, Sparkles, Check, Database, Flame, Thermometer, Snowflake } from 'lucide-react';
import api from '../lib/api';
import { useBots } from '../context/BotContext';

export default function LeadsConfig() {
  const { botId } = useParams();
  const navigate = useNavigate();
  const { loadBots } = useBots();
  
  const [config, setConfig] = useState({
    leadCollectionEnabled: false,
    leadTriggerPrompt: '',
    webhookUrl: '',
    leadStorageOption: 'both',
    leadTriggerMode: 'intent_only',
    leadTurnThreshold: 3,
    leadPhoneFormat: 'IN',
  });

  const [scoringRules, setScoringRules] = useState({
    hotKeywords: 'urgent, buy now, hire, ready to start, need quote, pricing, today, immediately, asap',
    warmKeywords: 'interested, looking for, considering, maybe, eventually, exploring options',
    coldKeywords: 'just browsing, no budget, not ready, someday, maybe later',
    additionalContext: '',
  });
  
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [message, setMessage] = useState('');
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (botId) loadConfig();
  }, [botId]);

  async function loadConfig() {
    setLoading(true);
    try {
      const data = await api.get(`/chatbots/${botId}`);
      setConfig({
        leadCollectionEnabled: data.leadCollectionEnabled ?? false,
        leadTriggerPrompt: data.leadTriggerPrompt || 'When a user asks to buy a service, get a quote, hire us, contact support, or become a lead.',
        webhookUrl: data.webhookUrl || '',
        leadStorageOption: data.leadStorageOption || 'both',
        leadTriggerMode: data.leadTriggerMode || 'intent_only',
        leadTurnThreshold: data.leadTurnThreshold ?? 3,
        leadPhoneFormat: data.leadPhoneFormat || 'IN',
      });

      // Parse scoring rules
      try {
        const parsed = JSON.parse(data.leadScoringRules || '{}');
        setScoringRules(prev => ({
          hotKeywords: parsed.hotKeywords ?? prev.hotKeywords,
          warmKeywords: parsed.warmKeywords ?? prev.warmKeywords,
          coldKeywords: parsed.coldKeywords ?? prev.coldKeywords,
          additionalContext: parsed.additionalContext ?? prev.additionalContext,
        }));
      } catch (_) {}
      
      // Parse questions
      let parsedQuestions = [];
      try {
        parsedQuestions = JSON.parse(data.leadQuestions || '[]');
      } catch (e) {
        console.error('Error parsing questions JSON:', e);
      }
      
      // Fallback defaults if empty
      if (parsedQuestions.length === 0) {
        parsedQuestions = [
          { id: 'name', label: 'Full Name', question: 'What is your name?' },
          { id: 'email', label: 'Email Address', question: 'What is your email address?' },
          { id: 'phone', label: 'Phone Number', question: 'What is your phone number?' }
        ];
      }
      setQuestions(parsedQuestions);
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
      const payload = {
        ...config,
        leadQuestions: JSON.stringify(questions),
        leadScoringRules: JSON.stringify(scoringRules),
      };
      await api.put(`/chatbots/${botId}`, payload);
      await loadBots();
      setMessage('Lead configurations saved successfully!');
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

  // Question handlers
  function handleAddQuestion() {
    const newId = `custom_${Math.random().toString(36).substr(2, 5)}`;
    setQuestions(prev => [
      ...prev,
      { id: newId, label: 'New Question', question: 'Please provide details.' }
    ]);
  }

  function handleRemoveQuestion(index) {
    setQuestions(prev => prev.filter((_, i) => i !== index));
  }

  function handleQuestionChange(index, field, value) {
    setQuestions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function moveQuestion(index, direction) {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === questions.length - 1) return;
    
    setQuestions(prev => {
      const updated = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      const temp = updated[index];
      updated[index] = updated[targetIndex];
      updated[targetIndex] = temp;
      return updated;
    });
  }

  // Test webhook
  async function handleTestWebhook() {
    if (!config.webhookUrl) {
      setTestResult({ error: 'Please enter a webhook URL first.' });
      return;
    }
    setTestingWebhook(true);
    setTestResult(null);
    try {
      const samplePayload = {
        event: 'lead.test',
        chatbotId: botId,
        chatbotName: 'Test Chatbot',
        details: {
          name: 'John Doe Test',
          email: 'test@example.com',
          phone: '+1 (555) 0199',
          company: 'Acme Test Corp'
        },
        createdAt: new Date().toISOString()
      };
      
      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(samplePayload)
      });
      
      if (response.ok) {
        setTestResult({ success: true, status: response.status });
      } else {
        setTestResult({ error: `Received error status: ${response.status}` });
      }
    } catch (err) {
      setTestResult({ error: `Webhook request failed: ${err.message}` });
    } finally {
      setTestingWebhook(false);
    }
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
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/bot/${botId}/leads`)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Lead Capture Settings</h2>
          <p className="text-gray-500 mt-0.5">Configure how the AI detects, collects, and stores leads</p>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm border ${message.startsWith('Error') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Toggle Lead Capture */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <Sparkles className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Enable Lead Capture</h3>
                <p className="text-sm text-gray-500 mt-0.5">Allow the AI to automatically identify leads and collect contact information</p>
              </div>
            </div>
            <button type="button" onClick={() => updateField('leadCollectionEnabled', !config.leadCollectionEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.leadCollectionEnabled ? 'bg-primary-600' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.leadCollectionEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        {config.leadCollectionEnabled && (
          <>
            {/* Trigger Instructions */}
            <div className="card space-y-4">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary-600" />
                <h3 className="text-lg font-semibold text-gray-900">Lead Trigger Configuration</h3>
              </div>
              <p className="text-sm text-gray-500">
                Configure how and when the chatbot should start asking the qualification questions.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Trigger Mode</label>
                  <select
                    value={config.leadTriggerMode}
                    onChange={e => updateField('leadTriggerMode', e.target.value)}
                    className="input-field text-sm"
                  >
                    <option value="intent_only">Buying Intent Detection (AI Classifier)</option>
                    <option value="turn_threshold">Turn Threshold (Trigger after N messages)</option>
                    <option value="manual_only">Manual Only (Trigger from Inbox by staff)</option>
                  </select>
                </div>

                {config.leadTriggerMode === 'turn_threshold' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Turn Threshold (N messages)</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={config.leadTurnThreshold}
                      onChange={e => updateField('leadTurnThreshold', parseInt(e.target.value) || 3)}
                      className="input-field text-sm"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number Country Format</label>
                  <select
                    value={config.leadPhoneFormat}
                    onChange={e => updateField('leadPhoneFormat', e.target.value)}
                    className="input-field text-sm"
                  >
                    <option value="IN">Indian Mobile (10-digit, starting 6-9)</option>
                    <option value="US">US Phone (10-digit)</option>
                    <option value="ALL">Generic / International (7-15 digits)</option>
                  </select>
                </div>
              </div>

              {config.leadTriggerMode === 'intent_only' && (
                <div className="pt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Trigger Description / Instructions</label>
                  <textarea
                    value={config.leadTriggerPrompt}
                    onChange={e => updateField('leadTriggerPrompt', e.target.value)}
                    className="input-field min-h-[100px]"
                    placeholder="e.g., When the customer expresses interest in hiring services, buying products, requesting a quote, pricing info, or scheduling a demo."
                    rows={3}
                    required
                  />
                </div>
              )}
            </div>

            {/* Questions list */}
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Information to Collect</h3>
                </div>
                <button type="button" onClick={handleAddQuestion} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3">
                  <Plus className="w-3.5 h-3.5" /> Add Field
                </button>
              </div>
              <p className="text-sm text-gray-500">
                Set up the questions asked to the user one-by-one. You can customize the field key, database label, and actual question prompt.
              </p>

              <div className="space-y-3">
                {questions.map((q, idx) => (
                  <div key={q.id} className="flex flex-col md:flex-row items-stretch md:items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl relative group">
                    <div className="flex items-center gap-1.5 border-r border-gray-200 pr-2">
                      <button type="button" onClick={() => moveQuestion(idx, 'up')} disabled={idx === 0}
                        className="p-1 hover:bg-gray-200 disabled:opacity-30 rounded text-gray-500">
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => moveQuestion(idx, 'down')} disabled={idx === questions.length - 1}
                        className="p-1 hover:bg-gray-200 disabled:opacity-30 rounded text-gray-500">
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 flex-1">
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Field ID / Key</label>
                        <input
                          type="text"
                          value={q.id}
                          onChange={e => handleQuestionChange(idx, 'id', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                          className="input-field text-xs font-mono py-1.5"
                          placeholder="e.g. name"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Database Label</label>
                        <input
                          type="text"
                          value={q.label}
                          onChange={e => handleQuestionChange(idx, 'label', e.target.value)}
                          className="input-field text-xs py-1.5"
                          placeholder="e.g. Full Name"
                          required
                        />
                      </div>
                      <div className="sm:col-span-2 lg:col-span-1">
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Chatbot Question Prompt</label>
                        <input
                          type="text"
                          value={q.question}
                          onChange={e => handleQuestionChange(idx, 'question', e.target.value)}
                          className="input-field text-xs py-1.5"
                          placeholder="e.g. What is your name?"
                          required
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(idx)}
                      disabled={questions.length <= 1}
                      className="p-2 text-red-500 hover:bg-red-50 disabled:opacity-30 rounded-lg transition-colors self-end md:self-center"
                    >
                      <Trash2 className="w-4.5 h-4.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Storage Settings */}
            <div className="card space-y-4">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-primary-600" />
                <h3 className="text-lg font-semibold text-gray-900">Dashboard Layout & Storage</h3>
              </div>
              <p className="text-sm text-gray-500">Choose how lead records are structured in the administration panel</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className={`p-4 border rounded-xl cursor-pointer flex items-start gap-3 transition-all ${config.leadStorageOption === 'inbox' ? 'border-primary-500 bg-primary-50/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input
                    type="radio"
                    name="leadStorageOption"
                    value="inbox"
                    checked={config.leadStorageOption === 'inbox'}
                    onChange={() => updateField('leadStorageOption', 'inbox')}
                    className="mt-1 accent-primary-600"
                  />
                  <div>
                    <span className="block font-semibold text-gray-900 text-sm">Option 1: Inbox Integration Only</span>
                    <span className="block text-xs text-gray-500 mt-1">Lead data is displayed inline inside conversation history. Best for simple chat tracking.</span>
                  </div>
                </label>
                
                <label className={`p-4 border rounded-xl cursor-pointer flex items-start gap-3 transition-all ${config.leadStorageOption === 'both' ? 'border-primary-500 bg-primary-50/50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input
                    type="radio"
                    name="leadStorageOption"
                    value="both"
                    checked={config.leadStorageOption === 'both'}
                    onChange={() => updateField('leadStorageOption', 'both')}
                    className="mt-1 accent-primary-600"
                  />
                  <div>
                    <span className="block font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                      Option 2: Dedicated Leads & Inbox <span className="text-[10px] bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded font-bold">Recommended</span>
                    </span>
                    <span className="block text-xs text-gray-500 mt-1">Creates a separate Leads section with spreadsheet views, export utilities, and integrates detail panels inside Conversations.</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Webhook Settings */}
            <div className="card space-y-4">
              <div className="flex items-center gap-2">
                <Webhook className="w-5 h-5 text-primary-600" />
                <h3 className="text-lg font-semibold text-gray-900">Webhook Integration (n8n, Make)</h3>
              </div>
              <p className="text-sm text-gray-500">
                Send lead payloads to external webhook triggers. Enter your n8n or Make webhook URL.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Webhook URL</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={config.webhookUrl}
                      onChange={e => updateField('webhookUrl', e.target.value)}
                      className="input-field flex-1"
                      placeholder="https://primary-n8n.mybrand.com/webhook/..."
                    />
                    <button
                      type="button"
                      onClick={handleTestWebhook}
                      disabled={testingWebhook || !config.webhookUrl}
                      className="btn-secondary whitespace-nowrap flex items-center gap-1.5 py-2 px-4"
                    >
                      {testingWebhook ? 'Testing...' : 'Send Test'}
                    </button>
                  </div>
                </div>

                {testResult && (
                  <div className={`p-3 rounded-lg text-xs flex items-center gap-2 border ${testResult.success ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                    {testResult.success ? (
                      <>
                        <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <span>Test successful! Webhook returned status code: <strong>{testResult.status}</strong></span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
                        <span>Webhook test failed: {testResult.error}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            {/* Lead Scoring Rules */}
            <div className="card space-y-5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary-600" />
                <h3 className="text-lg font-semibold text-gray-900">Lead Scoring Rules</h3>
              </div>
              <p className="text-sm text-gray-500">
                Define keywords and phrases that classify leads as <span className="font-semibold text-red-600">Hot</span>, <span className="font-semibold text-amber-600">Warm</span>, or <span className="font-semibold text-blue-600">Cold</span>. The AI uses these as scoring signals alongside full conversation context.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Hot */}
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl space-y-2">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-red-500" />
                    <span className="text-sm font-bold text-red-700">Hot Lead Keywords</span>
                  </div>
                  <p className="text-[11px] text-red-500">Signals high purchase intent — ready to buy or start immediately.</p>
                  <textarea
                    value={scoringRules.hotKeywords}
                    onChange={e => setScoringRules(prev => ({ ...prev, hotKeywords: e.target.value }))}
                    rows={4}
                    className="w-full text-xs border border-red-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                    placeholder="urgent, buy now, hire, ready to start..."
                  />
                  <p className="text-[10px] text-red-400">Comma-separated list of words/phrases</p>
                </div>

                {/* Warm */}
                <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl space-y-2">
                  <div className="flex items-center gap-2">
                    <Thermometer className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-bold text-amber-700">Warm Lead Keywords</span>
                  </div>
                  <p className="text-[11px] text-amber-500">Signals moderate interest — exploring options, not yet committed.</p>
                  <textarea
                    value={scoringRules.warmKeywords}
                    onChange={e => setScoringRules(prev => ({ ...prev, warmKeywords: e.target.value }))}
                    rows={4}
                    className="w-full text-xs border border-amber-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                    placeholder="interested, looking for, considering..."
                  />
                  <p className="text-[10px] text-amber-400">Comma-separated list of words/phrases</p>
                </div>

                {/* Cold */}
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
                  <div className="flex items-center gap-2">
                    <Snowflake className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-bold text-blue-700">Cold Lead Keywords</span>
                  </div>
                  <p className="text-[11px] text-blue-500">Signals low intent — browsing only or not ready to purchase.</p>
                  <textarea
                    value={scoringRules.coldKeywords}
                    onChange={e => setScoringRules(prev => ({ ...prev, coldKeywords: e.target.value }))}
                    rows={4}
                    className="w-full text-xs border border-blue-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                    placeholder="just browsing, no budget, not ready..."
                  />
                  <p className="text-[10px] text-blue-400">Comma-separated list of words/phrases</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Additional Scoring Instructions (optional)</label>
                <textarea
                  value={scoringRules.additionalContext}
                  onChange={e => setScoringRules(prev => ({ ...prev, additionalContext: e.target.value }))}
                  rows={2}
                  className="input-field text-sm"
                  placeholder="e.g. Also consider leads hot if they mention a specific product SKU or mention a deadline date."
                />
                <p className="text-xs text-gray-400 mt-1">Free-form guidance passed to the AI scoring system for edge cases.</p>
              </div>

              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-start gap-2.5">
                <Check className="w-4 h-4 text-primary-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-600">
                  Lead scores (<span className="font-semibold text-red-600">Hot</span> / <span className="font-semibold text-amber-600">Warm</span> / <span className="font-semibold text-blue-600">Cold</span>) are shown in the Leads database, visible in the detail panel, and included in webhook payloads. Scoring runs automatically after each lead confirmation.
                </p>
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 py-2 px-5 font-medium">
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </form>
    </div>
  );
}
