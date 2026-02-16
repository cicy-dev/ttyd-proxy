import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Columns, Rows, Maximize2, X, Send, Loader2, CheckCircle, History, Wifi, WifiOff, Menu } from 'lucide-react';
import { TtydFrame } from './components/TtydFrame';
import { LoginForm } from './components/LoginForm';
import { sendCommandToTmux } from './services/mockApi';

const WebTerminalApp: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [botName, setBotName] = useState('cicy_master_xk_bot');
  const [showSidebar, setShowSidebar] = useState(true);
  
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
  const tmuxTarget = `master:${botName}.0`;

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
            // Load command history
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
    if (!commandText.trim() || isSending) return;

    const command = commandText.trim();
    
    // Add to history
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
      await sendCommandToTmux(command, tmuxTarget);
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
    setIsSending(true);
    try {
      await sendCommandToTmux(command, tmuxTarget);
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 2000);
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
          <div className="mt-2 text-xs text-gray-500">
            Bot: <span className="text-blue-400 font-mono">{botName}</span>
          </div>
        </div>

        {/* Tmux Controls */}
        <div className="px-4 py-3 border-b border-gray-800 flex-shrink-0">
          <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Tmux Split</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleTmuxCommand(`tmux split-window -h -t ${tmuxTarget}`)}
              className="p-3 bg-gray-800 hover:bg-gray-700 border-2 border-gray-700 hover:border-blue-500 text-gray-300 hover:text-white rounded-lg transition-all"
              title="Split Horizontally (Side by Side)"
            >
              <Columns size={18} className="mx-auto mb-1" />
              <div className="text-xs">H-Split</div>
            </button>
            
            <button
              onClick={() => handleTmuxCommand(`tmux split-window -v -t ${tmuxTarget}`)}
              className="p-3 bg-gray-800 hover:bg-gray-700 border-2 border-gray-700 hover:border-blue-500 text-gray-300 hover:text-white rounded-lg transition-all"
              title="Split Vertically (Top and Bottom)"
            >
              <Rows size={18} className="mx-auto mb-1" />
              <div className="text-xs">V-Split</div>
            </button>
            
            <button
              onClick={() => handleTmuxCommand(`tmux resize-pane -Z -t ${tmuxTarget}`)}
              className="p-3 bg-gray-800 hover:bg-gray-700 border-2 border-gray-700 hover:border-green-500 text-gray-300 hover:text-white rounded-lg transition-all"
              title="Toggle Maximize Pane"
            >
              <Maximize2 size={18} className="mx-auto mb-1" />
              <div className="text-xs">Maximize</div>
            </button>
            
            <button
              onClick={() => handleTmuxCommand(`tmux kill-pane -t ${tmuxTarget}`)}
              className="p-3 bg-gray-800 hover:bg-red-600 border-2 border-gray-700 hover:border-red-500 text-gray-300 hover:text-white rounded-lg transition-all"
              title="Close Current Pane"
            >
              <X size={18} className="mx-auto mb-1" />
              <div className="text-xs">Close</div>
            </button>
          </div>
        </div>

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
                  placeholder="Type command... (Enter to send, Shift+Enter for new line)"
                  className="w-full flex-1 bg-gray-800 text-white rounded-lg px-3 py-2.5 text-sm border-2 border-gray-700 outline-none focus:border-blue-500 transition-colors resize-none font-mono"
                  disabled={isSending}
                />
              </div>
              
              <button
                type="submit"
                disabled={!commandText.trim() || isSending}
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

      {/* Main Terminal */}
      <div className="flex-1 relative">
        <TtydFrame
          url={`/ttyd/${botName}/?token=${token}`}
          isInteractingWithOverlay={false}
        />

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
