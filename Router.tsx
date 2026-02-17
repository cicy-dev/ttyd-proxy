import React, { useState, useEffect } from 'react';
import App from './App';
import TelegramWebView from './TelegramWebView';
import WebTerminalApp from './WebTerminalApp';

type Route = 'telegram' | 'terminal' | 'web';

export const Router: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState<Route>('telegram');
  const [isTelegramMode, setIsTelegramMode] = useState(false);

  useEffect(() => {
    // Check if token is in URL (Telegram mode)
    const urlParams = new URLSearchParams(window.location.search);
    const hasTokenParam = urlParams.has('token');
    setIsTelegramMode(hasTokenParam);

    const handleHashChange = () => {
      const hash = window.location.hash.slice(1); // Remove #
      
      if (hash === 'terminal' || hash === 'split') {
        setCurrentRoute('terminal');
      } else if (hash === 'web') {
        setCurrentRoute('web');
      } else {
        setCurrentRoute('telegram');
      }
    };

    // Initial route detection
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  // If token parameter exists, use Telegram mode (original App)
  if (isTelegramMode) {
    // Directly go to terminal interface, skip TelegramWebView selection
    return <App />;
  }

  // No token parameter, use Web mode with sidebar
  return <WebTerminalApp />;
};
