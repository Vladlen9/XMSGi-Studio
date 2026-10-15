export type PlannerSurface = 'quick' | 'pending' | 'legacy';

export type PlannerSurfaceState = {
  browserDraftMode: boolean;
  connected: boolean;
  signedOut: boolean;
  connecting: boolean;
  connectionResolved: boolean;
};

export function getPlannerSurface({
  browserDraftMode,
  connected,
  signedOut,
  connecting,
  connectionResolved,
}: PlannerSurfaceState): PlannerSurface {
  if (browserDraftMode || (connected && !signedOut)) return 'quick';
  if (!connectionResolved || connecting) return 'pending';
  return 'legacy';
}