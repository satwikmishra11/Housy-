import React from 'react';
import { useTranslation } from 'react-i18next';
import { supportedLanguages, changeAppLanguage, type SupportedLanguageCode } from '../i18n/index.js';
import { Globe } from 'lucide-react';

interface LanguageSwitcherProps {
  className?: string;
  compact?: boolean;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  className = '',
  compact = false,
}) => {
  const { i18n } = useTranslation();
  const currentLang = (i18n.language || 'en').slice(0, 2) as SupportedLanguageCode;

  const handleLanguageChange = (code: SupportedLanguageCode) => {
    void changeAppLanguage(code);
  };

  return (
    <div
      role="group"
      aria-label="Language selection"
      className={`inline-flex items-center p-1 rounded-xl bg-surface border border-hairline shadow-subtle ${className}`}
    >
      <div className="flex items-center pl-2 pr-1.5 text-muted pointer-events-none" aria-hidden="true">
        <Globe className="w-4 h-4 text-muted" />
      </div>
      <div className="flex items-center gap-1">
        {supportedLanguages.map((lang) => {
          const isActive = currentLang === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => handleLanguageChange(lang.code)}
              aria-pressed={isActive}
              aria-label={`Switch language to ${lang.label}`}
              className={`min-h-[44px] min-w-[44px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center ${
                isActive
                  ? 'bg-accent text-white font-semibold'
                  : 'text-ink/80 hover:text-ink hover:bg-background'
              }`}
            >
              {compact ? lang.code.toUpperCase() : lang.nativeName}
            </button>
          );
        })}
      </div>
    </div>
  );
};
