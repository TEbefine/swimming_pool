import React from 'react';
import './GameBoyShutDown.css';

interface GameBoyShutDownProps {
  onStart: () => void;
  isMobile?: boolean;
}

export const GameBoyShutDown: React.FC<GameBoyShutDownProps> = ({ onStart }) => {
  return (
    <div
      className="gb-shutdown ls-ready ls-root"
      onClick={onStart}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter' || e.code === 'KeyM' || e.code === 'KeyP') {
          e.preventDefault();
          onStart();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="press on start to open"
    >
      <span className="gb-shutdown-line">press on start to open</span>
    </div>
  );
};
