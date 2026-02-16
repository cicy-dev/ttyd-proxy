import React, { useState, useEffect } from 'react';
import { Terminal, Layout, Grid, Columns, Rows, Plus, Settings, Wifi, WifiOff, Maximize2, Minimize2, X, Menu } from 'lucide-react';
import { TtydFrame } from './components/TtydFrame';
import { SplitPaneLayout } from './components/SplitPaneLayout';
import { LoginForm } from './components/LoginForm';

interface TerminalPane {
  id: string;
  botName: string;
  title: string;
}

type LayoutMode = 'single' | 'horizontal' | 'vertical' | 'grid-2x2' | 'grid-1x2' | 'grid-2x1';

const WebTerminalApp: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [panes, setPanes] = useState<TerminalPane[]>([]);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('single');
  const [isInteracting, setIsInteracting] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [networkStatus, setNetworkStatus] = useState<'excellent' | 'good' | 'poor' | 'offline'>('good');
  const [networkLatency, setNetworkLatency] = useState<number | null>(null);
  const [showAddPane, setShowAddPane] = useState(false);
  const [newBotName, setNewBotName] = useState('');
  const [newPaneTitle, setNewPaneTitle] = useState('');

  // Check auth on mount
  useEffect(() => {
    const init = async () => {
      const savedToken = localStorage.getItem('token');
      if (savedToken) {
        try {
          const res = await fetch('/api/health', {
            headers: { 'Authorization': `Bearer ${savedToken}` }
          });
          if (res.ok) {
            setToken(savedToken);
            // Initialize with default pane
            setPanes([{
              id: '1',
              botName: 'cicy_master_xk_bot',
              title: 'Terminal 1'
            }]);
          } else {
            localStorage.removeItem('token');
          }
        } catch (e) {
          console.error('Auth check failed', e);
        }
      }
      setIsCheckingAuth(false);
    };
    init();
  }, []);

  // Network health check
  useEffect(() => {
    const checkHealth = async () => {
      const startTime = performance.now();
      try {
        const response = await fetch('/api/health', { cache: 'no-cache' });
        const endTime = performance.now();
        const latency = Math.round(endTime - startTime);
        
        if (response.ok) {
          setNetworkLatency(latency);
          if (latency < 100) setNetworkStatus('excellent');
          else if (latency < 300) setNetworkStatus('good');
          else setNetworkStatus('poor');
        } else {
          setNetworkStatus('offline');
          setNetworkLatency(null);
        }
      } catch (error) {
        setNetworkStatus('offline');
        setNetworkLatency(null);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = (newToken: string) => {
    setToken(newToken);
    setPanes([{
      id: '1',
      botName: 'cicy_master_xk_bot',
      title: 'Terminal 1'
    }]);
  };

  const handleAddPane = () => {
    if (!newBotName.trim()) return;
    
    const newPane: TerminalPane = {
      id: Date.now().toString(),
      botName: newBotName.trim(),
      title: newPaneTitle.trim() || `Terminal ${panes.length + 1}`
    };
    
    setPanes(prev => [...prev, newPane]);
    setNewBotName('');
    setNewPaneTitle('');
    setShowAddPane(false);
    
    // Auto adjust layout
    if (panes.length === 1) setLayoutMode('horizontal');
    else if (panes.length === 2) setLayoutMode('grid-1x2');
    else if (panes.length === 3) setLayoutMode('grid-2x2');
  };

  const handleRemovePane = (id: string) => {
    setPanes(prev => {
      const filtered = prev.filter(p => p.id !== id);
      if (filtered.length === 1) setLayoutMode('single');
      else if (filtered.length === 2) setLayoutMode('horizontal');
      return filtered;
    });
  };

  const renderTerminal = (pane: TerminalPane, showControls: boolean = true) => (
    <div key={pane.id} className="relative w-full h-full bg-black group">
      <TtydFrame
        url={`/ttyd/${pane.botName}/?token=${token}`}
        isInteractingWithOverlay={isInteracting}
      />
      
      {/* Terminal Header */}
      {showControls && (
        <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between px-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-blue-400" />
            <span className="text-xs text-white font-medium">{pane.title}</span>
            <span className="text-xs text-gray-500">({pane.botName})</span>
          </div>
          
          {panes.length > 1 && (
            <button
              onClick={() => handleRemovePane(pane.id)}
              className="p-1 bg-red-600/80 hover:bg-red-500 text-white rounded transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );

  const renderLayout = () => {
    if (panes.length === 0) {
      return (
        <div className="w-full h-full flex items-center justify-center text-gray-500">
          <div className="text-center">
            <Terminal size={64} className="mx-auto mb-4 opacity-20" />
            <p>No terminals</p>
          </div>
        </div>
      );
    }

    if (panes.length === 1 || layoutMode === 'single') {
      return renderTerminal(panes[0], false);
    }

    if (layoutMode === 'horizontal' && panes.length >= 2) {
      return (
        <SplitPaneLayout
          direction="horizontal"
          onInteractionStart={() => setIsInteracting(true)}
          onInteractionEnd={() => setIsInteracting(false)}
        >
          {renderTerminal(panes[0])}
          {renderTerminal(panes[1])}
        </SplitPaneLayout>
      );
    }

    if (layoutMode === 'vertical' && panes.length >= 2) {
      return (
        <SplitPaneLayout
          direction="vertical"
          onInteractionStart={() => setIsInteracting(true)}
          onInteractionEnd={() => setIsInteracting(false)}
        >
          {renderTerminal(panes[0])}
          {renderTerminal(panes[1])}
        </SplitPaneLayout>
      );
    }

    if (layoutMode === 'grid-1x2' && panes.length >= 2) {
      return (
        <SplitPaneLayout
          direction="vertical"
          onInteractionStart={() => setIsInteracting(true)}
          onInteractionEnd={() => setIsInteracting(false)}
        >
          {renderTerminal(panes[0])}
          <div className="w-full h-full flex gap-px bg-gray-800">
            {panes.slice(1, 3).map(p => (
              <div key={p.id} className="flex-1">
                {renderTerminal(p)}
              </div>
            ))}
          </div>
        </SplitPaneLayout>
      );
    }

    if (layoutMode === 'grid-2x1' && panes.length >= 2) {
      return (
        <SplitPaneLayout
          direction="horizontal"
          onInteractionStart={() => setIsInteracting(true)}
          onInteractionEnd={() => setIsInteracting(false)}
        >
          {renderTerminal(panes[0])}
          <div className="w-full h-full flex flex-col gap-px bg-gray-800">
            {panes.slice(1, 3).map(p => (
              <div key={p.id} className="flex-1">
                {renderTerminal(p)}
              </div>
            ))}
          </div>
        </SplitPaneLayout>
      );
    }

    if (layoutMode === 'grid-2x2') {
      return (
        <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-px bg-gray-800">
          {panes.slice(0, 4).map(p => renderTerminal(p))}
        </div>
      );
    }

    return renderTerminal(panes[0]);
  };

  if (isCheckingAuth) {
    return (
      <div className="bg-black w-screen h-screen flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!token) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden font-sans flex">
      {/* Sidebar */}
      <div
        className={`relative bg-gray-900 border-r border-gray-800 transition-all duration-300 flex flex-col ${
          showSidebar ? 'w-64' : 'w-0'
        } overflow-hidden z-20`}
      >
        {/* Sidebar Header */}
        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Terminal size={20} className="text-blue-400" />
            <span className="text-white font-semibold">Terminals</span>
          </div>
          <button
            onClick={() => setShowSidebar(false)}
            className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Network Status */}
        <div className="px-4 py-3 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm">
            {networkStatus === 'excellent' && <Wifi size={16} className="text-green-400" />}
            {networkStatus === 'good' && <Wifi size={16} className="text-yellow-400" />}
            {networkStatus === 'poor' && <Wifi size={16} className="text-orange-400" />}
            {networkStatus === 'offline' && <WifiOff size={16} className="text-red-400" />}
            <span className="text-gray-400">
              {networkLatency !== null ? `${networkLatency}ms` : 'Offline'}
            </span>
          </div>
        </div>

        {/* Layout Selector */}
        <div className="px-4 py-3 border-b border-gray-800 flex-shrink-0">
          <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Layout</div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setLayoutMode('single')}
              className={`p-2 rounded border transition-all ${
                layoutMode === 'single'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750 hover:text-white'
              }`}
              title="Single"
            >
              <Maximize2 size={16} className="mx-auto" />
            </button>
            
            <button
              onClick={() => setLayoutMode('horizontal')}
              disabled={panes.length < 2}
              className={`p-2 rounded border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                layoutMode === 'horizontal'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750 hover:text-white'
              }`}
              title="Horizontal"
            >
              <Columns size={16} className="mx-auto" />
            </button>
            
            <button
              onClick={() => setLayoutMode('vertical')}
              disabled={panes.length < 2}
              className={`p-2 rounded border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                layoutMode === 'vertical'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750 hover:text-white'
              }`}
              title="Vertical"
            >
              <Rows size={16} className="mx-auto" />
            </button>
            
            <button
              onClick={() => setLayoutMode('grid-2x2')}
              disabled={panes.length < 3}
              className={`p-2 rounded border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                layoutMode === 'grid-2x2'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750 hover:text-white'
              }`}
              title="Grid 2x2"
            >
              <Grid size={16} className="mx-auto" />
            </button>
            
            <button
              onClick={() => setLayoutMode('grid-1x2')}
              disabled={panes.length < 2}
              className={`p-2 rounded border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                layoutMode === 'grid-1x2'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750 hover:text-white'
              }`}
              title="Grid 1+2"
            >
              <Layout size={16} className="mx-auto" />
            </button>
            
            <button
              onClick={() => setLayoutMode('grid-2x1')}
              disabled={panes.length < 2}
              className={`p-2 rounded border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                layoutMode === 'grid-2x1'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750 hover:text-white'
              }`}
              title="Grid 2+1"
            >
              <Layout size={16} className="mx-auto rotate-90" />
            </button>
          </div>
        </div>

        {/* Terminal List */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
            Terminals ({panes.length})
          </div>
          <div className="space-y-2">
            {panes.map((pane, idx) => (
              <div
                key={pane.id}
                className="bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-blue-500 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium truncate">{pane.title}</div>
                    <div className="text-xs text-gray-500 truncate">{pane.botName}</div>
                  </div>
                  {panes.length > 1 && (
                    <button
                      onClick={() => handleRemovePane(pane.id)}
                      className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-600 text-gray-400 hover:text-white rounded transition-all"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add Terminal Button */}
        <div className="p-4 border-t border-gray-800 flex-shrink-0">
          {!showAddPane ? (
            <button
              onClick={() => setShowAddPane(true)}
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={18} />
              Add Terminal
            </button>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={newPaneTitle}
                onChange={(e) => setNewPaneTitle(e.target.value)}
                placeholder="Title (optional)"
                className="w-full bg-gray-800 text-white rounded px-3 py-2 text-sm border border-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                value={newBotName}
                onChange={(e) => setNewBotName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddPane()}
                placeholder="Bot name..."
                className="w-full bg-gray-800 text-white rounded px-3 py-2 text-sm border border-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddPane}
                  disabled={!newBotName.trim()}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setShowAddPane(false);
                    setNewBotName('');
                    setNewPaneTitle('');
                  }}
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative">
        {renderLayout()}

        {/* Toggle Sidebar Button */}
        {!showSidebar && (
          <button
            onClick={() => setShowSidebar(true)}
            className="absolute top-4 left-4 z-30 p-2 bg-gray-900/90 hover:bg-gray-800 border border-gray-700 text-white rounded-lg transition-all shadow-lg backdrop-blur-sm"
          >
            <Menu size={20} />
          </button>
        )}
      </div>
    </div>
  );
};

export default WebTerminalApp;
