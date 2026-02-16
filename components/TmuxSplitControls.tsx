import React from 'react';
import { Columns, Rows, X, Maximize2 } from 'lucide-react';

interface TmuxSplitControlsProps {
  tmuxTarget: string;
  onSplitCommand: (command: string) => void;
}

export const TmuxSplitControls: React.FC<TmuxSplitControlsProps> = ({
  tmuxTarget,
  onSplitCommand
}) => {
  const handleSplitHorizontal = () => {
    // tmux split-window -h creates a vertical split (side by side)
    onSplitCommand(`tmux split-window -h -t ${tmuxTarget}`);
  };

  const handleSplitVertical = () => {
    // tmux split-window -v creates a horizontal split (top and bottom)
    onSplitCommand(`tmux split-window -v -t ${tmuxTarget}`);
  };

  const handleClosePane = () => {
    onSplitCommand(`tmux kill-pane -t ${tmuxTarget}`);
  };

  const handleMaximizePane = () => {
    onSplitCommand(`tmux resize-pane -Z -t ${tmuxTarget}`);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleSplitHorizontal}
        className="p-2 rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white transition-all"
        title="Split Horizontally (Side by Side)"
      >
        <Columns size={18} />
      </button>
      
      <button
        onClick={handleSplitVertical}
        className="p-2 rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white transition-all"
        title="Split Vertically (Top and Bottom)"
      >
        <Rows size={18} />
      </button>

      <button
        onClick={handleMaximizePane}
        className="p-2 rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white transition-all"
        title="Toggle Maximize Pane"
      >
        <Maximize2 size={18} />
      </button>

      <button
        onClick={handleClosePane}
        className="p-2 rounded-lg text-gray-400 hover:bg-red-600 hover:text-white transition-all"
        title="Close Current Pane"
      >
        <X size={18} />
      </button>
    </div>
  );
};
