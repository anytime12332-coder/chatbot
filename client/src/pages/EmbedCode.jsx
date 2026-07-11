import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Code, Copy, Check, Globe, Terminal } from 'lucide-react';
import api from '../lib/api';

export default function EmbedCode() {
  const { botId } = useParams();
  const [botConfig, setBotConfig] = useState(null);
  const [copied, setCopied] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('curl');

  useEffect(() => {
    if (botId) loadConfig();
  }, [botId]);

  async function loadConfig() {
    try {
      const data = await api.get(`/chatbots/${botId}`);
      setBotConfig(data);
    } catch (err) {
      console.error('Load config error:', err);
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text, id) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" /></div>;
  }

  const serverUrl = window.location.origin;
  const currentBotId = botConfig?.id || botId;

  const embedScript = `<script src="${serverUrl}/widget/embed.js" data-chatbot-id="${currentBotId}"></script>`;

  const apiExamples = {
    curl: `curl -X POST ${serverUrl}/api/chat/message \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "Hello, I need help!",
    "botId": "${currentBotId}",
    "sessionId": "unique-session-id"
  }'`,
    javascript: `// Non-streaming
const response = await fetch('${serverUrl}/api/chat/message', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Hello, I need help!',
    botId: '${currentBotId}',
    sessionId: 'unique-session-id',
  }),
});
const data = await response.json();
console.log(data.reply);

// Streaming (SSE)
const streamRes = await fetch('${serverUrl}/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Hello!',
    botId: '${currentBotId}',
    sessionId: 'unique-session-id',
  }),
});
const reader = streamRes.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const lines = decoder.decode(value).split('\\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const data = JSON.parse(line.slice(6));
    if (data.type === 'chunk') process.stdout.write(data.content);
  }
}`,
    python: `import requests

# Non-streaming
response = requests.post(
    '${serverUrl}/api/chat/message',
    json={
        'message': 'Hello, I need help!',
        'botId': '${currentBotId}',
        'sessionId': 'unique-session-id',
    }
)
data = response.json()
print(data['reply'])

# Streaming
import sseclient
response = requests.post(
    '${serverUrl}/api/chat/stream',
    json={'message': 'Hello!', 'botId': '${currentBotId}'},
    stream=True
)
for event in sseclient.SSEClient(response).events():
    import json
    data = json.loads(event.data)
    if data['type'] == 'chunk':
        print(data['content'], end='', flush=True)`,
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Embed & API</h2>
        <p className="text-gray-500 mt-1">Add this chatbot to your website or use the API</p>
      </div>

      {/* Bot ID */}
      <div className="card border-primary-200 bg-primary-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-primary-700">Bot ID for "{botConfig?.name}"</p>
            <code className="text-lg font-mono text-primary-900">{currentBotId}</code>
          </div>
          <button onClick={() => copyToClipboard(currentBotId, 'botid')} className="p-2 hover:bg-primary-100 rounded-lg transition-colors">
            {copied === 'botid' ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5 text-primary-600" />}
          </button>
        </div>
      </div>

      {/* Embed Code */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Code className="w-5 h-5 text-primary-600" />
          <h3 className="text-lg font-semibold text-gray-900">Embed Widget</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Copy this code into your website's HTML before the closing <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">&lt;/body&gt;</code> tag. Each chatbot gets its own unique embed code.
        </p>
        <div className="relative">
          <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-x-auto"><code>{embedScript}</code></pre>
          <button onClick={() => copyToClipboard(embedScript, 'embed')} className="absolute top-3 right-3 p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">
            {copied === 'embed' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-gray-300" />}
          </button>
        </div>
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700"><strong>Streaming enabled!</strong> The widget automatically streams AI responses word-by-word for a premium chat experience.</p>
        </div>
      </div>

      {/* API Section */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Terminal className="w-5 h-5 text-primary-600" />
          <h3 className="text-lg font-semibold text-gray-900">Chat API</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">Two endpoints available: standard (JSON response) and streaming (SSE).</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-xs font-medium text-gray-500 mb-1">Standard</p>
            <code className="text-sm text-primary-600">POST /api/chat/message</code>
          </div>
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-xs font-medium text-gray-500 mb-1">Streaming (SSE)</p>
            <code className="text-sm text-primary-600">POST /api/chat/stream</code>
          </div>
        </div>

        {/* Request body table */}
        <div className="mb-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Request Body</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 font-medium text-gray-700">Field</th>
                <th className="text-left py-2 pr-4 font-medium text-gray-700">Type</th>
                <th className="text-left py-2 pr-4 font-medium text-gray-700">Required</th>
                <th className="text-left py-2 font-medium text-gray-700">Description</th>
              </tr></thead>
              <tbody className="text-gray-600">
                <tr className="border-b border-gray-100"><td className="py-2 pr-4"><code>message</code></td><td className="py-2 pr-4">string</td><td className="py-2 pr-4">Yes</td><td className="py-2">The user's message</td></tr>
                <tr className="border-b border-gray-100"><td className="py-2 pr-4"><code>botId</code></td><td className="py-2 pr-4">string</td><td className="py-2 pr-4">Yes</td><td className="py-2">The chatbot ID</td></tr>
                <tr className="border-b border-gray-100"><td className="py-2 pr-4"><code>sessionId</code></td><td className="py-2 pr-4">string</td><td className="py-2 pr-4">No</td><td className="py-2">Session ID for conversation continuity</td></tr>
                <tr><td className="py-2 pr-4"><code>pageUrl</code></td><td className="py-2 pr-4">string</td><td className="py-2 pr-4">No</td><td className="py-2">URL of the page</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Code examples */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Examples</p>
          <div className="flex gap-1 mb-3">
            {Object.keys(apiExamples).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${activeTab === tab ? 'bg-primary-100 text-primary-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          <div className="relative">
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-x-auto"><code>{apiExamples[activeTab]}</code></pre>
            <button onClick={() => copyToClipboard(apiExamples[activeTab], activeTab)} className="absolute top-3 right-3 p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">
              {copied === activeTab ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-gray-300" />}
            </button>
          </div>
        </div>
      </div>

      {/* Streaming response format */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-5 h-5 text-primary-600" />
          <h3 className="text-lg font-semibold text-gray-900">Response Formats</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Standard Response</p>
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-x-auto"><code>{JSON.stringify({ reply: "Hello! How can I help?", sessionId: "sess_abc123", messageId: "msg_xyz", conversationId: "conv_def" }, null, 2)}</code></pre>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Streaming Events (SSE)</p>
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-x-auto"><code>{`data: {"type":"start","sessionId":"..."}
data: {"type":"chunk","content":"Hello"}
data: {"type":"chunk","content":" there"}
data: {"type":"chunk","content":"!"}
data: {"type":"done","messageId":"..."}`}</code></pre>
          </div>
        </div>
      </div>
    </div>
  );
}
