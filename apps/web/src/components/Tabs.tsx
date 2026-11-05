import React, { useId } from 'react';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
  variant?: 'underline' | 'pill';
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = '',
  variant = 'underline',
}) => {
  const baseId = useId();

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    const enabledTabs = tabs.filter((t) => !t.disabled);
    const currentIndex = enabledTabs.findIndex((t) => t.id === tabs[index]?.id);

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextTab = enabledTabs[(currentIndex + 1) % enabledTabs.length];
      if (nextTab) onChange(nextTab.id);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevTab = enabledTabs[(currentIndex - 1 + enabledTabs.length) % enabledTabs.length];
      if (prevTab) onChange(prevTab.id);
    } else if (e.key === 'Home') {
      e.preventDefault();
      const firstTab = enabledTabs[0];
      if (firstTab) onChange(firstTab.id);
    } else if (e.key === 'End') {
      e.preventDefault();
      const lastTab = enabledTabs[enabledTabs.length - 1];
      if (lastTab) onChange(lastTab.id);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Tabs"
      className={`flex items-center gap-2 overflow-x-auto no-scrollbar ${
        variant === 'underline'
          ? 'border-b border-hairline'
          : 'p-1 rounded-xl bg-background border border-hairline'
      } ${className}`}
    >
      {tabs.map((tab, idx) => {
        const isActive = activeTab === tab.id;
        const tabId = `${baseId}-tab-${tab.id}`;
        const panelId = `${baseId}-panel-${tab.id}`;

        if (variant === 'pill') {
          return (
            <button
              key={tab.id}
              role="tab"
              id={tabId}
              aria-controls={panelId}
              aria-selected={isActive}
              disabled={tab.disabled}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={`min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                isActive
                  ? 'bg-surface text-ink shadow-subtle font-semibold'
                  : 'text-muted hover:text-ink hover:bg-surface/50'
              } ${tab.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge && <span className="ml-1">{tab.badge}</span>}
            </button>
          );
        }

        return (
          <button
            key={tab.id}
            role="tab"
            id={tabId}
            aria-controls={panelId}
            aria-selected={isActive}
            disabled={tab.disabled}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`min-h-[44px] px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              isActive
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-muted hover:text-ink hover:border-hairline'
            } ${tab.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge && <span className="ml-1">{tab.badge}</span>}
          </button>
        );
      })}
    </div>
  );
};

