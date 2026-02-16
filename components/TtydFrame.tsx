import React from 'react';

interface TtydFrameProps {
  url: string;
  isInteractingWithOverlay: boolean;
}

export const TtydFrame: React.FC<TtydFrameProps> = ({ url, isInteractingWithOverlay }) => {
  return (
    <div className="absolute inset-0 z-0 bg-black overflow-hidden">
      {url ? (
        <iframe
          src={url}
          title="ttyd"
          className={`w-full h-full border-none absolute inset-0 ${isInteractingWithOverlay ? 'pointer-events-none opacity-90' : 'pointer-events-auto opacity-100'}`}
          allowFullScreen
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-500">
          <p className="text-xl">No URL configured</p>
        </div>
      )}
    </div>
  );
};
