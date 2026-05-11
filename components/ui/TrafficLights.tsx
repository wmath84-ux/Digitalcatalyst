import React from 'react';

interface TrafficLightsProps {
  onClose?: () => void;
}

const TrafficLights: React.FC<TrafficLightsProps> = ({ onClose }) => (
  <div className="flex items-center gap-2" aria-label="Window controls">
    <button
      type="button"
      onClick={onClose}
      className="h-3.5 w-3.5 rounded-full bg-[#ff5f57] ring-1 ring-black/10 shadow-sm hover:scale-110 transition-transform"
      aria-label="Close window"
    />
    <span className="h-3.5 w-3.5 rounded-full bg-[#ffbd2e] ring-1 ring-black/10 shadow-sm" aria-hidden="true" />
    <span className="h-3.5 w-3.5 rounded-full bg-[#28c840] ring-1 ring-black/10 shadow-sm" aria-hidden="true" />
  </div>
);

export default TrafficLights;
