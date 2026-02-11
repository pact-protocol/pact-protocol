import { useState, useCallback, useEffect, useRef } from 'react';

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  rightSlot?: React.ReactNode;
  /** Optional ID for the section element (scroll target). When "technical-verification", link can expand + scroll here. */
  sectionId?: string;
  children: React.ReactNode;
}

export default function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  rightSlot,
  sectionId,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const sectionRef = useRef<HTMLElement>(null);
  const id = sectionId ?? `section-${title.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '')}`;

  useEffect(() => {
    if (!sectionId) return;
    const handler = (e: CustomEvent<{ id: string }>) => {
      if (e.detail?.id === sectionId) {
        setOpen(true);
        queueMicrotask(() => sectionRef.current?.scrollIntoView({ behavior: 'smooth' }));
      }
    };
    window.addEventListener('expand-section', handler as EventListener);
    return () => window.removeEventListener('expand-section', handler as EventListener);
  }, [sectionId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    },
    []
  );

  return (
    <section
      ref={sectionRef}
      id={sectionId ?? undefined}
      className="collapsible-section"
      aria-labelledby={`${id}-heading`}
    >
      <div
        role="button"
        tabIndex={0}
        id={`${id}-heading`}
        className="collapsible-section-heading"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        aria-expanded={open}
        aria-controls={`${id}-content`}
      >
        <span className="collapsible-section-arrow" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        <span className="collapsible-section-title-wrap">
          <span className="collapsible-section-title">{title}</span>
          {subtitle != null && subtitle !== '' && (
            <span className="collapsible-section-subtitle">{subtitle}</span>
          )}
        </span>
        {rightSlot != null && <span className="collapsible-section-right">{rightSlot}</span>}
      </div>
      <div
        id={`${id}-content`}
        className="collapsible-section-content"
        hidden={!open}
        role="region"
        aria-labelledby={`${id}-heading`}
      >
        {children}
      </div>
    </section>
  );
}
