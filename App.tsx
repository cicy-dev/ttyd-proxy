import React, { useState, useEffect, useRef } from 'react';
import { Send, Terminal, Mic, MicOff } from 'lucide-react';

interface BotInfo {
  bot_name: string;
}

function getUrlParam(key: string): string {
  return new URLSearchParams(window.location.search).get(key) || '';
}

const App: React.FC = () => {
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [activeBot, setActiveBot] = useState<string>(getUrlParam('bot_name') || '');
  const [promptText, setPromptText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<any>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    fetch('/api/bots')
      .then(r => r.json())
      .then((data: BotInfo[]) => {
        setBots(data);
        if (!getUrlParam('bot_name') && data.length > 0) setActiveBot(data[0].bot_name);
      })
      .catch(e => console.error('load bots failed', e));
  }, []);

  useEffect(() => { setIframeKey(k => k + 1); }, [activeBot]);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = false; r.interimResults = true; r.lang = 'zh-CN';
    r.onresult = (e: any) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setPromptText(text);
      if (e.results[0].isFinal) setIsRecording(false);
    };
    r.onerror = () => setIsRecording(false);
    r.onend = () => setIsRecording(false);
    recRef.current = r;
  }, []);

  const toggleRecord = () => {
    if (!recRef.current) return alert('No speech recognition');
    if (isRecording) { recRef.current.stop(); setIsRecording(false); }
    else { recRef.current.start(); setIsRecording(true); }
  };

  const handleSend = async () => {
    if (!promptText.trim() || !activeBot) return;
    const text = promptText;
    setPromptText('');
    setHistory(prev => [...prev, text]);
    setHistoryIdx(-1);
    setIsSending(true);
    try {
      await fetch('/api/tmux', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, bot_name: activeBot }),
      });
    } catch (e) { console.error('Send failed', e); }
    finally {
      setIsSending(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  return (
    <div className="w-screen h-screen bg-black flex flex-col">
      <div style={{height: 40}} className="bg-gray-900 border-b border-gray-700 flex items-center px-4 gap-3 shrink-0">
        <Terminal size={16} className="text-green-400" />
        <select value={activeBot} onChange={e => setActiveBot(e.target.value)}
          className="bg-gray-800 text-white text-sm rounded px-3 py-1 border border-gray-600 outline-none">
          {bots.map(b => (
            <option key={b.bot_name} value={b.bot_name}>{b.bot_name}</option>
          ))}
        </select>
        <span className="text-gray-500 text-xs">{bots.length} bots</span>
      </div>
      <div className="flex-1 min-h-0">
        {activeBot && <iframe key={iframeKey} src={`/ttyd/${activeBot}/`} title={activeBot} className="w-full h-full border-none" />}
      </div>
      <div className="bg-gray-900/95 border-t border-gray-700 p-2 shrink-0">
        <div className="flex items-center gap-2">
          <button type="button" onClick={toggleRecord}
            className={`p-2 rounded ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-700 hover:bg-gray-600'} text-white`}>
            {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <textarea ref={textareaRef} value={promptText}
            onChange={e => setPromptText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend(); }
              if (e.key === 'ArrowUp' && history.length > 0) {
                e.preventDefault();
                const idx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
                setHistoryIdx(idx); setPromptText(history[idx]);
              }
              if (e.key === 'ArrowDown' && historyIdx !== -1) {
                e.preventDefault();
                if (historyIdx >= history.length - 1) { setHistoryIdx(-1); setPromptText(''); }
                else { const idx = historyIdx + 1; setHistoryIdx(idx); setPromptText(history[idx]); }
              }
            }}
            rows={1} placeholder="输入消息..." disabled={isSending}
            className="flex-1 bg-gray-800 text-white rounded px-3 py-2 border border-gray-600 outline-none resize-none text-sm" />
          <button type="button" onClick={() => handleSend()} disabled={!promptText.trim() || isSending}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded disabled:opacity-50 text-sm flex items-center gap-1">
            <Send size={14} /> 发送
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
