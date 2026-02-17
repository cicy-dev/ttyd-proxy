import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Columns, Rows, Maximize2, X, Send, Loader2, CheckCircle, History, Wifi, WifiOff, Menu, RefreshCw } from 'lucide-react';
import { TtydFrame } from './components/TtydFrame';
import { LoginForm } from './components/LoginForm';
import { sendCommandToTmux } from './services/mockApi';

interface TmuxPane {
  session: string;
  window: string;
  pane: string;
  target: string;
  botName: string;
}

const WebTerminalApp: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  
  // Tmux panes
  const [tmuxPanes, setTmuxPanes] = useState<TmuxPane[]>([]);
  const [selectedPane, setSelectedPane] = useState<TmuxPane | null>(null);
  const [isLoadingPanes, setIsLoadingPanes] = useState(false);
  
  // Command state
  const [commandText, setCommandText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tempDraft, setTempDraft] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  
  // Network state
  const [networkStatus, setNetworkStatus] = useState<'excellent' | 'good' | 'poor' | 'offline'>('good');
  const [networkLatency, setNetworkLatency] = useState<number | null>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Parse tre output
  const parseTreOutput = (output: string): TmuxPane[] => {
    const lines = output.trim().split('\n');
    const panes: TmuxPane[] = [];
    let currentSession = '';

    for (const line of lines) {
      // Skip tree characters and empty lines
      const cleaned = line.replace(/^[│├└─\s]+/, '').trim();
      if (!cleaned) continue;

      // Session line (no colon)
      if (!line.includes(':') && /^[a-z_]+$/.test(cleaned.split(' ')[0])) {
        currentSession = cleaned.split(' ')[0];
      }
      // Pane line (has colon, is a target)
      else if (cleaned.includes(':') && cleaned.includes('.')) {
        const target = cleaned;
        const parts = target.split(':');
        if (parts.length === 2) {
          const [session, rest] = parts;
          const [botName, paneNum] = rest.split('.');
          panes.push({
            session,
            window: '0',
            pane: paneNum || '0',
            target,
            botName
          });
        }
      }
    }

    return panes;
  };

  // Load tmux panes
  const loadTmuxPanes = async () => {
    if (!token) {
      console.log('No token available, skipping pane load');
      return;
    }
    
    setIsLoadingPanes(true);
    try {
      const res = await fetch('/api/tmux-list', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) {
        console.error('Failed to load tmux panes:', res.status, res.statusText);
        return;
      }
      
      const data = await res.json();
      if (data.success && data.output) {
        const panes = parseTreOutput(data.output);
        setTmuxPanes(panes);
        if (panes.length > 0 && !selectedPane) {
          setSelectedPane(panes[0]);
        }
      } else {
        console.error('API returned error:', data.error);
      }
    } catch (error) {
      console.error('Failed to load tmux panes', error);
    } finally {
      setIsLoadingPanes(false);
    }
  };

  // Check auth on mount
  useEffect(() => {
    const init = async () => {
      // Check URL for token parameter
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');
      
      if (urlToken) {
        // Save token from URL
        localStorage.setItem('token', urlToken);
        // Remove token from URL
        urlParams.delete('token');
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '') + window.location.hash;
        window.history.replaceState({}, '', newUrl);
        // Set token and skip login
        setToken(urlToken);
        const savedHistory = localStorage.getItem('command_history');
        if (savedHistory) {
          setCommandHistory(JSON.parse(savedHistory));
        }
        setIsCheckingAuth(false);
        return;
      }

      // Check saved token
      const savedToken = localStorage.getItem('token');
      if (savedToken) {
        try {
          const res = await fetch('/api/health', {
            headers: { 'Authorization': `Bearer ${savedToken}` }
          });
          if (res.ok) {
            setToken(savedToken);
            const savedHistory = localStorage.getItem('command_history');
            if (savedHistory) {
              setCommandHistory(JSON.parse(savedHistory));
            }
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

  // Load panes when token is available
  useEffect(() => {
    if (token) {
      // Add a small delay to ensure token is properly set
      const timer = setTimeout(() => {
        loadTmuxPanes();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [token]);

  // Save command history
  useEffect(() => {
    if (commandHistory.length > 0) {
      localStorage.setItem('command_history', JSON.stringify(commandHistory));
    }
  }, [commandHistory]);

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
  };

  const handleSendCommand = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!commandText.trim() || isSending || !selectedPane) return;

    const command = commandText.trim();
    
    setCommandHistory(prev => {
      const newHistory = [command, ...prev.filter(cmd => cmd !== command)].slice(0, 50);
      return newHistory;
    });
    setHistoryIndex(-1);
    setTempDraft('');
    
    setCommandText('');
    setIsSending(true);
    setSendSuccess(false);

    try {
      await sendCommandToTmux(command, selectedPane.target);
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 2000);
    } catch (error) {
      console.error("Failed to send command", error);
    } finally {
      setIsSending(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleTmuxCommand = async (command: string) => {
    if (!selectedPane) return;
    setIsSending(true);
    try {
      await sendCommandToTmux(command, selectedPane.target);
      setSendSuccess(true);
      setTimeout(() => {
        setSendSuccess(false);
        loadTmuxPanes(); // Refresh pane list after tmux command
      }, 1000);
    } catch (error) {
      console.error("Failed to execute tmux command", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleSelectHistory = (command: string) => {
    setCommandText(command);
    setShowHistory(false);
    setHistoryIndex(-1);
    setTempDraft(command);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleDeleteHistory = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setCommandHistory(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleClearAllHistory = () => {
    setCommandHistory([]);
    localStorage.removeItem('command_history');
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
          showSidebar ? 'w-80' : 'w-0'
        } overflow-hidden z-20`}
      >
        {/* Sidebar Header */}
        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Terminal size={20} className="text-blue-400" />
            <span className="text-white font-semibold">Terminal Control</span>
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
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Status</div>
            <div className="flex items-center gap-2 text-sm">
              {networkStatus === 'excellent' && <Wifi size={16} className="text-green-400" />}
              {networkStatus === 'good' && <Wifi size={16} className="text-yellow-400" />}
              {networkStatus === 'poor' && <Wifi size={16} className="text-orange-400" />}
              {networkStatus === 'offline' && <WifiOff size={16} className="text-red-400" />}
              <span className="text-gray-400 font-mono text-xs">
                {networkLatency !== null ? `${networkLatency}ms` : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        {/* Tmux Panes List */}
        <div className="flex-1 flex flex-col px-4 py-3 min-h-0 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
              Tmux Panes ({tmuxPanes.length})
            </div>
            <button
              onClick={loadTmuxPanes}
              disabled={isLoadingPanes}
              className="p-1.5 rounded transition-all text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw size={16} className={isLoadingPanes ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {tmuxPanes.map((pane, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedPane(pane)}
                className={`w-full text-left px-3 py-2 rounded transition-all ${
                  selectedPane?.target === pane.target
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                <div className="text-xs font-mono truncate">{pane.target}</div>
                <div className="text-xs opacity-70 truncate">{pane.botName}</div>
              </button>
            ))}
            {tmuxPanes.length === 0 && !isLoadingPanes && (
              <div className="text-center text-gray-600 text-sm py-8">
                No tmux panes found
              </div>
            )}
          </div>
        </div>

        {/* Tmux Controls */}
        {selectedPane && (
          <div className="px-4 py-3 border-b border-gray-800 flex-shrink-0">
            <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Tmux Split</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleTmuxCommand(`tmux split-window -h -t ${selectedPane.target}`)}
                className="p-3 bg-gray-800 hover:bg-gray-700 border-2 border-gray-700 hover:border-blue-500 text-gray-300 hover:text-white rounded-lg transition-all"
                title="Split Horizontally"
              >
                <Columns size={18} className="mx-auto mb-1" />
                <div className="text-xs">H-Split</div>
              </button>
              
              <button
                onClick={() => handleTmuxCommand(`tmux split-window -v -t ${selectedPane.target}`)}
                className="p-3 bg-gray-800 hover:bg-gray-700 border-2 border-gray-700 hover:border-blue-500 text-gray-300 hover:text-white rounded-lg transition-all"
                title="Split Vertically"
              >
                <Rows size={18} className="mx-auto mb-1" />
                <div className="text-xs">V-Split</div>
              </button>
              
              <button
                onClick={() => handleTmuxCommand(`tmux resize-pane -Z -t ${selectedPane.target}`)}
                className="p-3 bg-gray-800 hover:bg-gray-700 border-2 border-gray-700 hover:border-green-500 text-gray-300 hover:text-white rounded-lg transition-all"
                title="Toggle Maximize"
              >
                <Maximize2 size={18} className="mx-auto mb-1" />
                <div className="text-xs">Maximize</div>
              </button>
              
              <button
                onClick={() => handleTmuxCommand(`tmux kill-pane -t ${selectedPane.target}`)}
                className="p-3 bg-gray-800 hover:bg-red-600 border-2 border-gray-700 hover:border-red-500 text-gray-300 hover:text-white rounded-lg transition-all"
                title="Close Pane"
              >
                <X size={18} className="mx-auto mb-1" />
                <div className="text-xs">Close</div>
              </button>
            </div>
          </div>
        )}

        {/* Command Input */}
        <div className="flex-1 flex flex-col px-4 py-3 min-h-0">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Command</div>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`p-1.5 rounded transition-all ${
                showHistory
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
              title="Command History"
            >
              <History size={16} />
            </button>
          </div>

          {!showHistory ? (
            <form onSubmit={handleSendCommand} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 flex flex-col min-h-0">
                <textarea
                  ref={textareaRef}
                  value={commandText}
                  onChange={(e) => {
                    setCommandText(e.target.value);
                    if (historyIndex === -1) {
                      setTempDraft(e.target.value);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleSendCommand();
                    }
                    else if (e.key === 'ArrowUp') {
                      const textarea = e.currentTarget;
                      const cursorPos = textarea.selectionStart;
                      const textBeforeCursor = textarea.value.substring(0, cursorPos);
                      const isOnFirstLine = !textBeforeCursor.includes('\n');
                      
                      if (isOnFirstLine && commandHistory.length > 0) {
                        e.preventDefault();
                        if (historyIndex === -1) {
                          setTempDraft(commandText);
                          setHistoryIndex(0);
                          setCommandText(commandHistory[0]);
                        } else if (historyIndex < commandHistory.length - 1) {
                          const newIndex = historyIndex + 1;
                          setHistoryIndex(newIndex);
                          setCommandText(commandHistory[newIndex]);
                        }
                      }
                    }
                    else if (e.key === 'ArrowDown') {
                      const textarea = e.currentTarget;
                      const cursorPos = textarea.selectionStart;
                      const textAfterCursor = textarea.value.substring(cursorPos);
                      const isOnLastLine = !textAfterCursor.includes('\n');
                      
                      if (isOnLastLine) {
                        e.preventDefault();
                        if (historyIndex > 0) {
                          const newIndex = historyIndex - 1;
                          setHistoryIndex(newIndex);
                          setCommandText(commandHistory[newIndex]);
                        } else if (historyIndex === 0) {
                          setHistoryIndex(-1);
                          setCommandText(tempDraft);
                        }
                      }
                    }
                  }}
                  placeholder="Type command..."
                  className="w-full flex-1 bg-gray-800 text-white rounded-lg px-3 py-2.5 text-sm border-2 border-gray-700 outline-none focus:border-blue-500 transition-colors resize-none font-mono"
                  disabled={isSending || !selectedPane}
                />
              </div>
              
              <button
                type="submit"
                disabled={!commandText.trim() || isSending || !selectedPane}
                className="mt-3 w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
              >
                {isSending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Sending...
                  </>
                ) : sendSuccess ? (
                  <>
                    <CheckCircle size={16} />
                    Sent!
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Send Command
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">History ({commandHistory.length})</span>
                {commandHistory.length > 0 && (
                  <button
                    onClick={handleClearAllHistory}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
                {commandHistory.length > 0 ? (
                  commandHistory.map((cmd, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleSelectHistory(cmd)}
                      className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded cursor-pointer text-gray-300 hover:text-white transition-colors group flex items-center justify-between gap-2"
                    >
                      <span className="truncate text-sm font-mono flex-1">{cmd}</span>
                      <button
                        onClick={(e) => handleDeleteHistory(e, idx)}
                        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity flex-shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-gray-600 text-sm py-8">
                    No command history yet
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Terminal Area */}
      <div className="flex-1 relative">
        {/* Render all iframes, hide non-selected ones */}
        {tmuxPanes.map((pane) => (
          <div
            key={pane.target}
            style={{ display: selectedPane?.target === pane.target ? 'block' : 'none' }}
            className="absolute inset-0"
          >
            <TtydFrame
              url={`/ttyd/${pane.botName}/?token=${token}`}
              isInteractingWithOverlay={false}
            />
          </div>
        ))}

        {tmuxPanes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <Terminal size={64} className="mx-auto mb-4 opacity-20" />
              <p>No tmux panes available</p>
              <button
                onClick={loadTmuxPanes}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
        )}

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
