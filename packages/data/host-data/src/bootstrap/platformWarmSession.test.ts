import { afterEach, describe, expect, it } from 'vitest';
import {
  _resetPlatformWarmSessionForTests,
  clearPlatformWarm,
  isPlatformWarm,
  markPlatformWarm,
} from './platformWarmSession.js';

describe('platformWarmSession', () => {
  afterEach(() => {
    _resetPlatformWarmSessionForTests();
  });

  it('marks and reads warm state per appId', () => {
    expect(isPlatformWarm('star-demo')).toBe(false);
    markPlatformWarm('star-demo');
    expect(isPlatformWarm('star-demo')).toBe(true);
    expect(isPlatformWarm('other-app')).toBe(false);
  });

  it('clearPlatformWarm removes the marker', () => {
    markPlatformWarm('star-demo');
    clearPlatformWarm('star-demo');
    expect(isPlatformWarm('star-demo')).toBe(false);
  });
});
