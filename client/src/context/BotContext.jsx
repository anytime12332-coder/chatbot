import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

const BotContext = createContext(null);

export function BotProvider({ children }) {
  const [bots, setBots] = useState([]);
  const [activeBot, setActiveBot] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadBots = useCallback(async () => {
    try {
      const data = await api.get('/chatbots');
      setBots(data);
      // Use the functional updater so we always read the current activeBot
      // instead of a value captured by the empty-deps useCallback closure.
      setActiveBot(prev => {
        if (!prev) return data.length > 0 ? data[0] : null;
        return data.find(b => b.id === prev.id) || prev;
      });
    } catch (err) {
      console.error('Load bots error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBots();
  }, [loadBots]);

  function selectBot(bot) {
    setActiveBot(bot);
  }

  return (
    <BotContext.Provider value={{ bots, activeBot, selectBot, loadBots, loading }}>
      {children}
    </BotContext.Provider>
  );
}

export function useBots() {
  const ctx = useContext(BotContext);
  if (!ctx) throw new Error('useBots must be used within BotProvider');
  return ctx;
}
