import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './PlannerInsightsPreview.css';

export function PlannerInsightsPreview() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setTarget(document.querySelector<HTMLElement>('.quick-planner-activity-section'));
  }, []);

  if (!target) return null;

  return createPortal(
    <div className="planner-insights-preview" aria-hidden="true" />,
    target,
  );
}
