import React from 'react';
import { LanguageSwitcher } from '../components/LanguageSwitcher.js';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Building2 } from 'lucide-react';

export interface BuyerLayoutProps {
  children: React.ReactNode;
  projectName?: string;
  className?: string;
}

export const BuyerLayout: React.FC<BuyerLayoutProps> = ({
  children,
  projectName = 'Project 1 & Project 2',
  className = '',
}) => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background text-ink flex flex-col antialiased">
      {/* Top Buyer Header */}
      <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-md border-b border-hairline">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center font-serif font-bold text-base select-none">
              H
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-ink text-sm sm:text-base leading-none">
                  {t('common.appName', 'Housy')}
                </span>
                <span className="text-muted text-xs">·</span>
                <span className="text-xs text-muted font-medium truncate max-w-[140px] sm:max-w-none">
                  {projectName}
                </span>
              </div>
              <span className="text-[11px] text-muted flex items-center gap-1 mt-0.5">
                <Building2 className="w-3 h-3 text-accent" />
                {t('common.developer', 'Company A, Ahmedabad')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher compact />
          </div>
        </div>
      </header>

      {/* Main Single Column Buyer Content */}
      <main className={`flex-1 max-w-2xl w-full mx-auto px-4 py-6 sm:py-8 ${className}`}>
        {children}
      </main>

      {/* Regulatory & Trust Footer */}
      <footer className="border-t border-hairline bg-surface mt-auto py-8">
        <div className="max-w-2xl mx-auto px-4 flex flex-col gap-4 text-xs text-muted">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <p className="font-medium text-ink">
                {t('common.rera', 'RERA Reg: PR/GJ/AHMEDABAD/AUDA/RAA01234/011126')}
              </p>
              <p className="leading-relaxed">
                {t(
                  'common.dpdpConsent',
                  'Buyer numbers are personal data protected under the Digital Personal Data Protection (DPDP) Act 2023. Contact strictly with consent and honoured opt-outs.',
                )}
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-hairline flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px]">
            <span>© 2026 Company A, Ahmedabad. All rights reserved.</span>
            <span>2 & 3 BHK Premium Residences · ₹65L – ₹1.2 Cr</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
