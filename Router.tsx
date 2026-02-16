import React, { useState, useEffect } from 'react';
import App from './App';
import TelegramWebView from './TelegramWebView';

type Route = 'telegram' | 'terminal';

export const Router: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState<Route>('telegram');

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1); // Remove #
      
      if (hash === 'terminal' || hash === 'split') {
        setCurrentRoute('terminal');
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

  if (currentRoute === 'terminal') {
    return <App />;
  }

  return <TelegramWebView />;
};
