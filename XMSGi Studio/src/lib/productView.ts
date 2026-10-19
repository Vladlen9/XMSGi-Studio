export type ProductView = 'studio' | 'planner' | 'posts';

export function getInitialProductView(browserDraftMode: boolean): ProductView {
  return browserDraftMode ? 'planner' : 'studio';
}
