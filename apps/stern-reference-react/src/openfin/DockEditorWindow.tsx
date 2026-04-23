import { useState, useEffect, useRef } from 'react';
import { DockConfigurator } from '@marketsui/widgets-react';
import type { DockMenuItem } from '@marketsui/openfin-platform-stern';

/**
 * Dock Editor — rendered in a standalone fin.Window at /dock-editor.
 * Communicates with the platform provider via IAB:
 *   - publishes 'stern:dock-editor:request-config' to request current items
 *   - subscribes to 'stern:dock-editor:config' to receive them
 *   - publishes 'stern:dock-editor:apply' when the user applies changes
 */
export default function DockEditorWindow() {
  const [items, setItems] = useState<DockMenuItem[] | null>(null);
  const receivedRef = useRef(false);

  useEffect(() => {
    if (!window.fin) {
      setItems([]);
      return;
    }

    const onConfig = (_sender: unknown, data: { menuItems: DockMenuItem[] }) => {
      if (!receivedRef.current) {
        receivedRef.current = true;
        setItems(Array.isArray(data.menuItems) ? data.menuItems : []);
      }
    };

    const setup = async () => {
      // Subscribe before publishing the request to avoid a race condition.
      await fin.InterApplicationBus.subscribe(
        { uuid: fin.me.uuid },
        'stern:dock-editor:config',
        onConfig,
      );
      await fin.InterApplicationBus.publish('stern:dock-editor:request-config', {});
    };

    setup().catch(console.error);

    return () => {
      fin.InterApplicationBus
        .unsubscribe({ uuid: fin.me.uuid }, 'stern:dock-editor:config', onConfig)
        .catch(() => {});
    };
  }, []);

  const handleApply = async (newItems: DockMenuItem[]) => {
    if (window.fin) {
      await fin.InterApplicationBus.publish('stern:dock-editor:apply', { menuItems: newItems });
    }
  };

  if (items === null) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <div className="h-8 w-8 mx-auto mb-3 rounded-full border-[3px] border-muted border-t-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading dock configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground">
      <DockConfigurator
        initialItems={items}
        onApply={handleApply}
      />
    </div>
  );
}
