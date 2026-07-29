import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { BotProvider } from './context/BotContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Overview from './pages/Overview';
import ChatbotList from './pages/ChatbotList';
import BotDashboard from './pages/BotDashboard';
import BotConfig from './pages/BotConfig';
import ApiConfig from './pages/ApiConfig';
import EmbedCode from './pages/EmbedCode';
import Conversations from './pages/Conversations';
import Settings from './pages/Settings';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    );
  }
  return isAuthenticated ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <BotProvider>
              <Layout>
                <Routes>
                  <Route path="/" element={<Overview />} />
                  <Route path="/chatbots" element={<ChatbotList />} />
                  <Route path="/bot/:botId/dashboard" element={<BotDashboard />} />
                  <Route path="/bot/:botId/config" element={<BotConfig />} />
                  <Route path="/bot/:botId/api" element={<ApiConfig />} />
                  <Route path="/bot/:botId/embed" element={<EmbedCode />} />
                  <Route path="/bot/:botId/conversations" element={<Conversations />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </Layout>
            </BotProvider>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
