import { SystemEvent } from '../types';

const getToken = () => localStorage.getItem('token') || '';
const authHeaders = () => ({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() });

// 发送命令到 tmux
export const sendCommandToTmux = async (command: string, tmuxTarget: string): Promise<{ success: boolean; message: string }> => {
  const res = await fetch('/api/tmux', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ text: command, target: tmuxTarget }),
  });
  const data = await res.json();
  return { success: data.success, message: data.success ? 'Sent to tmux' : data.error };
};

// 转发键盘事件
export const sendSystemEvent = async (event: SystemEvent): Promise<void> => {
  if (event.type === 'keydown') {
    await fetch('/api/key', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ key: event.code }),
    }).catch(() => {});
  }
};

// 转发快捷键
export const sendShortcut = async (key: string): Promise<void> => {
  await fetch('/api/key', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ key }),
  }).catch(() => {});
};
