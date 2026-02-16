export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface AppSettings {
  panelPosition: Position;
  panelSize: Size;
  forwardEvents: boolean;
  lastDraft?: string;
  showPrompt: boolean;
  showVoiceControl: boolean;
  voiceButtonPosition: Position;
  commandHistory: string[];
}

export interface SystemEvent {
  type: 'keydown' | 'keyup';
  key: string;
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}
