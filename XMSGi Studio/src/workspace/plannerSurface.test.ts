import { describe, expect, it } from 'vitest';
import { getPlannerSurface } from './plannerSurface';

describe('getPlannerSurface', () => {
  it('hides the legacy planner while startup connection state is unresolved', () => {
    expect(getPlannerSurface({
      browserDraftMode: false,
      connected: false,
      signedOut: false,
      connecting: true,
      connectionResolved: false,
    })).toBe('pending');
  });

  it('hides the legacy planner while restoring a signed-out session', () => {
    expect(getPlannerSurface({
      browserDraftMode: false,
      connected: false,
      signedOut: true,
      connecting: true,
      connectionResolved: true,
    })).toBe('pending');
  });

  it('shows the legacy sign-in page after session state is resolved and signed out', () => {
    expect(getPlannerSurface({
      browserDraftMode: false,
      connected: false,
      signedOut: true,
      connecting: false,
      connectionResolved: true,
    })).toBe('legacy');
  });

  it('shows Quick Planner for connected and browser draft sessions', () => {
    expect(getPlannerSurface({
      browserDraftMode: false,
      connected: true,
      signedOut: false,
      connecting: false,
      connectionResolved: true,
    })).toBe('quick');
    expect(getPlannerSurface({
      browserDraftMode: true,
      connected: false,
      signedOut: false,
      connecting: true,
      connectionResolved: false,
    })).toBe('quick');
  });
});