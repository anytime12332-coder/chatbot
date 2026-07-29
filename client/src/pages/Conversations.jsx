import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MessageSquare, ChevronLeft, User, Bot, Clock, Download } from 'lucide-react';
import api from '../lib/api';

export default function Conversations() {
  const { botId } = useParams();
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (botId) loadConversations();
  }, [botId, page]);

  async function loadConversations() {
    setLoading(true);
    try {
      const data = await api.get(`/chat/conversations/${botId}?page=${page}&limit=20`);
      setConversations(data.conversations);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error('Load conversations error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id) {
    try {
      const data = await api.get(`/chat/conversation/${id}`);
      setDetail(data);
      setSelected(id);
    } catch (err) {
      console.error('Load detail error:', err);
    }
  }

  function exportConversation() {
    if (!detail) return;
    const data = {
      id: detail.id,
      sessionId: detail.sessionId,
      visitor: detail.visitorName,
      pageUrl: detail.pageUrl,
      messages: detail.messages?.map(m => ({
        role: m.role, content: m.content,
        timestamp: m.createdAt, responseTimeMs: m.responseTimeMs,
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${detail.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading && conversations.length === 0) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Conversations</h2>
        <p className="text-gray-500 mt-1">View all conversations for this chatbot</p>
      </div>

      <div className="flex gap-6 h-[calc(100vh-220px)]">
        {/* List */}
        <div className={`w-full md:w-96 flex-shrink-0 card overflow-hidden flex flex-col ${selected ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">All Conversations ({conversations.length})</h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <MessageSquare className="w-10 h-10 mb-2" />
                <p>No conversations yet</p>
              </div>
            ) : (
              conversations.map(conv => (
                <button key={conv.id} onClick={() => loadDetail(conv.id)}
                  className={`w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors ${selected === conv.id ? 'bg-primary-50 border-l-2 border-l-primary-500' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">{conv.visitorName || 'Visitor'}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${conv.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{conv.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{conv.messages?.[0]?.content || 'No messages'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">{conv._count?.messages || 0} msgs</span>
                    <span className="text-xs text-gray-300">|</span>
                    <span className="text-xs text-gray-400">{new Date(conv.updatedAt).toLocaleString()}</span>
                  </div>
                </button>
              ))
            )}
          </div>
          {totalPages > 1 && (
            <div className="p-3 border-t border-gray-200 flex items-center justify-between">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="btn-secondary text-xs py-1.5 px-3">Previous</button>
              <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="btn-secondary text-xs py-1.5 px-3">Next</button>
            </div>
          )}
        </div>

        {/* Detail */}
        <div className={`flex-1 card overflow-hidden flex flex-col ${selected ? 'flex' : 'hidden md:flex'}`}>
          {detail ? (
            <>
              <div className="p-4 border-b border-gray-200 flex items-center gap-3">
                <button onClick={() => { setSelected(null); setDetail(null); }} className="md:hidden p-1 hover:bg-gray-100 rounded">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{detail.visitorName || 'Visitor'}</h3>
                  <p className="text-xs text-gray-500">Session: {detail.sessionId?.slice(0, 16)}... | {detail.pageUrl || 'No page URL'}</p>
                </div>
                <button onClick={exportConversation} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Export JSON">
                  <Download className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {detail.messages?.map(msg => (
                  <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Bot className="w-4 h-4 text-primary-600" />
                      </div>
                    )}
                    <div className={`max-w-[75%] ${msg.role === 'user' ? 'bg-primary-600 text-white rounded-2xl rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-2xl rounded-bl-sm'} px-4 py-2.5`}>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <div className={`flex items-center gap-2 mt-1 text-xs ${msg.role === 'user' ? 'text-primary-200' : 'text-gray-400'}`}>
                        <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
                        {msg.responseTimeMs > 0 && (
                          <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{msg.responseTimeMs}ms</span>
                        )}
                        {msg.tokenCount > 0 && <span>{msg.tokenCount} tokens</span>}
                      </div>
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-gray-600" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <MessageSquare className="w-12 h-12 mb-3" />
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm">Choose from the list to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
