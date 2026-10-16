import React from 'react';
import './GameBoyShutDown.css';

interface GameBoyShutDownProps {
  onStart: () => void;
  isMobile?: boolean;
}

export const GameBoyShutDown: React.FC<GameBoyShutDownProps> = ({ onStart, isMobile }) => {
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
      aria-label="Game Boy Shut Down. Press START to open."
    >
      <div className="gb-shutdown-content">
        <div className="gb-shutdown-badge">
          <span className="gb-shutdown-dot" />
          <span>GAME BOY SHUT DOWN</span>
        </div>

        <div className="gb-shutdown-prompt">
          <span className="gb-shutdown-arrow">▶</span>
          <span>PRESS START TO OPEN</span>
          <span className="gb-shutdown-arrow">◀</span>
        </div>

        <div className="gb-shutdown-hint">
          {isMobile ? '[ TAP SCREEN OR PRESS START ]' : '[ PRESS SPACE, ENTER OR START ]'}
        </div>
      </div>
    </div>
  );
};
