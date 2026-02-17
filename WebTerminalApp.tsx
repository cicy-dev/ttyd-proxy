import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal, Columns, Rows, Maximize2, X, Send, Loader2, CheckCircle, History, Wifi, WifiOff, Menu, RefreshCw, Mic, MicOff, Sparkles, Check } from 'lucide-react';
import { TtydFrame } from './components/TtydFrame';
import { LoginForm } from './components/LoginForm';
import { VoiceFloatingButton } from './components/VoiceFloatingButton';
import { sendCommandToTmux } from './services/mockApi';

interface TmuxPane {
  session: string;
  window: string;
  pane: string;
  target: string;
  botName: string;
}

interface TmuxSession {
  name: string;
  panes: TmuxPane[];
}

const WebTerminalApp: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [botName, setBotName] = useState('cicy_master_xk_bot');
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
  
  // English correction state
  const [correctedText, setCorrectedText] = useState('');
  const [isCorrectingEnglish, setIsCorrectingEnglish] = useState(false);
  
  // Voice recording state
  const [showVoiceButton, setShowVoiceButton] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceButtonPosition, setVoiceButtonPosition] = useState({ x: window.innerWidth / 2 - 48, y: window.innerHeight / 2 - 48 });
  const recognitionRef = useRef<any>(null);
  const interimTranscriptRef = useRef<string>('');
  
  // Network state
  const [networkStatus, setNetworkStatus] = useState<'excellent' | 'good' | 'poor' | 'offline'>('good');
  const [networkLatency, setNetworkLatency] = useState<number | null>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tmuxTarget = selectedPane ? selectedPane.target : `master:${botName}.0`;

  // Parse tre output
  const parseTreOutput = (output: string): TmuxPane[] => {
    const lines = output.trim().split('\n');
    const panes: TmuxPane[] = [];
    for (const line of lines) {
      const cleaned = line.replace(/^[\s│├└─┌┐┘┴┬┤┼╭╮╯╰╱╲╳▏▎▍▌▋▊▉█░▒▓■□▪▫◆◇○●◘◙]+/, '').trim();
      if (!cleaned || !cleaned.includes(':') || !cleaned.includes('.')) continue;
      const target = cleaned;
      const parts = target.split(':');
      if (parts.length === 2) {
        const [session, rest] = parts;
        const [botName, paneNum] = rest.split('.');
        panes.push({ session, window: '0', pane: paneNum || '0', target, botName });
      }
    }
    return panes;
  };

  const groupPanesBySession = (panes: TmuxPane[]): TmuxSession[] => {
    const sessionMap = new Map<string, TmuxPane[]>();
    panes.forEach(pane => {
      if (!sessionMap.has(pane.session)) sessionMap.set(pane.session, []);
      sessionMap.get(pane.session)!.push(pane);
    });
    return Array.from(sessionMap.entries()).map(([name, panes]) => ({ name, panes }));
  };

  const loadTmuxPanes = async () => {
    if (!token) return;
    setIsLoadingPanes(true);
    try {
      const res = await fetch('/api/tmux-list', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.output) {
        const panes = parseTreOutput(data.output);
        setTmuxPanes(panes);
        if (panes.length > 0 && !selectedPane) setSelectedPane(panes[0]);
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

  // Load panes when token is available
  useEffect(() => {
    if (token) {
      const timer = setTimeout(() => loadTmuxPanes(), 100);
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

  const handleCorrectEnglish = async () => {
    if (!commandText.trim() || isCorrectingEnglish) return;
    setIsCorrectingEnglish(true);
    setCorrectedText('');
    try {
      const response = await fetch('/api/correctEnglish', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: commandText })
      });
      const data = await response.json();
      if (data.success && data.correctedText) {
        setCorrectedText(data.correctedText);
      }
    } catch (error) {
      console.error('English correction error:', error);
    } finally {
      setIsCorrectingEnglish(false);
    }
  };

  const handleAcceptCorrection = () => {
    if (correctedText) {
      setCommandText(correctedText);
      setCorrectedText('');
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleVoiceResult = useCallback((text: string) => {
    setCommandText(prev => {
      const prefix = prev.trim() ? prev.trim() + ' ' : '';
      return prefix + text;
    });
  }, []);

  const startVoiceRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'zh-CN';

      recognition.onstart = () => {
        setIsListening(true);
        interimTranscriptRef.current = '';
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          }
        }
        if (finalTranscript) {
          handleVoiceResult(finalTranscript.trim());
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error('Failed to start speech recognition:', e);
      setIsListening(false);
    }
  };

  const stopVoiceRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  };

  const toggleVoice = () => {
    if (showVoiceButton) {
      stopVoiceRecording();
      setShowVoiceButton(false);
    } else {
      setShowVoiceButton(true);
    }
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
      {/* Left Sidebar */}
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
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Panes ({tmuxPanes.length})</div>
            <button onClick={loadTmuxPanes} disabled={isLoadingPanes} className="p-1 rounded text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-50">
              <RefreshCw size={14} className={isLoadingPanes ? 'animate-spin' : ''}/>
            </button>
          </div>
          {groupPanesBySession(tmuxPanes).map((session, idx) => (
            <div key={idx} className="mb-4">
              <div className="px-2 py-1 text-xs text-gray-500 font-semibold uppercase">{session.name}</div>
              <div className="space-y-1">
                {session.panes.map((pane, pIdx) => (
                  <button key={pIdx} onClick={() => setSelectedPane(pane)} className={`w-full text-left px-3 py-2 rounded text-xs font-mono transition-all ${selectedPane?.target === pane.target ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'}`}>
                    {pane.target}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {tmuxPanes.length === 0 && !isLoadingPanes && <div className="text-center text-gray-600 text-sm py-8">No panes found</div>}
        </div>
      </div>

      {/* Main Terminal */}
      <div className="flex-1 relative flex flex-col">
        {/* Terminal Area */}
        <div className="flex-1 relative">
          {tmuxPanes.map((pane) => (
            <div key={pane.target} style={{ display: selectedPane?.target === pane.target ? 'block' : 'none' }} className="absolute inset-0">
              <TtydFrame url={`/ttyd/${pane.botName}/?token=${token}`} isInteractingWithOverlay={false} />
            </div>
          ))}

          {tmuxPanes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Terminal size={64} className="mx-auto mb-4 opacity-20" />
                <p>No tmux panes available</p>
              </div>
            </div>
          )}

          {!showSidebar && (
            <button onClick={() => setShowSidebar(true)} className="absolute top-4 left-4 z-30 p-2 bg-gray-900/90 hover:bg-gray-800 border border-gray-700 text-white rounded-lg transition-all shadow-lg backdrop-blur-sm">
              <Menu size={20} />
            </button>
          )}
        </div>

        {/* Fixed Bottom Prompt Area - Claude Style */}
        {!showVoiceButton && (
        <div className="relative border-t border-gray-800 bg-gradient-to-b from-transparent via-black/50 to-black backdrop-blur-sm">
          <div className="max-w-4xl mx-auto px-4 py-4">
            {/* Corrected Text Display */}
            {correctedText && (
              <div className="mb-3 p-3 bg-purple-900/30 border border-purple-700/50 rounded-xl backdrop-blur-sm">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-purple-400" />
                    <span className="text-xs text-purple-300 font-medium">Corrected:</span>
                  </div>
                  <button onClick={() => setCorrectedText('')} className="text-gray-400 hover:text-white transition-colors">
                    <X size={14} />
                  </button>
                </div>
                <p className="text-sm text-white mb-3 whitespace-pre-wrap font-mono">{correctedText}</p>
                <button
                  onClick={handleAcceptCorrection}
                  className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Check size={14} />
                  Use This Text
                </button>
              </div>
            )}

            <form onSubmit={handleSendCommand} className="relative">
              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={commandText}
                onChange={(e) => setCommandText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendCommand();
                  }
                }}
                placeholder="Send a command to terminal..."
                className="w-full bg-gray-900/80 text-white rounded-2xl px-5 py-4 pr-32 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 border border-gray-700/50 shadow-xl backdrop-blur-md placeholder-gray-500 font-mono text-sm"
                rows={1}
                style={{ minHeight: '56px', maxHeight: '200px' }}
              />
              
              {/* Buttons Container */}
              <div className="absolute right-3 bottom-3 flex items-center gap-2">
                {/* English Correction Button */}
                <button
                  type="button"
                  onClick={handleCorrectEnglish}
                  disabled={!commandText.trim() || isCorrectingEnglish}
                  className="p-2 rounded-lg bg-purple-600/80 hover:bg-purple-500 disabled:bg-gray-800/80 disabled:text-gray-600 text-white transition-all border border-purple-500/50 disabled:border-gray-700/50"
                  title="Correct English"
                >
                  {isCorrectingEnglish ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                </button>

                {/* Voice Record Button */}
                <button
                  type="button"
                  onClick={toggleVoice}
                  className={`p-2 rounded-lg transition-all border ${
                    showVoiceButton
                      ? 'bg-red-600 text-white border-red-500'
                      : 'bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-white border-gray-700/50'
                  }`}
                  title={showVoiceButton ? 'Close voice mode' : 'Open voice mode'}
                >
                  {showVoiceButton ? <MicOff size={18} /> : <Mic size={18} />}
                </button>

                {/* History Button */}
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="p-2 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-white transition-all border border-gray-700/50"
                  title="Command History"
                >
                  <History size={18} />
                </button>

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={!commandText.trim() || isSending}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium transition-all flex items-center gap-2 shadow-lg disabled:cursor-not-allowed"
                >
                  {isSending ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : sendSuccess ? (
                    <CheckCircle size={18} />
                  ) : (
                    <Send size={18} />
                  )}
                  <span className="text-sm">Send</span>
                </button>
              </div>
            </form>
          </div>
        </div>
        )}
      </div>
      {showVoiceButton && (
        <>
          <VoiceFloatingButton
            initialPosition={voiceButtonPosition}
            onPositionChange={(pos) => setVoiceButtonPosition(pos)}
            onRecordStart={() => startVoiceRecording()}
            onRecordEnd={() => stopVoiceRecording()}
            isRecordingExternal={isListening}
          />
          <button
            onClick={() => { stopVoiceRecording(); setShowVoiceButton(false); }}
            className="absolute top-4 right-4 z-[70] p-3 bg-blue-600/80 hover:bg-blue-500 text-white rounded-full shadow-lg transition-all backdrop-blur-sm"
            title="Back to prompt"
          >
            <Terminal size={20} />
          </button>
        </>
      )}

      {/* Right Sidebar - History */}
      <div
        className={`relative bg-gray-900 border-l border-gray-800 transition-all duration-300 flex flex-col ${
          showHistory ? 'w-96' : 'w-0'
        } overflow-hidden z-20`}
      >
        {/* History Header */}
        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <History size={20} className="text-purple-400" />
            <span className="text-white font-semibold">Command History</span>
          </div>
          <div className="flex items-center gap-2">
            {commandHistory.length > 0 && (
              <button
                onClick={handleClearAllHistory}
                className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
              >
                Clear All
              </button>
            )}
            <button
              onClick={() => setShowHistory(false)}
              className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {commandHistory.length === 0 ? (
            <div className="text-center text-gray-600 text-sm py-8">
              <History size={48} className="mx-auto mb-3 opacity-20" />
              <p>No command history yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {commandHistory.map((cmd, idx) => (
                <div
                  key={idx}
                  className="group relative bg-gray-800/50 hover:bg-gray-800 rounded-lg p-3 cursor-pointer transition-all border border-gray-700/30 hover:border-gray-600"
                  onClick={() => handleSelectHistory(cmd)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm text-gray-300 font-mono flex-1 break-all">{cmd}</span>
                    <button
                      onClick={(e) => handleDeleteHistory(e, idx)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 rounded text-red-400 hover:text-red-300 transition-all flex-shrink-0"
                      title="Delete"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Click to reuse</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WebTerminalApp;
