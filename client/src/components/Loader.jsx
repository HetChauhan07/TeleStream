export function Spinner() {
  return <div className="loader-spinner" />;
}

export function SkeletonCard() {
  return (
    <div className="skeleton skeleton--card">
      <div className="skeleton skeleton--poster" />
      <div className="skeleton skeleton--text" />
      <div className="skeleton skeleton--text-sm" />
    </div>
  );
}

export function SkeletonRow({ count = 7 }) {
  return (
    <div className="media-row">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonGrid({ count = 12 }) {
  return (
    <div className="media-grid">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function EmptyState({ icon = (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M7 3v18" />
    <path d="M3 7.5h4" />
    <path d="M3 12h18" />
    <path d="M3 16.5h4" />
    <path d="M17 3v18" />
    <path d="M17 7.5h4" />
    <path d="M17 16.5h4" />
  </svg>
), title, subtitle }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <h3 className="empty-state__title">{title}</h3>
      {subtitle && <p className="empty-state__subtitle">{subtitle}</p>}
    </div>
  );
}
