import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mic, Save, TestTube, CheckCircle2, XCircle, Sparkles, Volume2, ShieldAlert, Cpu, Radio, RefreshCw, Zap } from 'lucide-react';
import api from '../lib/api';

export default function VoiceConfig() {
  const { botId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [testResult, setTestResult] = useState(null);

  const [config, setConfig] = useState({
    enabled: false,
    provider: 'browser', // 'browser' | 'deepgram' | 'whisper'
    apiKey: '',
    model: 'nova-2',
    autoSend: false,
    language: 'en-US',
  });

  // Live Test Bench state
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const recognitionRef = useRef(null);
  const animFrameRef = useRef(null);

  useEffect(() => {
    if (botId) loadConfig();
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [botId]);

  async function loadConfig() {
    setLoading(true);
    try {
      const data = await api.get(`/voice/${botId}`);
      setConfig({
        enabled: data.enabled ?? false,
        provider: data.provider || 'browser',
        apiKey: data.apiKey || '',
        model: data.model || 'nova-2',
        autoSend: data.autoSend ?? false,
        language: data.language || 'en-US',
      });
    } catch (err) {
      console.error('Load voice config error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e) {
    if (e) e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.put(`/voice/${botId}`, config);
      setMessage('Voice input configuration saved successfully!');
      setTimeout(() => setMessage(''), 3500);
      loadConfig();
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
      const res = await api.post(`/voice/${botId}/test`, {
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model,
      });
      setTestResult(res);
    } catch (err) {
      setTestResult({ success: false, error: err.message || 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  }

  function updateField(field, value) {
    setConfig(prev => ({ ...prev, [field]: value }));
  }

  // Live microphone recording test bench
  function toggleMicrophoneTest() {
    if (isRecording) {
      stopRecordingTest();
    } else {
      startRecordingTest();
    }
  }

  function startRecordingTest() {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      alert('Browser Web Speech API is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = config.language || 'en-US';

    rec.onstart = () => {
      setIsRecording(true);
      setLiveTranscript('Listening to your speech...');
      simulateAudioVisualizer();
    };

    rec.onresult = (event) => {
      let currentText = '';
      for (let i = 0; i < event.results.length; i++) {
        currentText += event.results[i][0].transcript;
      }
      setLiveTranscript(currentText || 'Listening...');
    };

    rec.onerror = (event) => {
      console.warn('Speech test error:', event.error);
      stopRecordingTest();
      setLiveTranscript(`Recording stopped: ${event.error}`);
    };

    rec.onend = () => {
      stopRecordingTest();
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (e) {
      console.error('Failed to start speech test:', e);
    }
  }

  function stopRecordingTest() {
    setIsRecording(false);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    setAudioLevel(0);
  }

  function simulateAudioVisualizer() {
    const loop = () => {
      setAudioLevel(Math.floor(Math.random() * 70) + 30);
      animFrameRef.current = requestAnimationFrame(loop);
    };
    loop();
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
        <h2 className="text-2xl font-bold text-gray-900">Voice Input Settings</h2>
        <p className="text-gray-500 mt-0.5">Enable hands-free speech-to-text input on the chatbot widget</p>
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-sm border ${message.startsWith('Error') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Enable Voice Input Toggle */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                <Mic className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Enable Voice Input</h3>
                <p className="text-sm text-gray-500 mt-0.5">Displays a microphone button inside the chatbot widget input bar for speech recognition</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => updateField('enabled', !config.enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.enabled ? 'bg-primary-600' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        {/* Provider Selection */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">Voice Provider Selection</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Web Speech API */}
            <button
              type="button"
              onClick={() => updateField('provider', 'browser')}
              className={`p-5 rounded-2xl border-2 text-left transition-all ${config.provider === 'browser' ? 'border-primary-500 bg-primary-50/50 shadow-md' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">🌐</span>
                {config.provider === 'browser' && <CheckCircle2 className="w-5 h-5 text-primary-600" />}
              </div>
              <h4 className="font-bold text-gray-900 text-sm">Browser Web Speech API</h4>
              <p className="text-xs text-gray-500 mt-1">Built-in browser recognition (Chrome, Edge, Safari). Zero API key required, instant response.</p>
              <span className="inline-block mt-3 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded">Free & Built-in</span>
            </button>

            {/* Deepgram STT */}
            <button
              type="button"
              onClick={() => updateField('provider', 'deepgram')}
              className={`p-5 rounded-2xl border-2 text-left transition-all ${config.provider === 'deepgram' ? 'border-primary-500 bg-primary-50/50 shadow-md' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">⚡</span>
                {config.provider === 'deepgram' && <CheckCircle2 className="w-5 h-5 text-primary-600" />}
              </div>
              <h4 className="font-bold text-gray-900 text-sm">Deepgram Nova-2</h4>
              <p className="text-xs text-gray-500 mt-1">High-accuracy, enterprise speech-to-text API. Supports Deepgram API keys and custom models.</p>
              <span className="inline-block mt-3 px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded">Enterprise Grade</span>
            </button>

            {/* OpenAI Whisper */}
            <button
              type="button"
              onClick={() => updateField('provider', 'whisper')}
              className={`p-5 rounded-2xl border-2 text-left transition-all ${config.provider === 'whisper' ? 'border-primary-500 bg-primary-50/50 shadow-md' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">🤖</span>
                {config.provider === 'whisper' && <CheckCircle2 className="w-5 h-5 text-primary-600" />}
              </div>
              <h4 className="font-bold text-gray-900 text-sm">OpenAI Whisper</h4>
              <p className="text-xs text-gray-500 mt-1">Industry-standard multi-lingual voice transcription using your OpenAI API key.</p>
              <span className="inline-block mt-3 px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded">Multi-lingual</span>
            </button>
          </div>
        </div>

        {/* API Credentials & Parameters */}
        {config.provider !== 'browser' && (
          <div className="card space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary-600" />
              <h3 className="text-lg font-semibold text-gray-900">{config.provider === 'deepgram' ? 'Deepgram' : 'OpenAI Whisper'} Configuration</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">API Key</label>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={e => updateField('apiKey', e.target.value)}
                  placeholder={config.provider === 'deepgram' ? 'Deepgram API Key...' : 'sk-...'}
                  className="input-field font-mono text-sm"
                />
                <p className="text-[11px] text-gray-400 mt-1">🔒 Key is stored with AES-256 encryption</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Model</label>
                {config.provider === 'deepgram' ? (
                  <select value={config.model} onChange={e => updateField('model', e.target.value)} className="input-field text-sm">
                    <option value="nova-2">Deepgram Nova-2 (General)</option>
                    <option value="nova-2-medical">Deepgram Nova-2 (Medical)</option>
                    <option value="nova-2-finance">Deepgram Nova-2 (Finance)</option>
                    <option value="enhanced">Deepgram Enhanced</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={config.model}
                    onChange={e => updateField('model', e.target.value)}
                    className="input-field text-sm"
                    placeholder="whisper-1"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Behavior & Language */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">Voice Recognition Behavior</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Recognition Language</label>
              <select value={config.language} onChange={e => updateField('language', e.target.value)} className="input-field text-sm">
                <option value="en-US">English (US)</option>
                <option value="en-IN">English (India)</option>
                <option value="hi-IN">Hindi (India)</option>
                <option value="es-ES">Spanish (Spain)</option>
                <option value="fr-FR">French (France)</option>
                <option value="de-DE">German (Germany)</option>
              </select>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl">
              <div>
                <span className="font-semibold text-gray-900 text-sm">Auto-Send on Silence</span>
                <p className="text-xs text-gray-500 mt-0.5">Automatically send the transcribed message as soon as user stops speaking</p>
              </div>
              <button
                type="button"
                onClick={() => updateField('autoSend', !config.autoSend)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.autoSend ? 'bg-primary-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.autoSend ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Live Audio Test Bench */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-primary-600" />
              <h3 className="text-lg font-semibold text-gray-900">Live Microphone Test Bench</h3>
            </div>
            <span className="text-xs font-semibold bg-primary-100 text-primary-700 px-2.5 py-1 rounded-full">Interactive Preview</span>
          </div>
          <p className="text-sm text-gray-500">Test microphone speech-to-text capture and verify speech transcription accuracy.</p>

          <div className="p-6 bg-slate-900 text-white rounded-2xl space-y-4 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <button
                type="button"
                onClick={toggleMicrophoneTest}
                className={`px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 text-sm transition-all ${isRecording ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' : 'bg-primary-600 hover:bg-primary-500 text-white'}`}
              >
                <Mic className="w-4 h-4" />
                {isRecording ? 'Stop Recording' : 'Start Speech Test'}
              </button>

              {isRecording && (
                <div className="flex items-center gap-1.5">
                  {[...Array(8)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1.5 bg-primary-400 rounded-full transition-all duration-75"
                      style={{ height: `${Math.max(6, (audioLevel * (i % 3 + 1)) % 32)}px` }}
                    />
                  ))}
                  <span className="text-xs text-primary-400 font-mono ml-2 animate-pulse">LIVE AUDIO</span>
                </div>
              )}
            </div>

            <div className="min-h-[70px] p-3 bg-slate-800/80 rounded-xl border border-slate-700/60 font-mono text-sm text-slate-200">
              {liveTranscript || <span className="text-slate-500 italic">Click "Start Speech Test" and speak into your microphone...</span>}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className="btn-secondary flex items-center justify-center gap-2"
          >
            <TestTube className="w-4 h-4" />
            {testing ? 'Testing Connection...' : 'Test Provider Connection'}
          </button>

          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex items-center justify-center gap-2 px-6"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Voice Configuration'}
          </button>
        </div>

        {/* Test Result Box */}
        {testResult && (
          <div className={`p-4 rounded-xl border flex items-start gap-3 ${testResult.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {testResult.success ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold text-sm">{testResult.success ? 'Connection Success!' : 'Connection Failed'}</p>
              <p className="text-xs mt-0.5">{testResult.message || testResult.error}</p>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
