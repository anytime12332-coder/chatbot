import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MessageSquare, ChevronLeft, User, Bot, Clock, Download, Users, Webhook, Check, ShieldAlert, Edit, Save, X, RefreshCw, Plus } from 'lucide-react';
import api from '../lib/api';

export default function Conversations() {
  const { botId } = useParams();
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Lead panel states
  const [leadForm, setLeadForm] = useState({});
  const [isEditingLead, setIsEditingLead] = useState(false);
  const [isCreatingLead, setIsCreatingLead] = useState(false);
  const [savingLead, setSavingLead] = useState(false);
  const [retryingWebhook, setRetryingWebhook] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState(null);

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
      setIsEditingLead(false);
      setIsCreatingLead(false);
      setWebhookStatus(null);
      
      // Initialize lead form
      if (data.lead) {
        try {
          setLeadForm(JSON.parse(data.lead.details || '{}'));
        } catch (e) {
          setLeadForm({});
        }
      } else {
        // Pre-fill fields with standard blanks based on chatbot configured questions
        let questions = [];
        try {
          questions = JSON.parse(data.chatbot?.leadQuestions || '[]');
        } catch (e) {}
        const initialForm = {};
        questions.forEach(q => {
          initialForm[q.id || q.label] = '';
        });
        setLeadForm(initialForm);
      }
    } catch (err) {
      console.error('Load detail error:', err);
    }
  }

  async function handleSaveLead(e) {
    e.preventDefault();
    setSavingLead(true);
    try {
      if (detail.lead) {
        // Edit existing lead
        const res = await api.put(`/leads/${botId}/${detail.lead.id}`, { details: leadForm });
        setDetail(prev => ({ ...prev, lead: res }));
        setIsEditingLead(false);
      } else {
        // Create new lead manually
        const res = await api.post(`/leads/${botId}`, {
          conversationId: detail.id,
          details: leadForm
        });
        setDetail(prev => ({ ...prev, lead: res }));
        setIsCreatingLead(false);
        // Refresh conversation list to update badges
        loadConversations();
      }
    } catch (err) {
      alert('Failed to save lead: ' + err.message);
    } finally {
      setSavingLead(false);
    }
  }

  async function handleRetryWebhook() {
    if (!detail?.lead) return;
    setRetryingWebhook(true);
    setWebhookStatus(null);
    try {
      const res = await api.post(`/leads/${botId}/${detail.lead.id}/webhook`);
      setWebhookStatus({ success: true, message: `Webhook sent! Status: ${res.status}` });
    } catch (err) {
      setWebhookStatus({ error: true, message: err.message });
    } finally {
      setRetryingWebhook(false);
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

  // Helper to parse lead JSON details safely
  function getLeadDetails() {
    if (!detail?.lead) return {};
    try {
      return JSON.parse(detail.lead.details || '{}');
    } catch(e) {
      return {};
    }
  }

  // Get question definitions
  function getQuestions() {
    try {
      return JSON.parse(detail?.chatbot?.leadQuestions || '[]');
    } catch (e) {
      return [];
    }
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
                    <span className="text-sm font-medium text-gray-900 truncate max-w-[150px]">{conv.visitorName || 'Visitor'}</span>
                    <div className="flex items-center gap-1.5">
                      {conv.leadStatus === 'completed' && (
                        <span className="text-[10px] px-2 py-0.5 bg-indigo-100 text-indigo-700 font-bold rounded-full">Lead</span>
                      )}
                      {conv.leadStatus === 'collecting' && (
                        <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 font-bold rounded-full">Collecting</span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${conv.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{conv.status}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{conv.messages?.[0]?.content || 'No messages'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">{conv._count?.messages || 0} msgs</span>
                    <span className="text-xs text-gray-300">|</span>
                    <span className="text-xs text-gray-400">{new Date(conv.updatedAt).toLocaleDateString()}</span>
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

        {/* Detail (Chat View + Lead Details View split) */}
        <div className={`flex-1 card overflow-hidden flex flex-col ${selected ? 'flex' : 'hidden md:flex'}`}>
          {detail ? (
            <div className="flex-1 flex overflow-hidden h-full">
              {/* Chat panel */}
              <div className="flex-1 flex flex-col h-full min-w-0 border-r border-gray-100">
                <div className="p-4 border-b border-gray-200 flex items-center gap-3">
                  <button onClick={() => { setSelected(null); setDetail(null); }} className="md:hidden p-1 hover:bg-gray-100 rounded">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{detail.visitorName || 'Visitor'}</h3>
                    <p className="text-xs text-gray-500 truncate">Session: {detail.sessionId?.slice(0, 12)}... | {detail.pageUrl || 'No page URL'}</p>
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
              </div>

              {/* Lead detail panel (right side) */}
              <div className="w-80 flex-shrink-0 bg-gray-50/50 flex flex-col h-full border-l border-gray-100 overflow-y-auto p-4 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-1.5 text-sm">
                    <Users className="w-4 h-4 text-indigo-600" /> Lead Information
                  </h4>
                  {!detail.lead && !isCreatingLead && (
                    <button
                      onClick={() => setIsCreatingLead(true)}
                      className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-0.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> Create
                    </button>
                  )}
                </div>

                {/* Edit Form */}
                {(isEditingLead || isCreatingLead) ? (
                  <form onSubmit={handleSaveLead} className="space-y-4 bg-white p-4 border border-gray-200 rounded-xl">
                    <h5 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                      {isEditingLead ? 'Edit Lead details' : 'Convert to Lead'}
                    </h5>
                    
                    <div className="space-y-3">
                      {getQuestions().map(q => (
                        <div key={q.id}>
                          <label className="block text-xs font-medium text-gray-700 mb-1">{q.label}</label>
                          <input
                            type="text"
                            value={leadForm[q.id || q.label] || ''}
                            onChange={e => setLeadForm(prev => ({ ...prev, [q.id || q.label]: e.target.value }))}
                            className="input-field text-xs py-1.5 px-2.5"
                            placeholder={`Enter ${q.label}`}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                      <button
                        type="submit"
                        disabled={savingLead}
                        className="btn-primary flex-1 flex items-center justify-center gap-1 text-xs py-1.5 px-3"
                      >
                        <Save className="w-3.5 h-3.5" /> {savingLead ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsEditingLead(false); setIsCreatingLead(false); }}
                        className="btn-secondary flex-1 text-xs py-1.5 px-3"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : detail.lead ? (
                  /* Display Captured Lead details */
                  <div className="space-y-4">
                    <div className="bg-white p-4 border border-gray-200 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">Captured Lead</span>
                        <button
                          onClick={() => {
                            try {
                              setLeadForm(JSON.parse(detail.lead.details || '{}'));
                            } catch(e) {}
                            setIsEditingLead(true);
                          }}
                          className="p-1 hover:bg-gray-100 text-gray-500 rounded"
                          title="Edit details"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="divide-y divide-gray-100 text-xs">
                        {Object.entries(getLeadDetails()).map(([key, val]) => (
                          <div key={key} className="py-2 flex flex-col gap-0.5">
                            <span className="text-[10px] font-medium text-gray-400 capitalize">{key.replace(/_/g, ' ')}</span>
                            <span className="font-semibold text-gray-800 break-words">{String(val)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Webhook Resender */}
                    {detail.chatbot?.webhookUrl && (
                      <div className="p-3 border border-indigo-100 bg-indigo-50/30 rounded-xl space-y-2">
                        <div className="flex items-start gap-2">
                          <Webhook className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <h6 className="text-xs font-bold text-indigo-900">Webhook Integration</h6>
                            <p className="text-[10px] text-indigo-700">Forward lead profile details to n8n webhook</p>
                          </div>
                        </div>
                        <button
                          onClick={handleRetryWebhook}
                          disabled={retryingWebhook}
                          className="w-full bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-semibold text-[10px] py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3 h-3 ${retryingWebhook ? 'animate-spin' : ''}`} />
                          {retryingWebhook ? 'Sending...' : 'Resend Webhook'}
                        </button>
                        {webhookStatus && (
                          <p className={`text-[9px] p-1.5 rounded font-medium border ${webhookStatus.success ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                            {webhookStatus.message}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Empty state lead capture */
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4 bg-white border border-dashed border-gray-200 rounded-xl h-48">
                    <Users className="w-8 h-8 text-gray-300 mb-2" />
                    <h5 className="font-semibold text-gray-700 text-xs">No lead data</h5>
                    <p className="text-[10px] text-gray-400 mt-1 max-w-[160px]">This conversation has not been converted into a lead profile.</p>
                    <button
                      onClick={() => setIsCreatingLead(true)}
                      className="mt-3 text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 py-1.5 px-3 rounded-lg font-semibold flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Convert to Lead
                    </button>
                  </div>
                )}
              </div>
            </div>
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
