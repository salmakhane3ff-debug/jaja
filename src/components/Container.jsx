/**
 * Shared layout container.
 * Provides a consistent max-width and horizontal padding across all homepage sections.
 * Use this instead of ad-hoc `max-w-7xl mx-auto px-4` on individual components.
 */
export default function Container({ children, className = "" }) {
  return (
    <div className={`max-w-7xl mx-auto px-4 sm:px-6 ${className}`.trim()}>
      {children}
    </div>
  );
}
