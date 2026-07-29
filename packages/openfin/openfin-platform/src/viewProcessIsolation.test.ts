import { describe, expect, it } from 'vitest';
import {
  ensureViewProcessIsolation,
  isolateLayoutViews,
  VIEW_ISOLATION_AFFINITY_PREFIX,
} from './viewProcessIsolation';

describe('ensureViewProcessIsolation', () => {
  it('derives a stable unique affinity from the view name', () => {
    const opts = ensureViewProcessIsolation({ name: 'blotter-1' });
    expect(opts.processAffinity).toBe(`${VIEW_ISOLATION_AFFINITY_PREFIX}blotter-1`);
    // Stable: same name → same affinity (restored views return to their process).
    expect(ensureViewProcessIsolation({ name: 'blotter-1' }).processAffinity)
      .toBe(opts.processAffinity);
    // Distinct names → distinct processes.
    expect(ensureViewProcessIsolation({ name: 'blotter-2' }).processAffinity)
      .not.toBe(opts.processAffinity);
  });

  it('REPLACES a shared inbound affinity — the one-process-fleet bug', () => {
    const opts = ensureViewProcessIsolation({
      name: 'blotter-3',
      processAffinity: 'star-demo',
    });
    expect(opts.processAffinity).toBe(`${VIEW_ISOLATION_AFFINITY_PREFIX}blotter-3`);
  });

  it('generates unique keys for nameless views', () => {
    const a = ensureViewProcessIsolation({}).processAffinity!;
    const b = ensureViewProcessIsolation({}).processAffinity!;
    expect(a).toMatch(new RegExp(`^${VIEW_ISOLATION_AFFINITY_PREFIX}`));
    expect(a).not.toBe(b);
  });
});

describe('isolateLayoutViews', () => {
  it('stamps every view componentState in a snapshot layout tree', () => {
    // Shape mirrors the star-demo seed: stack → content → view items
    // whose componentState carries the legacy shared affinity.
    const layout = {
      content: [
        {
          type: 'row',
          content: [
            {
              type: 'stack',
              content: [
                {
                  type: 'component',
                  componentState: {
                    componentName: 'view',
                    name: 'seed-view-a',
                    initialUrl: 'http://localhost:5175/#/blotters/marketsgrid',
                    processAffinity: 'star-demo',
                  },
                },
                {
                  type: 'component',
                  componentState: {
                    componentName: 'view',
                    name: 'seed-view-b',
                    initialUrl: 'http://localhost:5175/#/blotters/marketsgrid',
                    processAffinity: 'star-demo',
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    isolateLayoutViews(layout);

    const [a, b] = layout.content[0]!.content[0]!.content.map(
      (c) => c.componentState.processAffinity,
    );
    expect(a).toBe(`${VIEW_ISOLATION_AFFINITY_PREFIX}seed-view-a`);
    expect(b).toBe(`${VIEW_ISOLATION_AFFINITY_PREFIX}seed-view-b`);
    expect(a).not.toBe(b);
  });

  it('tolerates null / non-layout shapes without touching them', () => {
    expect(() => isolateLayoutViews(null)).not.toThrow();
    expect(() => isolateLayoutViews(undefined)).not.toThrow();
    expect(() => isolateLayoutViews('str')).not.toThrow();
    const notAView = { type: 'stack', settings: { hasHeaders: true } };
    isolateLayoutViews(notAView);
    expect('processAffinity' in notAView).toBe(false);
  });
});
