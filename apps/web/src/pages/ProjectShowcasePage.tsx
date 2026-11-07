import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  MapPin,
  Calendar,
  ShieldCheck,
  Compass,
  ArrowRight,
  MessageSquare,
  Sparkles,
  Car,
  Trees,
  Dumbbell,
  Waves,
  Zap,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { fetchProjectBySlug, type ProjectDetail } from '../lib/api';

export function ProjectShowcasePage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const { i18n } = useTranslation();
  const currentLang = i18n.language || 'en';

  const srcParam = searchParams.get('src') || '';
  const chatQuery = new URLSearchParams();
  if (srcParam) chatQuery.set('src', srcParam);

  const {
    data: project,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ProjectDetail>({
    queryKey: ['project-showcase', slug],
    queryFn: () => {
      if (!slug) throw new Error('Project slug is required');
      return fetchProjectBySlug(slug);
    },
    enabled: Boolean(slug),
  });

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('housy_preferred_lang', lang);
  };

  // 1. Loading State: Skeleton Loader
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-ink antialiased p-6 sm:p-12">
        <div className="max-w-5xl mx-auto space-y-8 animate-pulse">
          <div className="h-10 w-48 bg-hairline rounded-lg" />
          <div className="h-80 w-full bg-hairline rounded-2xl" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="h-40 bg-hairline rounded-xl" />
            <div className="h-40 bg-hairline rounded-xl" />
            <div className="h-40 bg-hairline rounded-xl" />
          </div>
          <div className="h-64 w-full bg-hairline rounded-2xl" />
        </div>
      </div>
    );
  }

  // 2. Error State: Friendly retry card
  if (isError || !project) {
    return (
      <div className="min-h-screen bg-background text-ink flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-surface border border-hairline rounded-2xl p-8 text-center shadow-card space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center">
            <Building2 className="w-7 h-7" />
          </div>
          <h2 className="font-serif text-2xl font-bold text-ink">Project Not Found</h2>
          <p className="text-sm text-muted">
            {error instanceof Error ? error.message : 'The requested project could not be located in our verified portfolio.'}
          </p>
          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={() => refetch()}
              className="px-4 py-2.5 rounded-xl bg-accent text-white font-medium text-sm hover:opacity-90 transition-opacity"
            >
              Retry
            </button>
            <Link
              to="/"
              className="px-4 py-2.5 rounded-xl border border-hairline text-ink font-medium text-sm hover:bg-background transition-colors"
            >
              Return Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const chatUrl = `/chat?project=${project.id}${srcParam ? `&src=${encodeURIComponent(srcParam)}` : ''}`;
  const bookUrl = `${chatUrl}&action=book`;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${project.lat},${project.lng}`;

  return (
    <div className="min-h-screen bg-background text-ink antialiased flex flex-col">
      {/* NAVIGATION BAR */}
      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-md border-b border-hairline shadow-subtle px-4 sm:px-8 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-accent text-white flex items-center justify-center font-serif font-bold text-base shadow-sm">
              H
            </div>
            <div>
              <span className="font-serif font-bold text-lg text-ink group-hover:text-accent transition-colors">
                Housy
              </span>
              <span className="text-[11px] text-muted block -mt-1">Aaranya Realty, Ahmedabad</span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            {/* Language Switcher */}
            <div className="inline-flex rounded-lg border border-hairline bg-surface p-0.5">
              {[
                { code: 'en', label: 'EN' },
                { code: 'hi', label: 'हिन्दी' },
                { code: 'gu', label: 'ગુજરાતી' },
              ].map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => handleLanguageChange(l.code)}
                  aria-pressed={currentLang === l.code}
                  className={`px-2 py-1 text-xs rounded-md font-medium transition-colors ${
                    currentLang === l.code ? 'bg-accent text-white shadow-xs' : 'text-muted hover:text-ink'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>

            <Link
              to={chatUrl}
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:opacity-90 transition-opacity shadow-sm"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chat Advisor
            </Link>
          </div>
        </div>
      </header>

      {/* MAIN SHOWCASE CONTENT */}
      <main className="flex-1 pb-24 sm:pb-16">
        {/* HERO SECTION: Pure CSS & SVG Architectural Elevation (No Stock Photos) */}
        <section className="relative overflow-hidden bg-gradient-to-b from-stone-900 via-stone-900 to-stone-950 text-white py-16 sm:py-24 px-4 sm:px-8 border-b border-stone-800">
          {/* Architectural Blueprint Background Grid */}
          <div className="absolute inset-0 opacity-15 pointer-events-none">
            <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="arch-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#C5A880" strokeWidth="0.5" strokeDasharray="2,2" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#arch-grid)" />
            </svg>
          </div>

          <div className="max-w-6xl mx-auto relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Headlines & Brand Attributes */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/20 border border-accent/40 text-accent text-xs font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Verified Official Fact Sheet</span>
              </div>

              <div className="space-y-3">
                <p className="text-xs sm:text-sm font-semibold tracking-widest uppercase text-[#C5A880]">
                  Aaranya Realty · Ahmedabad
                </p>
                <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight">
                  {project.displayName}
                </h1>
                <p className="text-lg sm:text-xl text-stone-300 font-light leading-relaxed">
                  {project.tagline}
                </p>
              </div>

              {/* RERA and Address metadata */}
              <div className="pt-2 flex flex-col sm:flex-row gap-4 sm:gap-6 text-xs text-stone-300 border-t border-stone-800/80">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>RERA: {project.reraNumber}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#C5A880] flex-shrink-0" />
                  <span>{project.address}</span>
                </div>
              </div>

              {/* Verified Price Range Highlight */}
              <div className="p-5 rounded-2xl bg-stone-800/70 border border-stone-700/80 backdrop-blur-sm space-y-2">
                <div className="text-xs uppercase tracking-wider text-stone-400 font-medium">
                  Verified Pricing Range (Fact Sheet)
                </div>
                <div className="text-3xl sm:text-4xl font-serif font-bold text-[#F7F5F0]">
                  {project.priceRange}
                </div>
                <p className="text-[11px] text-stone-400">
                  Exact pricing varies by floor and unit orientation. Quoted strictly from developer fact sheets with zero artificial AI discounts.
                </p>
              </div>

              {/* CTAs */}
              <div className="flex flex-wrap gap-4 pt-2">
                <Link
                  to={chatUrl}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-accent text-white font-medium text-sm hover:opacity-90 transition-opacity shadow-lg shadow-accent/25"
                >
                  <MessageSquare className="w-4 h-4" />
                  Chat With Advisor
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to={bookUrl}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-surface/20 border border-stone-700 text-stone-200 hover:text-white hover:bg-surface/30 font-medium text-sm transition-colors"
                >
                  <Calendar className="w-4 h-4 text-accent" />
                  Book Private Site Visit
                </Link>
              </div>
            </div>

            {/* Right Column: Architectural Elevation SVG Graphic */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="w-full max-w-md aspect-square rounded-3xl bg-gradient-to-tr from-stone-950 via-stone-900 to-stone-800/90 border border-stone-700/60 p-6 flex flex-col justify-between shadow-2xl relative">
                {/* Architectural Pure SVG Art */}
                <div className="flex-1 flex items-center justify-center relative">
                  <svg
                    viewBox="0 0 320 320"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-full h-full max-h-72"
                    aria-label="Architectural elevation wireframe diagram"
                    role="img"
                  >
                    {/* Sky / subtle architectural grid */}
                    <line x1="20" y1="280" x2="300" y2="280" stroke="#C5A880" strokeWidth="2" />
                    <line x1="20" y1="288" x2="300" y2="288" stroke="#44403C" strokeWidth="1" strokeDasharray="4,4" />

                    {/* Tower 1: Tall Geometric Residence */}
                    <rect x="50" y="60" width="90" height="220" rx="3" stroke="#C5A880" strokeWidth="1.5" fill="#1C1917" fillOpacity="0.8" />
                    {/* Tower 1 Balconies and Cantilevers */}
                    <line x1="45" y1="90" x2="145" y2="90" stroke="#C5A880" strokeWidth="1.2" />
                    <line x1="45" y1="120" x2="145" y2="120" stroke="#C5A880" strokeWidth="1.2" />
                    <line x1="45" y1="150" x2="145" y2="150" stroke="#C5A880" strokeWidth="1.2" />
                    <line x1="45" y1="180" x2="145" y2="180" stroke="#C5A880" strokeWidth="1.2" />
                    <line x1="45" y1="210" x2="145" y2="210" stroke="#C5A880" strokeWidth="1.2" />
                    <line x1="45" y1="240" x2="145" y2="240" stroke="#C5A880" strokeWidth="1.2" />
                    <rect x="65" y="75" width="25" height="190" stroke="#C5A880" strokeWidth="0.8" strokeDasharray="2,2" />
                    <rect x="100" y="75" width="25" height="190" stroke="#C5A880" strokeWidth="0.8" strokeDasharray="2,2" />

                    {/* Sky Lounge & Pergola on Tower 1 */}
                    <path d="M 45 60 L 95 35 L 145 60 Z" stroke="#E7D8C5" strokeWidth="1.5" fill="#292524" />
                    <line x1="70" y1="47" x2="120" y2="47" stroke="#C5A880" strokeWidth="1" />

                    {/* Tower 2: Stepped Podium & Green Terraces */}
                    <rect x="155" y="110" width="115" height="170" rx="3" stroke="#A8A29E" strokeWidth="1.5" fill="#1C1917" fillOpacity="0.9" />
                    <line x1="155" y1="140" x2="270" y2="140" stroke="#A8A29E" strokeWidth="1" />
                    <line x1="155" y1="170" x2="270" y2="170" stroke="#A8A29E" strokeWidth="1" />
                    <line x1="155" y1="200" x2="270" y2="200" stroke="#A8A29E" strokeWidth="1" />
                    <line x1="155" y1="230" x2="270" y2="230" stroke="#A8A29E" strokeWidth="1" />

                    {/* Terraced Sky Garden */}
                    <path d="M 205 85 L 270 85 L 270 110 L 205 110 Z" stroke="#10B981" strokeWidth="1.2" fill="#064E3B" fillOpacity="0.6" />
                    <circle cx="220" cy="98" r="4" fill="#34D399" />
                    <circle cx="235" cy="95" r="5" fill="#10B981" />
                    <circle cx="252" cy="98" r="4" fill="#34D399" />

                    {/* Central Glass Atrium / Connector */}
                    <rect x="140" y="190" width="15" height="90" stroke="#38BDF8" strokeWidth="1" fill="#0C4A6E" fillOpacity="0.5" />
                    <line x1="140" y1="220" x2="155" y2="220" stroke="#38BDF8" strokeWidth="0.8" />
                    <line x1="140" y1="250" x2="155" y2="250" stroke="#38BDF8" strokeWidth="0.8" />

                    {/* Landscaped Podium Trees */}
                    <path d="M 35 280 C 35 265 42 265 42 280 Z" fill="#10B981" />
                    <path d="M 285 280 C 285 260 295 260 295 280 Z" fill="#10B981" />
                  </svg>
                </div>

                <div className="pt-4 border-t border-stone-800 flex items-center justify-between text-xs text-stone-400">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Under Construction</span>
                  </div>
                  <span>Possession: {project.possessionDate?.split('as')[0]?.trim() || 'Dec 2026'}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: CONFIGURATION & RESIDENCE SPECIFICATIONS */}
        <section className="py-16 px-4 sm:px-8 max-w-6xl mx-auto space-y-8">
          <div className="space-y-2 text-center sm:text-left">
            <h2 className="font-serif text-3xl font-bold text-ink">
              Residence Configurations & Floor Plans
            </h2>
            <p className="text-sm text-muted">
              Authentic unit dimensions and carpet areas certified under AUDA RERA guidelines.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {project.configurations.map((config) => (
              <div
                key={config.type}
                className="bg-surface border border-hairline rounded-2xl p-6 sm:p-8 space-y-6 shadow-subtle hover:border-accent/40 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-accent-soft text-accent">
                      {config.type}
                    </span>
                    <h3 className="font-serif text-2xl font-bold text-ink mt-2">
                      {config.carpetArea}
                    </h3>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted block">Fact Sheet Range</span>
                    <span className="font-serif text-xl font-bold text-accent">{config.priceRange}</span>
                  </div>
                </div>

                <div className="border-t border-hairline pt-4 space-y-3">
                  <div className="text-xs uppercase tracking-wider text-muted font-semibold">
                    Layout Details
                  </div>
                  <p className="text-sm text-ink leading-relaxed">{config.specs}</p>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <Link
                    to={`${chatUrl}&wants=${encodeURIComponent(config.type)}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
                  >
                    Enquire about {config.type}
                    <ChevronRight className="w-4 h-4" />
                  </Link>

                  <Link
                    to={`${bookUrl}&wants=${encodeURIComponent(config.type)}`}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-medium border border-hairline hover:bg-background transition-colors"
                  >
                    Book Tour
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 3: CURATED AMENITIES & LIFESTYLE */}
        <section className="py-16 px-4 sm:px-8 bg-surface border-y border-hairline">
          <div className="max-w-6xl mx-auto space-y-10">
            <div className="space-y-2 text-center sm:text-left">
              <h2 className="font-serif text-3xl font-bold text-ink">
                Clubhouse & Curated Amenities
              </h2>
              <p className="text-sm text-muted">
                World-class sports, wellness, and leisure facilities exclusively for residents.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {project.amenities.map((item) => (
                <div
                  key={item.key}
                  className="bg-background/60 border border-hairline rounded-xl p-5 space-y-3 shadow-xs"
                >
                  <div className="w-10 h-10 rounded-lg bg-accent-soft text-accent flex items-center justify-center">
                    {item.key.includes('pool') ? (
                      <Waves className="w-5 h-5" />
                    ) : item.key.includes('gym') ? (
                      <Dumbbell className="w-5 h-5" />
                    ) : item.key.includes('green') ? (
                      <Trees className="w-5 h-5" />
                    ) : item.key.includes('park') ? (
                      <Car className="w-5 h-5" />
                    ) : item.key.includes('security') ? (
                      <ShieldCheck className="w-5 h-5" />
                    ) : item.key.includes('power') ? (
                      <Zap className="w-5 h-5" />
                    ) : (
                      <Sparkles className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-semibold text-ink text-sm">{item.title}</h4>
                    <p className="text-xs text-muted mt-1 leading-relaxed">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 4: LOCATION, CONNECTIVITY & MAPS */}
        <section className="py-16 px-4 sm:px-8 max-w-6xl mx-auto space-y-8">
          <div className="space-y-2 text-center sm:text-left">
            <h2 className="font-serif text-3xl font-bold text-ink">
              Location & Strategic Connectivity
            </h2>
            <p className="text-sm text-muted">
              Prime residential corridor in Ahmedabad with effortless transit to highways, healthcare, and metro.
            </p>
          </div>

          <div className="bg-surface border border-hairline rounded-2xl p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
            <div className="lg:col-span-2 space-y-6">
              <div className="space-y-3">
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-ink text-base">{project.address}</h4>
                    <p className="text-xs text-muted mt-0.5">Latitude: {project.lat} · Longitude: {project.lng}</p>
                  </div>
                </div>

                {project.locationLandmarks && (
                  <div className="p-4 rounded-xl bg-background border border-hairline text-xs text-ink space-y-1">
                    <div className="font-semibold text-muted uppercase tracking-wider text-[10px]">
                      Key Landmark Distances
                    </div>
                    <div>{project.locationLandmarks}</div>
                  </div>
                )}

                {project.transitConnectivity && (
                  <div className="p-4 rounded-xl bg-background border border-hairline text-xs text-ink space-y-1">
                    <div className="font-semibold text-muted uppercase tracking-wider text-[10px]">
                      Transit Connectivity
                    </div>
                    <div>{project.transitConnectivity}</div>
                  </div>
                )}
              </div>

              <div>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-hairline hover:bg-background text-xs font-semibold text-ink transition-colors"
                >
                  <Compass className="w-4 h-4 text-accent" />
                  Open in Google Maps
                  <ExternalLink className="w-3.5 h-3.5 text-muted ml-1" />
                </a>
              </div>
            </div>

            {/* Simulated Clean Map Pin Graphic */}
            <div className="h-48 rounded-xl bg-stone-900 border border-stone-800 flex flex-col items-center justify-center text-center p-6 space-y-3 text-stone-300">
              <MapPin className="w-10 h-10 text-accent animate-bounce" />
              <div>
                <span className="font-serif font-bold text-white block text-sm">{project.displayName}</span>
                <span className="text-xs text-stone-400">Ahmedabad Urban Development Area</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* STICKY BOTTOM ACTION BAR (MOBILE & DESKTOP) */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur-md border-t border-hairline px-4 py-3 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="hidden sm:block">
            <span className="text-xs text-muted block">Verified Fact Sheet Pricing</span>
            <span className="font-serif font-bold text-base text-ink">{project.priceRange}</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <Link
              to={chatUrl}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-surface border border-hairline hover:bg-background text-ink font-medium text-xs transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5 text-accent" />
              Chat With Advisor
            </Link>

            <Link
              to={bookUrl}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white font-semibold text-xs hover:opacity-90 transition-opacity shadow-sm"
            >
              <Calendar className="w-3.5 h-3.5" />
              Book Site Visit
            </Link>
          </div>
        </div>
      </div>

      {/* PRIVACY-AWARE REGULATORY FOOTER */}
      <footer className="bg-stone-950 text-stone-400 border-t border-stone-800 text-xs py-10 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span className="font-serif font-bold text-base text-stone-200">
                Aaranya Realty, Ahmedabad
              </span>
              <p className="text-[11px] text-stone-400 mt-0.5">
                RERA Registration: {project.reraNumber}
              </p>
            </div>

            <div className="flex flex-wrap gap-4 text-xs">
              <Link to="/privacy" className="hover:text-stone-200 transition-colors">
                DPDP Privacy Policy
              </Link>
              <Link to="/terms" className="hover:text-stone-200 transition-colors">
                Terms & Disclosures
              </Link>
              <Link to="/login" className="hover:text-stone-200 transition-colors">
                Staff Workspace
              </Link>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-stone-400 border-t border-stone-800/80 pt-4">
            Disclaimer: This project showcase is certified under the Real Estate (Regulation and Development) Act (RERA). All floor dimensions and pricing ranges are generated directly from verified project fact sheets. No automated discount or ROI guarantee is quoted. In compliance with the Digital Personal Data Protection (DPDP) Act 2023, your personal data is handled exclusively for coordinated site visits with explicit affirmative consent.
          </p>

          <div className="text-[11px] text-stone-400 flex items-center justify-between">
            <span>© 2026 Aaranya Realty, Ahmedabad. All rights reserved.</span>
            <span>Simulated Demo Showcase</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
export default ProjectShowcasePage;
