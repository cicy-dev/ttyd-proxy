import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

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

const Root: React.FC = () => {
  // URL ?token= 自动保存
  const urlToken = new URLSearchParams(window.location.search).get('token');
  if (urlToken) {
    localStorage.setItem('token', urlToken);
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    window.history.replaceState({}, '', url.pathname + url.search);
  }

  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));

  if (!token) return <LoginForm onLogin={setToken} />;
  return <App />;
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
