import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PlannerInsightsPreview } from './PlannerInsightsPreview';

afterEach(() => {
  cleanup();
  document.querySelector('.quick-planner-activity-section')?.remove();
});

describe('PlannerInsightsPreview', () => {
  it('renders an empty decorative card without interactive content', () => {
    const activityCard = document.createElement('section');
    activityCard.className = 'quick-planner-activity-section';
    document.body.append(activityCard);
    render(createElement(PlannerInsightsPreview));

    const preview = activityCard.querySelector('.planner-insights-preview');
    expect(preview).toBeInTheDocument();
    expect(preview).toHaveAttribute('aria-hidden', 'true');
    expect(preview).toBeEmptyDOMElement();
    expect(activityCard.querySelectorAll('button')).toHaveLength(0);
  });
});
