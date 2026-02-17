import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Send, Settings, Wifi, WifiOff, X, Plus, Trash2, Edit2, Keyboard, Check, Mic, MicOff, Terminal, MessageSquare, Maximize, Loader2, CheckCircle, History, Menu, Sparkles, Layout } from 'lucide-react';
import { TtydFrame } from './components/TtydFrame';
import { FloatingPanel } from './components/FloatingPanel';
import { VoiceFloatingButton } from './components/VoiceFloatingButton';
import { LoginForm } from './components/LoginForm';
import { TmuxSplitControls } from './components/TmuxSplitControls';
import { MultiTerminalView } from './components/MultiTerminalView';
import { sendCommandToTmux, sendSystemEvent, sendShortcut } from './services/mockApi';
import { AppSettings, Position, Size } from './types';

// 从 URL query 获取参数
const BOT_NAME = new URLSearchParams(window.location.search).get('bot_name') || 'cicy_master_xk_bot';
const TMUX_TARGET = `master:${BOT_NAME}.0`;

const DEFAULT_SETTINGS: AppSettings = {
  panelPosition: { x: 20, y: 20 },
  panelSize: { width: 450, height: 160 },  // Increased height for 2-row textarea
  forwardEvents: false,
  lastDraft: '',
  showPrompt: true,  // Default to Prompt mode for Telegram
  showVoiceControl: false,
  voiceButtonPosition: { x: 40, y: 200 },
  commandHistory: []
};

const STORAGE_KEY = 'ttyd_app_settings_v1';

// Speech Recognition Type Definition
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

