import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, TabsList, TabsTrigger } from '@starui/ui';

export interface LabTabNavItem {
  id: string;
  label: string;
}

export interface LabTabsNavProps {
  tabs: LabTabNavItem[];
  activeId: string;
}

const SCROLL_STEP_PX = 180;

/** Hide native scrollbar — navigation uses chevron buttons instead. */
const SCROLL_HIDE =
  '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';

export function LabTabsNav({ tabs, activeId }: LabTabsNavProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      setHasOverflow(false);
      return;
    }
    const overflow = el.scrollWidth > el.clientWidth + 2;
    setHasOverflow(overflow);
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  const updateScrollStateRef = useRef(updateScrollState);
  updateScrollStateRef.current = updateScrollState;

  useEffect(() => {
    updateScrollState();
  }, [tabs, updateScrollState]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const handler = () => updateScrollStateRef.current();
    el.addEventListener('scroll', handler, { passive: true });
    const ro = new ResizeObserver(handler);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', handler);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const active = scroller.querySelector<HTMLElement>('[data-state="active"]');
    active?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
    updateScrollStateRef.current();
  }, [activeId]);

  const scrollBy = useCallback((dir: -1 | 1) => {
    scrollerRef.current?.scrollBy({ left: dir * SCROLL_STEP_PX, behavior: 'smooth' });
  }, []);

  return (
    <div className="relative shrink-0 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-2 py-2">
      <div className="flex min-w-0 items-center gap-1">
        {hasOverflow && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-[color:var(--ds-text-secondary)] disabled:opacity-30"
            onClick={() => scrollBy(-1)}
            disabled={!canScrollLeft}
            aria-label="Scroll tabs left"
            data-testid="lab-tabs-scroll-left"
          >
            <ChevronLeft size={16} strokeWidth={2} />
          </Button>
        )}

        <div
          ref={scrollerRef}
          className={`min-w-0 flex-1 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] ${SCROLL_HIDE}`}
        >
          <TabsList className="inline-flex h-9 w-max min-w-full flex-nowrap justify-start gap-1 bg-[color:var(--ds-surface-secondary)] p-1">
            {tabs.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                data-testid={`lab-tab-${t.id}`}
                className="h-7 shrink-0 px-3 text-[12px] data-[state=active]:bg-[color:var(--ds-surface-primary)] data-[state=active]:text-[color:var(--ds-text-primary)] data-[state=active]:shadow-[var(--ds-elevation-card)]"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {hasOverflow && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-[color:var(--ds-text-secondary)] disabled:opacity-30"
            onClick={() => scrollBy(1)}
            disabled={!canScrollRight}
            aria-label="Scroll tabs right"
            data-testid="lab-tabs-scroll-right"
          >
            <ChevronRight size={16} strokeWidth={2} />
          </Button>
        )}
      </div>
    </div>
  );
}
