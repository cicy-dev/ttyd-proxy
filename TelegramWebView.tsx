import React, { useState, useRef } from 'react';
import { Terminal, ArrowRight } from 'lucide-react';

const LoginForm: React.FC<{ onLogin: (token: string) => void }> = ({ onLogin }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleSubmit = () => {
    const val = inputRef.current?.value?.trim() || '';
    if (!val) return;
    localStorage.setItem('token', val);
    onLogin(val);
  };
  return (
    <div className="w-screen h-screen bg-black flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-80">
        <h2 className="text-white text-lg mb-4 text-center">🔒 Login</h2>
        <input
          ref={inputRef}
          type="password"
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Enter token..."
          className="w-full bg-gray-800 text-white rounded px-3 py-2 border border-gray-600 outline-none mb-3 text-sm"
          autoFocus
        />
        <button onClick={handleSubmit}
          className="w-full py-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm">
          Login
        </button>
      </div>
    </div>
  );
};

const TelegramWebView: React.FC = () => {
  // URL ?token= 自动保存（但不移除，保持 Telegram 模式）
  const urlToken = new URLSearchParams(window.location.search).get('token');
  if (urlToken) {
    localStorage.setItem('token', urlToken);
  }

  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));

  if (!token) return <LoginForm onLogin={setToken} />;

  // Telegram WebView 主界面
  return (
    <div className="w-screen h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-600 rounded-full mb-4">
            <Terminal size={40} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Terminal Control</h1>
          <p className="text-gray-400">Choose your interface</p>
        </div>

        {/* Options */}
        <div className="space-y-4">
          {/* Terminal Mode */}
          <a
            href="#terminal"
            className="block bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-xl p-6 transition-all hover:scale-105 hover:border-blue-500 group"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-white mb-2 flex items-center gap-2">
                  <Terminal size={24} className="text-blue-400" />
                  Advanced Terminal
                </h3>
                <p className="text-gray-400 text-sm">
                  Full-featured terminal with split-screen, voice control, and multi-terminal support
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded">tmux split</span>
                  <span className="text-xs bg-purple-600/20 text-purple-400 px-2 py-1 rounded">multi-terminal</span>
                  <span className="text-xs bg-green-600/20 text-green-400 px-2 py-1 rounded">voice control</span>
                </div>
              </div>
              <ArrowRight size={24} className="text-gray-600 group-hover:text-blue-400 transition-colors ml-4" />
            </div>
          </a>

          {/* Simple Mode (Future) */}
          <div className="block bg-gray-800/30 border border-gray-700/50 rounded-xl p-6 opacity-50 cursor-not-allowed">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-gray-500 mb-2">
                  Simple Mode
                </h3>
                <p className="text-gray-600 text-sm">
                  Coming soon - Simplified interface for Telegram WebView
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-600 pt-4">
          <p>Logged in • Token stored securely</p>
        </div>
      </div>
    </div>
  );
};

export default TelegramWebView;
