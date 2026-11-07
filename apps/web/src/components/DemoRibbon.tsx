import { Sparkles } from 'lucide-react';

export function DemoRibbon() {
  const isDemo =
    import.meta.env.VITE_DEMO_MODE === 'true' ||
    import.meta.env.DEMO_MODE === 'true' ||
    (typeof window !== 'undefined' &&
      (window.location.search.includes('demo=true') ||
        sessionStorage.getItem('housy_demo_mode') === 'true'));

  if (!isDemo) return null;

  return (
    <div
      role="status"
      aria-label="Demo mode announcement"
      className="bg-amber-500/15 border-b border-amber-500/30 text-amber-900 dark:text-amber-200 text-[11px] font-medium py-1 px-4 text-center flex items-center justify-center gap-2 select-none"
    >
      <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
      <span>
        <strong>Demo Data Mode Active:</strong> Synthetic portfolio data for Aaranya Realty (The Palm Serene & Skyline Greens) · Ahmedabad.
      </span>
    </div>
  );
}
export default DemoRibbon;
