import type { UseProfileManagerResult } from '@marketsui/core';
import { ProfileSelector } from '../ProfileSelector';

/**
 * Profile-selector block (the dropdown + clone/export/import handlers).
 * Extracts the largest inline closure cluster from the toolbar render
 * tree. The clone/export/import handlers live here because they're
 * inseparable from the selector's API surface and don't belong on the
 * orchestrator.
 *
 * Extracted from `MarketsGrid.tsx` during Phase C-3.
 */
export function ProfileSelectorBlock({
  profiles,
  isDirty,
  requestLoadProfile,
}: {
  profiles: UseProfileManagerResult;
  isDirty: boolean;
  requestLoadProfile: (id: string) => void;
}) {
  return (
    <ProfileSelector
      profiles={profiles.profiles}
      activeProfileId={profiles.activeProfileId ?? ''}
      isDirty={isDirty}
      onCreate={(name) => profiles.createProfile(name)}
      onLoad={(id) => requestLoadProfile(id)}
      onDelete={(id) => profiles.deleteProfile(id)}
      onClone={async (id) => {
        // Compose a unique " (copy)" name, de-duping against existing
        // profiles so consecutive clones produce "…(copy)", "…(copy 2)",
        // "…(copy 3)". The manager throws on id collision, so we also
        // suffix the id deterministically via the default slug; if it
        // still collides (edge case: user already made a "<foo>-copy"),
        // bump the suffix until it's free.
        try {
          const src = profiles.profiles.find((p) => p.id === id);
          if (!src) return;
          const existingNames = new Set(profiles.profiles.map((p) => p.name));
          let candidate = `${src.name} (copy)`;
          let n = 2;
          while (existingNames.has(candidate)) {
            candidate = `${src.name} (copy ${n})`;
            n++;
          }
          await profiles.cloneProfile(id, candidate);
        } catch (err) {
          console.warn('[markets-grid] profile clone failed:', err);
          window.alert(`Could not clone profile: ${err instanceof Error ? err.message : String(err)}`);
        }
      }}
      onExport={async (id) => {
        try {
          const payload = await profiles.exportProfile(id);
          const fileStem = (payload.profile.name || id)
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60) || 'profile';
          const json = JSON.stringify(payload, null, 2);
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `gc-profile-${fileStem}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          // Release the object-url on the next tick so the browser has
          // a frame to initiate the download.
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
          console.warn('[markets-grid] profile export failed:', err);
          window.alert(`Could not export profile: ${err instanceof Error ? err.message : String(err)}`);
        }
      }}
      onImport={async (file) => {
        try {
          const text = await file.text();
          const payload = JSON.parse(text);
          await profiles.importProfile(payload);
        } catch (err) {
          console.warn('[markets-grid] profile import failed:', err);
          window.alert(`Could not import profile: ${err instanceof Error ? err.message : String(err)}`);
        }
      }}
    />
  );
}
