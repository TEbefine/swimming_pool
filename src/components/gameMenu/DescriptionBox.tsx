import React from 'react';

interface DescriptionBoxProps {
  /** Item name (Bag). The field menu shows text only. */
  title?: string;
  text: string;
  /** Small gold line under the text (energy, prices…). */
  meta?: string;
  icon?: string;
  /** The text is the result of an action. */
  feedback?: boolean;
  className?: string;
}

/** The framed description box. Its text changes the moment the cursor moves. */
export const DescriptionBox: React.FC<DescriptionBoxProps> = ({ title, text, meta, icon, feedback, className = '' }) => (
  <div className={`gm-frame gm-desc ${className}`} aria-live="polite">
    {icon && (
      <div className="gm-desc-icon">
        <img src={icon} alt="" draggable={false} />
      </div>
    )}
    <div className="gm-desc-body">
      {title && <div className="gm-desc-name">{title}</div>}
      <p className={`gm-desc-text${feedback ? ' is-feedback' : ''}`}>{text}</p>
      {meta && !feedback && <div className="gm-desc-meta">{meta}</div>}
    </div>
  </div>
);
