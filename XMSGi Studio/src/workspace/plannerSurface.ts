export type PlannerSurface = 'quick' | 'pending' | 'login';

export type PlannerSurfaceState = {
  browserDraftMode: boolean;
  connected: boolean;
  signedOut: boolean;
  connecting: boolean;
  connectionResolved: boolean;
  welcomeBackInProgress?: boolean;
};

export function getPlannerSurface({
  browserDraftMode,
  connected,
  signedOut,
  connecting,
  connectionResolved,
  welcomeBackInProgress = false,
}: PlannerSurfaceState): PlannerSurface {
  if (browserDraftMode || (connected && !signedOut)) return 'quick';
  if (signedOut && welcomeBackInProgress) return 'login';
  if (!connectionResolved || connecting) return 'pending';
  return 'login';
}