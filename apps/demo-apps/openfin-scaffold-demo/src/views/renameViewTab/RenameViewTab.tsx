/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { useEffect, useRef, useState } from 'react';
import { Button, Input } from '@starui/grid/customizer';

interface RenameCustomData {
  view: { uuid: string; name: string };
  currentTitle: string;
}

const isOpenFin = typeof (window as unknown as { fin?: unknown }).fin !== 'undefined';

/** Platform "Save Tab As…" popout — `/rename-view-tab`. */
export default function RenameViewTab() {
  const [title, setTitle] = useState('');
  const [view, setView] = useState<RenameCustomData['view'] | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpenFin) return;
    void fin.me.getOptions().then((opts: { customData?: Partial<RenameCustomData> }) => {
      const cd = opts?.customData ?? {};
      if (cd.view) setView(cd.view);
      if (typeof cd.currentTitle === 'string') setTitle(cd.currentTitle);
    });
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => clearTimeout(id);
  }, []);

  async function closeWindow() {
    if (!isOpenFin) return;
    try {
      await fin.Window.getCurrentSync().close();
    } catch {
      /* closing */
    }
  }

  async function handleSave() {
    const next = title.trim();
    if (!next || !view || saving) return;
    setSaving(true);
    try {
      const target = fin.View.wrapSync(view);
      const safe = JSON.stringify(next);
      await target.executeJavaScript(`document.title = ${safe};`);
      try {
        const opts = await target.getOptions();
        const cd = (opts?.customData ?? {}) as Record<string, unknown>;
        if (cd.savedTitle !== next) {
          await target.updateOptions({ customData: { ...cd, savedTitle: next } });
        }
      } catch (err) {
        console.warn('[rename-view-tab] customData persist failed', err);
      }
    } catch (err) {
      console.error('[rename-view-tab] rename failed', err);
    } finally {
      await closeWindow();
    }
  }

  const canSave = title.trim().length > 0 && !!view && !saving;

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden rounded-md border border-border bg-popover text-foreground shadow-2xl"
      style={{ fontFamily: 'var(--ds-font-sans)' }}
    >
      <div
        className="flex items-center gap-2 px-3.5 pb-2 pt-3"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <h1 className="m-0 text-sm font-semibold">Save Tab As</h1>
      </div>
      <div className="px-3.5 py-1">
        <Input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSave();
            if (e.key === 'Escape') void closeWindow();
          }}
          placeholder="Tab name"
          className="h-9 px-3 text-[13px]"
        />
      </div>
      <div className="mt-auto flex justify-end gap-2 px-3.5 pb-3 pt-2">
        <Button type="button" variant="ghost" onClick={() => void closeWindow()}>
          Cancel
        </Button>
        <Button type="button" disabled={!canSave} onClick={() => void handleSave()}>
          Save
        </Button>
      </div>
    </div>
  );
}
