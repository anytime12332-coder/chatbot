import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, Search, Download, Trash2, Settings, MessageSquare, ExternalLink, Calendar, Mail, Phone, Webhook, X, RefreshCw, Flame, Thermometer, Snowflake } from 'lucide-react';
import api from '../lib/api';

export default function Leads() {
  const { botId } = useParams();
  const navigate = useNavigate();
  
  const [leads, setLeads] = useState([]);
  const [chatbot, setChatbot] = useState(null);
  const [stats, setStats] = useState({ totalLeads: 0, todayLeads: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedLead, setSelectedLead] = useState(null);
  const [retryingWebhook, setRetryingWebhook] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (botId) {
      loadLeads();
      loadChatbotInfo();
    }
  }, [botId, page, search]);

  async function loadChatbotInfo() {
    try {
      const bot = await api.get(`/chatbots/${botId}`);
      setChatbot(bot);
      const s = await api.get(`/dashboard/stats/${botId}`);
      setStats({
        totalLeads: s.totalLeads || 0,
        todayLeads: s.todayLeads || 0,
      });
    } catch (err) {
      console.error('Error fetching chatbot info:', err);
    }
  }

  async function loadLeads() {
    setLoading(true);
    try {
      const data = await api.get(`/leads/${botId}?page=${page}&limit=20&search=${search}`);
      setLeads(data.leads);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error('Error loading leads:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteLead(leadId) {
    if (!window.confirm('Are you sure you want to delete this lead? This will not delete the conversation.')) return;
    setDeletingId(leadId);
    try {
      await api.delete(`/leads/${botId}/${leadId}`);
      setLeads(prev => prev.filter(l => l.id !== leadId));
      setStats(prev => ({ ...prev, totalLeads: Math.max(0, prev.totalLeads - 1) }));
      if (selectedLead?.id === leadId) setSelectedLead(null);
    } catch (err) {
      alert('Delete failed: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRetryWebhook(leadId) {
    setRetryingWebhook(true);
    setWebhookStatus(null);
    try {
      const res = await api.post(`/leads/${botId}/${leadId}/webhook`);
      setWebhookStatus({ success: true, message: `Webhook retry success! Status code: ${res.status}` });
    } catch (err) {
      setWebhookStatus({ error: true, message: err.message });
    } finally {
      setRetryingWebhook(false);
    }
  }

  // Parse details json safely
  function parseDetails(detailsStr) {
    try {
      return JSON.parse(detailsStr || '{}');
    } catch (e) {
      return {};
    }
  }

  // Find standard fields (case-insensitive keys)
  function getLeadValue(details, possibleKeys) {
    for (const key of possibleKeys) {
      const foundKey = Object.keys(details).find(k => k.toLowerCase() === key.toLowerCase());
      if (foundKey) return details[foundKey];
    }
    return '';
  }

  // Render score badge
  function ScoreBadge({ score, showLabel = true }) {
    if (!score) return <span className="text-gray-300 text-xs">—</span>;
    const map = {
      hot:  { label: 'Hot',  Icon: Flame,       cls: 'bg-red-100 text-red-700 border-red-200' },
      warm: { label: 'Warm', Icon: Thermometer,  cls: 'bg-amber-100 text-amber-700 border-amber-200' },
      cold: { label: 'Cold', Icon: Snowflake,    cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    };
    const entry = map[score.toLowerCase()];
    if (!entry) return null;
    const { label, Icon, cls } = entry;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
        <Icon className="w-3 h-3" />
        {showLabel && label}
      </span>
    );
  }

  // Export leads to CSV
  async function handleExportCSV() {
    try {
      // Fetch all leads (ignoring pagination limit for full export)
      const data = await api.get(`/leads/${botId}?page=1&limit=500&search=${search}`);
      const exportLeads = data.leads;
      
      if (exportLeads.length === 0) {
        alert('No leads to export.');
        return;
      }

      // Gather all unique keys from all leads to construct headers
      const allKeys = new Set(['Date', 'Visitor Name', 'Conversation Link']);
      const leadsParsed = exportLeads.map(l => {
        const details = parseDetails(l.details);
        Object.keys(details).forEach(k => allKeys.add(k));
        return {
          id: l.id,
          createdAt: new Date(l.createdAt).toLocaleString(),
          visitorName: l.conversation?.visitorName || 'Visitor',
          conversationId: l.conversationId,
          details
        };
      });

      const headers = Array.from(allKeys);
      const csvRows = [headers.join(',')];

      leadsParsed.forEach(l => {
        const rowValues = headers.map(header => {
          let value = '';
          if (header === 'Date') {
            value = l.createdAt;
          } else if (header === 'Visitor Name') {
            value = l.visitorName;
          } else if (header === 'Conversation Link') {
            value = l.conversationId ? `${window.location.origin}/bot/${botId}/conversations` : 'Manual Create';
          } else {
            value = l.details[header] || '';
          }
          // Escape quotes and wrap in quotes
          const escaped = String(value).replace(/"/g, '""');
          return `"${escaped}"`;
        });
        csvRows.push(rowValues.join(','));
      });

      const csvString = csvRows.join('\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-${chatbot?.name?.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'bot'}-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Leads Database</h2>
          <p className="text-gray-500 mt-1">Manage leads collected by your chatbot widget</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportCSV} className="btn-secondary flex items-center gap-1.5 py-2 px-4 text-sm font-medium">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => navigate(`/bot/${botId}/leads-config`)} className="btn-primary flex items-center gap-1.5 py-2 px-4 text-sm font-medium">
            <Settings className="w-4 h-4" /> Lead Settings
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Leads</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalLeads}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Today's Leads</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.todayLeads}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${chatbot?.leadCollectionEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${chatbot?.leadCollectionEnabled ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              {chatbot?.leadCollectionEnabled ? 'Active Capture' : 'Disabled'}
            </span>
            {chatbot?.webhookUrl && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                <Webhook className="w-3 h-3" /> Webhook Connected
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filter and Table container */}
      <div className="flex gap-6 items-stretch min-h-[450px]">
        {/* Main Grid */}
        <div className="flex-1 card flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search name, email, phone..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="input-field pl-9 text-sm py-2"
              />
            </div>
            <span className="text-xs text-gray-400">Showing {leads.length} records</span>
          </div>

          <div className="flex-1 overflow-x-auto">
            {loading && leads.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
              </div>
            ) : leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <Users className="w-12 h-12 mb-2" />
                <p className="font-semibold">No leads found</p>
                <p className="text-sm">Leads will show up here as visitors submit them.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                   <tr className="bg-gray-50 border-b border-gray-200">
                     <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                     <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</th>
                     <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Email</th>
                     <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Phone</th>
                     <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Score</th>
                     <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                     <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                   </tr>
                </thead>
                <tbody>
                  {leads.map(lead => {
                    const details = parseDetails(lead.details);
                    const name = getLeadValue(details, ['name', 'fullName', 'firstname', 'lastname']) || lead.conversation?.visitorName || 'Visitor';
                    const email = getLeadValue(details, ['email', 'emailAddress', 'mail']);
                    const phone = getLeadValue(details, ['phone', 'phoneNumber', 'phoneno', 'tel']);
                    
                    return (
                      <tr
                        key={lead.id}
                        onClick={() => setSelectedLead(lead)}
                        className={`border-b border-gray-100 hover:bg-gray-50/70 transition-colors cursor-pointer ${selectedLead?.id === lead.id ? 'bg-primary-50/40' : ''}`}
                      >
                        <td className="p-4 text-sm text-gray-500 whitespace-nowrap">
                          {new Date(lead.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-4 text-sm font-semibold text-gray-900 truncate max-w-[150px]">
                          {name}
                        </td>
                        <td className="p-4 text-sm text-gray-500 truncate max-w-[180px]">
                          {email || <span className="text-gray-300">-</span>}
                        </td>
                        <td className="p-4 text-sm text-gray-500 whitespace-nowrap">
                          {phone || <span className="text-gray-300">-</span>}
                        </td>
                        <td className="p-4 text-sm whitespace-nowrap">
                          <ScoreBadge score={lead.leadScore} />
                        </td>
                        <td className="p-4 text-sm whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${lead.status === 'incomplete' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                            {lead.status === 'incomplete' ? 'Incomplete' : 'Complete'}
                          </span>
                        </td>
                        <td className="p-4 text-sm text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {lead.conversationId && (
                              <button
                                onClick={() => navigate(`/bot/${botId}/conversations`)}
                                className="p-1.5 hover:bg-gray-200 text-gray-500 rounded-lg transition-colors"
                                title="View Conversation"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteLead(lead.id)}
                              disabled={deletingId === lead.id}
                              className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                              title="Delete Lead"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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

        {/* Lead details inspector (right sidebar) */}
        {selectedLead && (
          <div className="w-80 md:w-96 card flex flex-col overflow-hidden border-l border-gray-200 animate-in slide-in-from-right duration-250">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-primary-600" /> Lead Details
              </h3>
              <button onClick={() => setSelectedLead(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Profile Card */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                <div className="flex justify-between items-start">
                  <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                    <span className="text-base font-bold text-primary-700">
                      {(selectedLead.conversation?.visitorName?.[0] || 'V').toUpperCase()}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${selectedLead.status === 'incomplete' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {selectedLead.status === 'incomplete' ? 'Incomplete' : 'Complete'}
                    </span>
                    <ScoreBadge score={selectedLead.leadScore} />
                  </div>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 text-base">{selectedLead.conversation?.visitorName || 'Visitor'}</h4>
                  <p className="text-xs text-gray-400 mt-0.5">Lead ID: {selectedLead.id.slice(0, 8)}...</p>
                </div>
                {selectedLead.scoreReasoning && (
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Score Reasoning</p>
                    <p className="text-xs text-gray-600 leading-relaxed">{selectedLead.scoreReasoning}</p>
                  </div>
                )}
              </div>

              {/* Data Table */}
              <div className="space-y-3">
                <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Collected Fields</h5>
                <div className="divide-y divide-gray-100">
                  {Object.entries(parseDetails(selectedLead.details)).map(([key, val]) => (
                    <div key={key} className="py-2.5 flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-gray-400 capitalize">{key.replace(/_/g, ' ')}</span>
                      <span className="text-sm font-semibold text-gray-900 break-words">{String(val)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Meta information */}
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Metadata</h5>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span>Captured on: {new Date(selectedLead.createdAt).toLocaleString()}</span>
                  </div>
                  {selectedLead.conversationId && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <button
                        onClick={() => navigate(`/bot/${botId}/conversations`)}
                        className="text-primary-600 hover:underline font-semibold flex items-center gap-0.5"
                      >
                        View Chat History <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Webhook Control */}
              {chatbot?.webhookUrl && (
                <div className="p-3 border border-indigo-100 bg-indigo-50/40 rounded-xl space-y-2.5">
                  <div className="flex items-start gap-2">
                    <Webhook className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h6 className="text-xs font-bold text-indigo-900">Webhook Trigger</h6>
                      <p className="text-[11px] text-indigo-700 mt-0.5">Manually resend this lead data to the configured n8n endpoint</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRetryWebhook(selectedLead.id)}
                    disabled={retryingWebhook}
                    className="w-full bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-semibold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${retryingWebhook ? 'animate-spin' : ''}`} />
                    {retryingWebhook ? 'Dispatching...' : 'Resend Webhook'}
                  </button>
                  {webhookStatus && (
                    <p className={`text-[10px] p-1.5 rounded font-medium border ${webhookStatus.success ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                      {webhookStatus.message}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
