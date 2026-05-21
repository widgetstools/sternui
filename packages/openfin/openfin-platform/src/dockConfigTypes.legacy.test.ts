import { describe, expect, it } from 'vitest';
import { DockButtonNames } from '@openfin/workspace';
import {
  contentMenuFoldersToLegacyDropdowns,
  toLegacyDockActionButtons,
  toLegacyDockButtons,
} from './dockConfigTypes';

const noopGen = (id: string) => `icon:${id}`;
const noopRecolor = (url: string) => url;

describe('toLegacyDockButtons', () => {
  it('maps ActionButton to bar buttons with action id', () => {
    const buttons = toLegacyDockButtons(
      {
        version: 1,
        updatedAt: '',
        buttons: [
          {
            type: 'ActionButton',
            id: 'launch-1',
            tooltip: 'Launch',
            iconUrl: 'http://example/icon.png',
            actionId: 'launch-app',
            customData: { appId: 'a1' },
          },
        ],
      },
      noopGen,
      noopRecolor,
      '#fff',
      '#000',
      'dark',
    );
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toMatchObject({
      id: 'launch-1',
      tooltip: 'Launch',
      action: { id: 'launch-app', customData: { appId: 'a1' } },
    });
  });

  it('maps content-menu folder (SPG) to bar dropdown with submenu', () => {
    const buttons = contentMenuFoldersToLegacyDropdowns(
      [
        {
          type: 'folder',
          id: 'spg',
          label: 'SPG',
          icon: 'http://example/spg.png',
          children: [
            {
              type: 'item',
              id: 'spg-item-1',
              label: 'Sub Item',
              icon: 'http://example/item.png',
              itemData: { actionId: 'launch-app' },
            },
          ],
        },
      ],
      noopGen,
      noopRecolor,
      '#fff',
      '#000',
      'dark',
    );
    expect(buttons[0]).toMatchObject({
      type: DockButtonNames.DropdownButton,
      id: 'spg',
      tooltip: 'SPG',
      options: [{ id: 'spg-item-1', tooltip: 'Sub Item' }],
    });
  });

  it('maps DropdownButton via combined legacy builder', () => {
    const buttons = toLegacyDockButtons(
      {
        version: 1,
        updatedAt: '',
        buttons: [
          {
            type: 'DropdownButton',
            id: 'apps',
            tooltip: 'Apps',
            iconUrl: 'http://example/apps.png',
            options: [
              {
                id: 'app-1',
                tooltip: 'App One',
                iconUrl: 'http://example/a1.png',
                actionId: 'launch-app',
              },
            ],
          },
        ],
      },
      noopGen,
      noopRecolor,
      '#fff',
      '#000',
      'light',
    );
    expect(buttons[0]).toMatchObject({
      type: DockButtonNames.DropdownButton,
      id: 'apps',
      tooltip: 'Apps',
      options: [{ id: 'app-1', tooltip: 'App One' }],
    });
  });
});
