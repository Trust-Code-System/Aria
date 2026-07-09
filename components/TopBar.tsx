import React from 'react';

interface TopBarProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function TopBar({ title, description, actions }: TopBarProps) {
  return (
    <header className="flex justify-between items-center mb-xl relative z-10">
      <div>
        <h2 className="font-display-lg text-display-lg text-on-surface mb-xs">{title}</h2>
        {description && (
          <p className="font-body-base text-body-base text-on-surface-variant">{description}</p>
        )}
      </div>
      <div className="flex gap-md items-center">
        {actions}
        <button className="w-10 h-10 rounded-full border border-outline-variant flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors">
          <span className="material-symbols-outlined">notifications</span>
        </button>
      </div>
    </header>
  );
}
