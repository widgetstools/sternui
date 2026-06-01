import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { AnyModule } from '@starui/engine';
import { ChromeButton } from '@starui/grid/customizer';
import { Tabs, TabsList, TabsTrigger } from '@starui/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const SCROLL_STEP_PX = 160;

export interface SettingsModuleTabsProps {
  modules: AnyModule[];
  activeId: string;
  onActiveIdChange: (id: string) => void;
  /** Opt out of OpenFin frameless drag region on interactive controls. */
  frameless?: boolean;
}

/**
 * Horizontal shadcn tabs for Grid Customizer modules. Scrolls when the tab
 * strip exceeds the viewport; left/right carets appear only when needed.
 */
export function SettingsModuleTabs({
  modules,
  activeId,
  onActiveIdChange,
  frameless = false,
}: SettingsModuleTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const noDrag = frameless
    ? ({ WebkitAppRegion: 'no-drag' } as CSSProperties)
    : undefined;

  const updateScrollAffordances = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 1);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollAffordances();
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateScrollAffordances);
    observer.observe(el);
    return () => observer.disconnect();
  }, [modules.length, updateScrollAffordances]);

  useEffect(() => {
    const el = scrollRef.current?.querySelector('[data-state="active"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    updateScrollAffordances();
  }, [activeId, updateScrollAffordances]);

  const scrollBy = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  if (modules.length === 0) return null;

  return (
    <div
      className="ds-settings-module-tabs-bar"
      data-testid="v2-settings-module-tabs"
      style={noDrag}
    >
      {canScrollLeft && (
        <ChromeButton
          type="button"
          className="ds-settings-module-tabs-caret"
          aria-label="Scroll modules left"
          data-testid="v2-settings-module-tabs-scroll-left"
          onClick={() => scrollBy(-SCROLL_STEP_PX)}
        >
          <ChevronLeft size={12} strokeWidth={2} />
        </ChromeButton>
      )}

      <div
        ref={scrollRef}
        className="ds-settings-module-tabs-scroll"
        onScroll={updateScrollAffordances}
      >
        <Tabs
          value={activeId}
          onValueChange={onActiveIdChange}
          className="ds-settings-module-tabs"
        >
          <TabsList
            className="ds-settings-module-tabs-list h-auto min-h-0 rounded-none bg-transparent p-0 text-[color:var(--ds-text-secondary)]"
            aria-label="Grid customizer modules"
          >
            {modules.map((m) => (
              <TabsTrigger
                key={m.id}
                value={m.id}
                className="ds-settings-module-tab-trigger h-[33px] rounded-none px-2.5 py-0 text-[10px] font-semibold leading-none shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                data-testid={`v2-settings-nav-menu-${m.id}`}
              >
                {m.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {canScrollRight && (
        <ChromeButton
          type="button"
          className="ds-settings-module-tabs-caret"
          aria-label="Scroll modules right"
          data-testid="v2-settings-module-tabs-scroll-right"
          onClick={() => scrollBy(SCROLL_STEP_PX)}
        >
          <ChevronRight size={12} strokeWidth={2} />
        </ChromeButton>
      )}
    </div>
  );
}
