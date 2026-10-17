export type ProductView = 'studio' | 'planner';

export function getInitialProductView(browserDraftMode: boolean): ProductView {
  return browserDraftMode ? 'planner' : 'studio';
}
