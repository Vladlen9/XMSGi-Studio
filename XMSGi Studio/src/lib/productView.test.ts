import { describe, expect, it } from 'vitest';
import { getInitialProductView } from './productView';

describe('Initial product view', () => {
  it('starts Electron sessions in Studio and browser draft sessions in Quick Planner', () => {
    expect(getInitialProductView(false)).toBe('studio');
    expect(getInitialProductView(true)).toBe('planner');
  });
});