const App: React.FC = () => {
  // --- State Management ---
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  // UI State
  const [isInteracting, setIsInteracting] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [correctedText, setCorrectedText] = useState('');
  const [isCorrectingEnglish, setIsCorrectingEnglish] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  // Multi-Terminal Mode
  const [multiTerminalMode, setMultiTerminalMode] = useState(false);
  
  // Network Status
  const [networkLatency, setNetworkLatency] = useState<number | null>(null);
  const [networkStatus, setNetworkStatus] = useState<'excellent' | 'good' | 'poor' | 'offline'>('good');
  
  // Command History
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tempDraft, setTempDraft] = useState('');
  
  // Voice State
  const [isListening, setIsListening] = useState(false);
  const voiceModeRef = useRef<'append' | 'direct'>('append');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // iframe URL
  const iframeUrl = `/ttyd/${BOT_NAME}/?token=${token || ''}`;

  // --- Initialization & Persistence ---
  
  useEffect(() => {
    const init = async () => {
      // Check URL for token parameter (Telegram mode)
      const urlToken = new URLSearchParams(window.location.search).get('token');
      if (urlToken) {
        localStorage.setItem('token', urlToken);
        setToken(urlToken);
        setIsCheckingAuth(false);
        
        // Load settings - ensure only prompt or voice mode is active
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (!parsed.commandHistory) {
              parsed.commandHistory = [];
            }
            // Ensure only one mode is active at a time
            if (parsed.showVoiceControl) {
              parsed.showPrompt = false;
            }
            setSettings({ ...DEFAULT_SETTINGS, ...parsed });
            if (parsed.lastDraft) setPromptText(parsed.lastDraft);
          } catch (e) {
            console.error("Failed to parse settings", e);
          }
        } else {
          // No saved settings, use defaults (showPrompt: true)
          setSettings(DEFAULT_SETTINGS);
        }
        setIsLoaded(true);
        return;
      }

      // Check for saved token
      const savedToken = localStorage.getItem('token');
      if (savedToken) {
        // Verify token is still valid
        try {
          const res = await fetch('/api/tmux', {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${savedToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: '', target: TMUX_TARGET })
          });
          if (res.ok || res.status === 200) {
            setToken(savedToken);
          } else {
            localStorage.removeItem('token');
          }
        } catch (e) {
          console.error('Token verification failed', e);
          localStorage.removeItem('token');
        }
      }
      setIsCheckingAuth(false);

      // Load settings
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (!parsed.commandHistory) {
            parsed.commandHistory = [];
          }
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
          if (parsed.lastDraft) setPromptText(parsed.lastDraft);
        } catch (e) {
          console.error("Failed to parse settings", e);
        }
      }
      setIsLoaded(true);
    };
    init();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  }, [settings, isLoaded]);

  // Auto-save draft
  useEffect(() => {
    if (!isLoaded) return;
    const timeoutId = setTimeout(() => {
        setSettings(prev => {
            if (prev.lastDraft === promptText) return prev;
            return { ...prev, lastDraft: promptText };
        });
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [promptText, isLoaded]);

  // Network Health Check
  useEffect(() => {
    const checkHealth = async () => {
      const startTime = performance.now();
      try {
        const response = await fetch('/api/health', {
          method: 'GET',
          cache: 'no-cache'
        });
        const endTime = performance.now();
        const latency = Math.round(endTime - startTime);
        
        if (response.ok) {
          setNetworkLatency(latency);
          if (latency < 100) {
            setNetworkStatus('excellent');
          } else if (latency < 300) {
            setNetworkStatus('good');
          } else {
            setNetworkStatus('poor');
          }
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

  // --- Voice Input Logic ---

  const recognitionRef = useRef<any>(null);
  const interimTranscriptRef = useRef<string>('');

  const handleVoiceResult = useCallback(async (text: string) => {
    if (voiceModeRef.current === 'append') {
        setPromptText(prev => {
            const prefix = prev.trim() ? prev.trim() + ' ' : '';
            return prefix + text;
        });
    } else if (voiceModeRef.current === 'direct') {
        if (text.trim()) {
            setIsSending(true);
            setSendSuccess(false);
            try {
                await sendCommandToTmux(text, TMUX_TARGET);
                setSendSuccess(true);
                setTimeout(() => setSendSuccess(false), 2000);
            } catch (error) {
                console.error("Voice command failed", error);
            } finally {
                setIsSending(false);
            }
        }
    }
  }, []);

  const startVoiceRecording = async (mode: 'append' | 'direct') => {
    voiceModeRef.current = mode;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('Speech recognition not supported in this browser');
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
        console.log('Voice recognition started');
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        interimTranscriptRef.current = interimTranscript;

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
        console.log('Voice recognition ended');
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

  // --- English Correction Logic ---
  const handleCorrectEnglish = async () => {
    if (!promptText.trim() || isCorrectingEnglish) return;
    
    setIsCorrectingEnglish(true);
    setCorrectedText('');
    
    try {
      const response = await fetch('/api/correctEnglish', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: promptText })
      });
      
      const data = await response.json();
      
      if (data.success && data.correctedText) {
        setCorrectedText(data.correctedText);
      } else {
        console.error('English correction failed:', data.error);
        alert('Failed to correct English: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('English correction error:', error);
      alert('Failed to correct English. Please check your connection.');
    } finally {
      setIsCorrectingEnglish(false);
    }
  };

  const handleAcceptCorrection = () => {
    if (correctedText) {
      setPromptText(correctedText);
      setCorrectedText('');
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleDismissCorrection = () => {
    setCorrectedText('');
  };

  // Auto-resize panel when corrected text is shown/hidden
  useEffect(() => {
    if (correctedText) {
      // Expand panel height when showing corrected text
      setSettings(prev => ({
        ...prev,
        panelSize: {
          ...prev.panelSize,
          height: Math.max(prev.panelSize.height, 320) // Expand to at least 320px
        }
      }));
    } else {
      // Restore to default height when corrected text is dismissed
      setSettings(prev => ({
        ...prev,
        panelSize: {
          ...prev.panelSize,
          height: 160 // Back to default
        }
      }));
    }
  }, [correctedText]);

  // --- Event Forwarding ---

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // When panel is hidden, don't forward events - let terminal handle them directly
    if (!settings.showPrompt && !settings.showVoiceControl) return;
    
    if (!settings.forwardEvents) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    const mod = e.ctrlKey || e.metaKey;
    if (mod && ['c', 'v', 'a', 'z'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      e.stopPropagation();
      sendShortcut(`ctrl+${e.key.toLowerCase()}`);
      return;
    }

    sendSystemEvent({
      type: 'keydown',
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey
    });
  }, [settings.forwardEvents, settings.showPrompt, settings.showVoiceControl]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // --- Actions ---

  const handleSelectHistory = (command: string) => {
    setPromptText(command);
    setShowHistory(false);
    setHistoryIndex(-1);
    setTempDraft(command);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleDeleteHistory = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setSettings(prev => ({
      ...prev,
      commandHistory: prev.commandHistory.filter((_, idx) => idx !== index)
    }));
  };

  const handleClearAllHistory = () => {
    setSettings(prev => ({
      ...prev,
      commandHistory: []
    }));
  };

  const handleSendPrompt = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!promptText.trim()) return;

    const command = promptText;
    
    setSettings(prev => {
      const currentHistory = prev.commandHistory || [];
      const newHistory = [command, ...currentHistory.filter(cmd => cmd !== command)].slice(0, 50);
      return { ...prev, commandHistory: newHistory };
    });
    setHistoryIndex(-1);
    setTempDraft('');
    
    setPromptText(''); 
    setIsSending(true);
    setSendSuccess(false);

    try {
      await sendCommandToTmux(command, TMUX_TARGET);
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 2000);
    } catch (error) {
      console.error("Failed to send command", error);
    } finally {
      setIsSending(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleTmuxSplitCommand = async (command: string) => {
    setIsSending(true);
    try {
      // Execute the tmux command directly
      await sendCommandToTmux(command, TMUX_TARGET);
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 2000);
    } catch (error) {
      console.error("Failed to execute tmux command", error);
    } finally {
      setIsSending(false);
    }
  };

  const handlePanelChange = (pos: Position, size: Size) => {
    setSettings(prev => ({
      ...prev,
      panelPosition: pos,
      panelSize: size
    }));
  };

  const handleVoiceButtonPosChange = (pos: Position) => {
    setSettings(prev => ({ ...prev, voiceButtonPosition: pos }));
  };

  const toggleEventForwarding = () => {
    setSettings(prev => ({ ...prev, forwardEvents: !prev.forwardEvents }));
  };

  const toggleVoiceMode = () => {
      setSettings(prev => {
          const newVoiceState = !prev.showVoiceControl;
          return {
              ...prev,
              showVoiceControl: newVoiceState,
              showPrompt: !newVoiceState
          };
      });
  };

  // Show loading screen while checking auth
  if (isCheckingAuth) {
    return <div className="bg-black w-screen h-screen flex items-center justify-center">
      <Loader2 size={48} className="text-blue-500 animate-spin" />
    </div>;
  }

  // Show login form if not authenticated
  if (!token) {
    return <LoginForm onLogin={handleLogin} />;
  }

  if (!isLoaded) return <div className="bg-black w-screen h-screen"></div>;

  // Multi-Terminal Mode
  if (multiTerminalMode) {
    return (
      <div className="relative w-screen h-screen bg-black overflow-hidden font-sans">
        <MultiTerminalView
          initialBotName={BOT_NAME}
          token={token}
          isInteracting={isInteracting}
          onInteractionStart={() => setIsInteracting(true)}
          onInteractionEnd={() => setIsInteracting(false)}
          onClose={() => setMultiTerminalMode(false)}
        />
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden font-sans">
      {/* Full Screen Iframe */}
      <div className="absolute inset-0">
        <TtydFrame url={iframeUrl} isInteractingWithOverlay={isInteracting || (!settings.showPrompt && !settings.showVoiceControl)} />
      </div>

      {/* Voice Mode Active - Show button to return to Prompt */}
      {settings.showVoiceControl && (
        <button
            onClick={() => setSettings(prev => ({ ...prev, showPrompt: true, showVoiceControl: false }))}
            className="absolute top-4 right-4 z-40 p-3 bg-blue-600/80 hover:bg-blue-500 text-white rounded-full shadow-lg transition-all backdrop-blur-sm"
            title="返回 Prompt 模式"
        >
            <Terminal size={20} />
        </button>
      )}

      {/* Floating Prompt Controller */}
      {settings.showPrompt && (
          <FloatingPanel
            title=""
            initialPosition={settings.panelPosition}
            initialSize={settings.panelSize}
            minSize={{ width: 340, height: 160 }}
            onInteractionStart={() => setIsInteracting(true)}
            onInteractionEnd={() => setIsInteracting(false)}
            onChange={handlePanelChange}
            headerActions={
                <>
                    {/* Network Status Indicator */}
                    <div 
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-800/50"
                        title={networkLatency !== null ? `Latency: ${networkLatency}ms` : 'Offline'}
                    >
                        {networkStatus === 'excellent' && (
                            <Wifi size={16} className="text-green-400" />
                        )}
                        {networkStatus === 'good' && (
                            <Wifi size={16} className="text-yellow-400" />
                        )}
                        {networkStatus === 'poor' && (
                            <Wifi size={16} className="text-orange-400" />
                        )}
                        {networkStatus === 'offline' && (
                            <WifiOff size={16} className="text-red-400" />
                        )}
                        <span className="text-xs text-gray-400 font-mono">
                            {networkLatency !== null ? `${networkLatency}ms` : 'offline'}
                        </span>
                    </div>

                    {/* Toggle Voice Control - hides prompt panel when clicked */}
                    <button
                        onClick={() => setSettings(prev => ({ ...prev, showPrompt: false, showVoiceControl: true }))}
                        className="p-2 rounded-lg text-gray-400 hover:bg-red-600 hover:text-white transition-all"
                        title="切换到语音模式"
                    >
                        <Mic size={18} />
                    </button>
                </>
            }
          >
            <form onSubmit={handleSendPrompt} className="relative h-full flex flex-col p-2">
              <div className="flex-1 flex flex-col min-h-0">
                <div className="relative flex-1 flex flex-col min-h-0">
                  <textarea
                    ref={textareaRef}
                    value={promptText}
                    onChange={(e) => {
                      setPromptText(e.target.value);
                      if (historyIndex === -1) {
                        setTempDraft(e.target.value);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleSendPrompt();
                      }
                      else if (e.key === 'ArrowUp') {
                        const textarea = e.currentTarget;
                        const cursorPos = textarea.selectionStart;
                        const textBeforeCursor = textarea.value.substring(0, cursorPos);
                        const isOnFirstLine = !textBeforeCursor.includes('\n');
                        
                        if (isOnFirstLine) {
                          e.preventDefault();
                          const history = settings.commandHistory || [];
                          if (history.length > 0) {
                            if (historyIndex === -1) {
                              setTempDraft(promptText);
                              setHistoryIndex(0);
                              setPromptText(history[0]);
                            } else if (historyIndex < history.length - 1) {
                              const newIndex = historyIndex + 1;
                              setHistoryIndex(newIndex);
                              setPromptText(history[newIndex]);
                            }
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
                            setPromptText(settings.commandHistory[newIndex]);
                          } else if (historyIndex === 0) {
                            setHistoryIndex(-1);
                            setPromptText(tempDraft);
                          }
                        }
                      }
                    }}
                    placeholder="Type command..."
                    className="w-full h-full bg-black/50 text-white rounded-lg border border-gray-700 p-2 pr-2 pb-10 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none text-sm shadow-inner placeholder:text-gray-600 placeholder:opacity-50"
                    disabled={isSending}
                  />
                  
                  {/* Button group at bottom-right corner */}
                  <div className="absolute bottom-3 right-2 flex gap-1">
                    {/* English Correction Button */}
                    <button
                        type="button"
                        onClick={handleCorrectEnglish}
                        disabled={!promptText.trim() || isCorrectingEnglish}
                        className="p-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                        title="Correct English with AI"
                    >
                        {isCorrectingEnglish ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <Sparkles size={14} />
                        )}
                    </button>
                    
                    {/* Send button */}
                    <button
                        type="submit"
                        disabled={!promptText.trim() || isSending}
                        className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                    >
                        {isSending ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : sendSuccess ? (
                            <CheckCircle size={14} className="text-green-400" />
                        ) : (
                            <Send size={14} />
                        )}
                    </button>
                  </div>
                </div>

                {/* Corrected Text Display */}
                {correctedText && (
                  <div className="mt-2 p-3 bg-purple-900/30 border border-purple-700 rounded-lg">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <Sparkles size={14} className="text-purple-400 flex-shrink-0" />
                        <span className="text-xs text-purple-300 font-medium">Corrected Text:</span>
                      </div>
                      <button
                        onClick={handleDismissCorrection}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <p className="text-sm text-white mb-3 whitespace-pre-wrap">{correctedText}</p>
                    <button
                      onClick={handleAcceptCorrection}
                      className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-md transition-colors flex items-center justify-center gap-2"
                    >
                      <Check size={14} />
                      Use This Text
                    </button>
                  </div>
                )}

                {/* History List View */}
                {showHistory && (
                  <div className="mt-2 flex-1 overflow-y-auto bg-black/30 rounded-lg border border-gray-700 flex flex-col">
                    {settings.commandHistory && settings.commandHistory.length > 0 ? (
                      <>
                        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-900/50">
                          <span className="text-xs text-gray-400">Command History</span>
                          <button
                            onClick={handleClearAllHistory}
                            className="text-xs text-red-400 hover:text-red-300 transition-colors"
                          >
                            Clear All
                          </button>
                        </div>
                        <div className="divide-y divide-gray-800 overflow-y-auto">
                          {settings.commandHistory.map((cmd, idx) => (
                            <div
                              key={idx}
                              onClick={() => handleSelectHistory(cmd)}
                              className="px-3 py-2 hover:bg-gray-800 cursor-pointer text-gray-300 hover:text-white transition-colors group"
                            >
                              <div className="flex items-center gap-2">
                                <History size={12} className="text-gray-500 flex-shrink-0" />
                                <span className="truncate text-sm flex-1">{cmd}</span>
                                <button
                                  onClick={(e) => handleDeleteHistory(e, idx)}
                                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="px-4 py-3 text-gray-500 text-center text-sm">
                        No command history yet
                      </div>
                    )}
                  </div>
                )}
              </div>
            </form>
          </FloatingPanel>
      )}

      {/* Floating Voice Control Button */}
      {settings.showVoiceControl && (
          <VoiceFloatingButton
            initialPosition={settings.voiceButtonPosition}
            onPositionChange={handleVoiceButtonPosChange}
            onRecordStart={() => startVoiceRecording('direct')}
            onRecordEnd={(shouldSend) => {
                stopVoiceRecording();
            }}
            isRecordingExternal={isListening && voiceModeRef.current === 'direct'}
            isSending={isSending}
            sendSuccess={sendSuccess}
          />
      )}
    </div>
  );
};

export default App;
