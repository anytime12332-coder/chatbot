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
      // Auto-select first bot if none selected
      if (!activeBot && data.length > 0) {
        setActiveBot(data[0]);
      } else if (activeBot) {
        // Refresh active bot data
        const updated = data.find(b => b.id === activeBot.id);
        if (updated) setActiveBot(updated);
      }
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
