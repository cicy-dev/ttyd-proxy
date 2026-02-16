import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Send, Mic, Terminal, Keyboard } from 'lucide-react';
import { TtydFrame } from './components/TtydFrame';
import { FloatingPanel } from './components/FloatingPanel';
import { VoiceFloatingButton } from './components/VoiceFloatingButton';
import { sendCommandToTmux, sendSystemEvent, sendShortcut } from './services/mockApi';
import { AppSettings, Position, Size } from './types';

// 从 URL query 获取参数
const BOT_NAME = new URLSearchParams(window.location.search).get('bot_name') || 'cicy_master_xk_bot';
const TMUX_TARGET = `master:${BOT_NAME}.0`;
const IFRAME_URL = `/ttyd/${BOT_NAME}/`;

const DEFAULT_SETTINGS: AppSettings = {
  panelPosition: { x: 20, y: 20 },
  panelSize: { width: 450, height: 188 },
  forwardEvents: false,
  lastDraft: '',
  showPrompt: true,
  showVoiceControl: false,
  voiceButtonPosition: { x: 40, y: 200 }
};

const STORAGE_KEY = 'vnc_app_settings_v8';

const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const voiceModeRef = useRef<'append' | 'direct'>('append');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Initialization & Persistence ---
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        if (parsed.lastDraft) setPromptText(parsed.lastDraft);
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
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

  // --- Voice Input Logic ---
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleVoiceResult = useCallback(async (text: string) => {
    if (voiceModeRef.current === 'append') {
      setPromptText(prev => {
        const prefix = prev.trim() ? prev.trim() + ' ' : '';
        return prefix + text;
      });
    } else if (voiceModeRef.current === 'direct') {
      if (text.trim()) {
        setIsSending(true);
        try { await sendCommandToTmux(text, TMUX_TARGET); }
        catch (error) { console.error("Voice command failed", error); }
        finally { setIsSending(false); }
      }
    }
  }, []);

  const startVoiceRecording = async (mode: 'append' | 'direct') => {
    voiceModeRef.current = mode;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (blob.size < 1000) return;
        setIsListening(false);
        try {
          const res = await fetch('/api/voice', { method: 'POST', body: blob, headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') } });
          const data = await res.json();
          if (data.text) handleVoiceResult(data.text);
        } catch (e) { console.error('Voice upload failed', e); }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsListening(true);
    } catch (e) { console.error('Mic access failed', e); }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop();
  };

  // --- Event Forwarding ---
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
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
    sendSystemEvent({ type: 'keydown', key: e.key, code: e.code, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey });
  }, [settings.forwardEvents]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // --- Actions ---
  const handleSendPrompt = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!promptText.trim()) return;
    const command = promptText;
    setPromptText('');
    setIsSending(true);
    try { await sendCommandToTmux(command, TMUX_TARGET); }
    catch (error) { console.error("Failed to send command", error); }
    finally { setIsSending(false); setTimeout(() => textareaRef.current?.focus(), 50); }
  };

  const handlePanelChange = (pos: Position, size: Size) => {
    setSettings(prev => ({ ...prev, panelPosition: pos, panelSize: size }));
  };

  const toggleEventForwarding = () => {
    setSettings(prev => ({ ...prev, forwardEvents: !prev.forwardEvents }));
  };

  const toggleVoiceMode = () => {
    setSettings(prev => ({ ...prev, showVoiceControl: !prev.showVoiceControl, showPrompt: prev.showVoiceControl }));
  };

  if (!isLoaded) return <div className="bg-black w-screen h-screen"></div>;

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden font-sans">
      <TtydFrame url={IFRAME_URL} isInteractingWithOverlay={isInteracting} />

      {!settings.showPrompt && (
        <div className="absolute top-4 right-4 z-40 flex gap-2">
          <button onClick={toggleVoiceMode}
            className={`flex items-center gap-2 px-4 py-2 rounded-full shadow-lg transition-all ${settings.showVoiceControl ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
            <Mic size={18} /><span className="font-medium hidden md:inline">Voice</span>
          </button>
          <button onClick={() => setSettings(prev => ({ ...prev, showPrompt: true, showVoiceControl: false }))}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-lg transition-all">
            <Terminal size={18} /><span className="font-medium">Prompt</span>
          </button>
        </div>
      )}

      {settings.showPrompt && (
        <FloatingPanel
          title={`${BOT_NAME} 🖥`}
          initialPosition={settings.panelPosition}
          initialSize={settings.panelSize}
          minSize={{ width: 340, height: 180 }}
          onInteractionStart={() => setIsInteracting(true)}
          onInteractionEnd={() => setIsInteracting(false)}
          onChange={handlePanelChange}
          onClose={() => setSettings(prev => ({ ...prev, showPrompt: false }))}
          headerActions={<>
            <button onClick={toggleVoiceMode}
              className={`p-2 rounded-lg transition-all ${settings.showVoiceControl ? 'bg-red-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}
              title="Voice Mode"><Mic size={18} /></button>
            <button onClick={toggleEventForwarding}
              className={`p-2 rounded-lg transition-all ${settings.forwardEvents ? 'bg-green-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}
              title={settings.forwardEvents ? "Event Forwarding Active" : "Enable Event Forwarding"}><Keyboard size={18} /></button>
          </>}
        >
          <form onSubmit={handleSendPrompt} className="relative h-full flex flex-col p-4">
            <textarea ref={textareaRef} value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSendPrompt(); } }}
              placeholder="Type a command to send..."
              className="flex-1 w-full bg-black/50 text-white rounded-lg border border-gray-700 p-3 pr-16 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none text-base shadow-inner"
              disabled={isSending} />
            <div className="absolute bottom-6 right-6">
              <button type="submit" disabled={!promptText.trim() || isSending}
                className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg">
                <Send size={16} /></button>
            </div>
          </form>
        </FloatingPanel>
      )}

      {settings.showVoiceControl && (
        <VoiceFloatingButton
          initialPosition={settings.voiceButtonPosition}
          onPositionChange={(pos) => setSettings(prev => ({ ...prev, voiceButtonPosition: pos }))}
          onRecordStart={() => startVoiceRecording('direct')}
          onRecordEnd={() => stopVoiceRecording()}
          isRecordingExternal={isListening && voiceModeRef.current === 'direct'}
        />
      )}
    </div>
  );
};

export default App;
