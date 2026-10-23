import { createElement, type ReactNode } from 'react';
import { act, fireEvent, render as renderTestingLibrary, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScheduledMessage } from '@/types';
import { LocaleProvider } from '@/lib/i18n';
import { QuickPlannerActivity } from './QuickPlannerActivity';

const activityStyles = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'QuickPlannerActivity.css'), 'utf8');

function renderActivity(ui: ReactNode) {
  return renderTestingLibrary(createElement(LocaleProvider, null, ui));
}

function createSentMessage(overrides: Partial<ScheduledMessage> = {}): ScheduledMessage {
  return {
    id: 'message-1',
    chatId: 'chat-1',
    chatName: 'Test chat',
    text: 'A sent message',
    when: '2035-05-12T15:00:00.000Z',
    createdAt: '2035-05-10T10:00:00.000Z',
    status: 'sent',
    sentAt: '2035-05-12T09:30:00.000Z',
    ...overrides,
  };
}

describe('QuickPlannerActivity', () => {
  it('uses one continuous glass surface for the complete activity card in both themes', () => {
    expect(activityStyles).toMatch(
      /\.quick-planner-activity-section\s*\{[^}]*background:\s*radial-gradient\([^;]+,\s*linear-gradient\([^;]+;/,
    );
    expect(activityStyles).toMatch(
      /html\[data-theme='dark'\] \.quick-planner-activity-section\s*\{[^}]*background:\s*radial-gradient\([^;]+,\s*linear-gradient\([^;]+;/,
    );
    expect(activityStyles).toMatch(
      /\.quick-planner-activity-header h2\s*\{[^}]*top:\s*-33px;[^}]*left:\s*0;/,
    );
  });

  it('renders independently and charts distinct confirmed sends', () => {
    const now = new Date();
    const sentAt = now.toISOString();
    renderActivity(
      <QuickPlannerActivity sent={[
        createSentMessage({ sendAttemptId: 'attempt-a', sentAt }),
        createSentMessage({ id: 'duplicate', sendAttemptId: 'attempt-a', sentAt }),
        createSentMessage({ id: 'another-send', sentAt }),
        createSentMessage({ id: 'scheduled', status: 'scheduled', sentAt }),
      ]} />,
    );

    const dateLabel = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(now);
    expect(screen.getByRole('region', { name: 'Activity' })).toBeInTheDocument();
    const chart = screen.getByRole('img', { name: 'Confirmed messages sent in the last 7 days: 2' });
    expect(chart).toBeInTheDocument();
    const linePath = chart.querySelector('.quick-planner-activity-line')?.getAttribute('d') ?? '';
    expect(linePath).toContain(' C ');
    for (const lineLayer of chart.querySelectorAll(
      '.quick-planner-activity-line-depth, .quick-planner-activity-line-glow, .quick-planner-activity-line, .quick-planner-activity-line-highlight',
    )) {
      expect(lineLayer).toHaveAttribute('vector-effect', 'non-scaling-stroke');
    }
    expect(chart.querySelector('.quick-planner-activity-line-rising')).not.toBeInTheDocument();
    const startY = Number(linePath.match(/^M -24 ([\d.]+)/)?.[1]);
    const segments = Array.from(linePath.matchAll(/C [\d.]+ ([\d.]+), [\d.]+ ([\d.]+), [\d.]+ ([\d.]+)/g));
    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];
    expect(Number(firstSegment[1])).toBe(startY);
    expect(Number(lastSegment[2])).toBe(Number(lastSegment[3]));
    let previousY = startY;
    for (const segment of segments) {
      const endY = Number(segment[3]);
      const minY = Math.min(previousY, endY);
      const maxY = Math.max(previousY, endY);
      expect(Number(segment[1])).toBeGreaterThanOrEqual(minY);
      expect(Number(segment[1])).toBeLessThanOrEqual(maxY);
      expect(Number(segment[2])).toBeGreaterThanOrEqual(minY);
      expect(Number(segment[2])).toBeLessThanOrEqual(maxY);
      previousY = endY;
    }
    expect(chart.querySelectorAll('.quick-planner-activity-point')).toHaveLength(7);
    expect(chart.querySelectorAll('.quick-planner-activity-point-dot')).toHaveLength(1);
    expect(linePath).toMatch(/^M -24 82/);
    expect(linePath).toMatch(/384 53\.2$/);
    const weeklyPointXs = Array.from(
      chart.querySelectorAll('.quick-planner-activity-point'),
      (point) => Number(point.querySelector('.quick-planner-activity-point-dot')?.getAttribute('cx')
        ?? point.querySelector('.quick-planner-activity-count')?.getAttribute('x')),
    ).filter(Number.isFinite);
    expect(weeklyPointXs).toEqual([324]);
    const edgeFadeMask = chart.querySelector('mask');
    const edgeFadeGradient = chart.querySelector('defs linearGradient[id$="-edge-fade-gradient"]');
    expect(edgeFadeMask).toBeInTheDocument();
    expect(edgeFadeMask).toHaveAttribute('x', '-24');
    expect(edgeFadeMask).toHaveAttribute('width', '408');
    expect(edgeFadeGradient?.querySelector('stop')?.getAttribute('stop-color')).toBe('black');
    expect(edgeFadeGradient?.querySelector('stop:last-child')?.getAttribute('stop-color')).toBe('black');
    expect(chart.querySelector('.quick-planner-activity-line')?.parentElement?.getAttribute('mask'))
      .toBe(`url(#${edgeFadeMask?.id})`);
    expect(Array.from(chart.querySelectorAll('.quick-planner-activity-count'), (label) => label.textContent))
      .toEqual(['2']);
    expect(chart.querySelector('.quick-planner-activity-count')).toHaveClass('is-single-digit');
    expect(chart.querySelector('.quick-planner-activity-count-shadow')).toHaveClass('is-single-digit');
    expect(screen.getByText('2', { selector: '.quick-planner-activity-total-count' })).toBeInTheDocument();
    expect(screen.getByText('confirmed sends')).toBeInTheDocument();
    expect(screen.getByTitle(`${dateLabel}: 2 messages sent`)).toBeInTheDocument();
  });

  it('shortens the weekly line by twelve screen pixels on both sides and keeps the fade mask', () => {
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getBounds(this: HTMLElement) {
      if (this.classList.contains('quick-planner-activity-chart')) {
        return {
          left: 0,
          right: 360,
          width: 360,
          height: 168,
          top: 0,
          bottom: 168,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      }
      return originalGetBoundingClientRect.call(this);
    });

    try {
      renderActivity(<QuickPlannerActivity sent={[createSentMessage({ sentAt: new Date().toISOString() })]} />);

      const chart = screen.getByRole('img', { name: 'Confirmed messages sent in the last 7 days: 1' });
      const line = chart.querySelector('.quick-planner-activity-line');
      const linePath = line?.getAttribute('d') ?? '';
      expect(linePath).toMatch(/^M -5 82/);
      expect(linePath).toMatch(/365 67\.6$/);
      expect(line?.parentElement?.getAttribute('mask')).toBe(`url(#${chart.querySelector('mask')?.id})`);
      expect(chart.querySelector('.quick-planner-activity-point-dot')).toHaveAttribute('cx', '324');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('scales the weekly chart in five steps so five sends reach the peak', () => {
    const now = new Date();
    const sendsForDay = (dayOffset: number, count: number) => {
      const sentAt = new Date(now);
      sentAt.setDate(sentAt.getDate() - dayOffset);
      return Array.from({ length: count }, (_, index) => createSentMessage({
        id: `weekly-step-${dayOffset}-${index}`,
        sentAt: sentAt.toISOString(),
      }));
    };
    renderActivity(
      <QuickPlannerActivity sent={[
        ...sendsForDay(2, 1),
        ...sendsForDay(1, 3),
        ...sendsForDay(0, 5),
      ]} />,
    );

    const chart = screen.getByRole('img', { name: 'Confirmed messages sent in the last 7 days: 9' });
    const pointYValues = Array.from(chart.querySelectorAll('.quick-planner-activity-point-dot'), (point) => (
      Number(point.getAttribute('cy'))
    ));

    expect(pointYValues[0]).toBeCloseTo(67.6);
    expect(pointYValues[1]).toBeCloseTo(38.8);
    expect(pointYValues[2]).toBe(10);
    expect(Array.from(chart.querySelectorAll('.quick-planner-activity-grid-line:not(.is-baseline)'), (line) => (
      line.getAttribute('d')
    ))).toEqual([
      'M 0 10 H 360',
      'M 0 24.4 H 360',
      'M 0 38.8 H 360',
      'M 0 53.2 H 360',
      'M 0 67.6 H 360',
    ]);
  });

  it('scales the monthly chart in five steps and keeps the peak pinned after five sends', () => {
    const now = new Date();
    const createSendsForToday = (count: number) => Array.from({ length: count }, (_, index) => (
      createSentMessage({
        id: `monthly-step-${count}-${index}`,
        sentAt: now.toISOString(),
      })
    ));
    const { rerender } = renderActivity(
      <QuickPlannerActivity sent={createSendsForToday(1)} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));

    for (const count of [1, 2, 3, 4, 5, 6] as const) {
      if (count > 1) {
        rerender(
          <LocaleProvider>
            <QuickPlannerActivity sent={createSendsForToday(count)} />
          </LocaleProvider>,
        );
      }

      const chart = screen.getByRole('img', {
        name: `Confirmed messages sent in the last 30 days: ${count}`,
      });
      const bar = chart.querySelector('.quick-planner-activity-month-bar');
      expect(bar).toBeInTheDocument();
      expect(Number(bar?.getAttribute('y'))).toBeCloseTo(82 - ((82 - 12) * Math.min(count, 5)) / 5);
      expect(chart.querySelector('.quick-planner-activity-peak-guide'))
        .toHaveAttribute('d', `M 0 ${82 - ((82 - 12) * Math.min(count, 5)) / 5} H 360`);
    }
  });

  it('keeps a single active day pinned to the top as its count passes five', () => {
    const now = new Date();
    const createSendsForToday = (count: number) => Array.from({ length: count }, (_, index) => (
      createSentMessage({
        id: `single-day-peak-${count}-${index}`,
        sentAt: now.toISOString(),
      })
    ));
    const { rerender } = renderActivity(
      <QuickPlannerActivity sent={createSendsForToday(5)} />,
    );

    for (const count of [5, 6, 7, 10] as const) {
      if (count > 5) {
        rerender(
          <LocaleProvider>
            <QuickPlannerActivity sent={createSendsForToday(count)} />
          </LocaleProvider>,
        );
      }

      const chart = screen.getByRole('img', {
        name: `Confirmed messages sent in the last 7 days: ${count}`,
      });
      const peak = chart.querySelector('.quick-planner-activity-point-dot');
      expect(peak).toHaveAttribute('cy', '10');
    }
  });

  it('keeps all seven days evenly aligned as the weekly window advances', () => {
    const initialNow = new Date(2035, 4, 12, 12);
    const createWeek = (today: Date, dailyCounts: number[]) => dailyCounts.flatMap((count, index) => {
      const sentAt = new Date(today);
      sentAt.setDate(today.getDate() - (6 - index));
      return Array.from({ length: count }, (_, messageIndex) => createSentMessage({
        id: `rolling-week-${today.toISOString()}-${index}-${messageIndex}`,
        sentAt: sentAt.toISOString(),
      }));
    });
    const getPoints = (chart: HTMLElement) => Array.from(
      chart.querySelectorAll('.quick-planner-activity-point-dot'),
      (point) => ({
        x: Number(point.getAttribute('cx')),
        y: Number(point.getAttribute('cy')),
      }),
    );

    vi.useFakeTimers();
    vi.setSystemTime(initialNow);
    try {
      const view = renderActivity(
        <QuickPlannerActivity sent={createWeek(initialNow, [1, 2, 3, 4, 5, 6, 7])} />,
      );
      const chartLabel = 'Confirmed messages sent in the last 7 days: 28';
      const initialChart = screen.getByRole('img', { name: chartLabel });
      const initialPoints = getPoints(initialChart);

      expect(initialPoints.map(({ x }) => x)).toEqual([36, 84, 132, 180, 228, 276, 324]);
      [71.7143, 61.4286, 51.1429, 40.8571, 30.5714, 20.2857, 10].forEach((expectedY, index) => (
        expect(initialPoints[index].y).toBeCloseTo(expectedY)
      ));
      expect(Array.from(initialChart.querySelectorAll('.quick-planner-activity-count'), (label) => label.textContent))
        .toEqual(['1', '2', '3', '4', '5', '6', '7']);

      const nextDay = new Date(initialNow);
      nextDay.setDate(nextDay.getDate() + 1);
      vi.setSystemTime(nextDay);
      view.rerender(createElement(LocaleProvider, null, createElement(QuickPlannerActivity, {
        sent: createWeek(nextDay, [2, 3, 4, 5, 6, 7, 1]),
      })));

      const nextChart = screen.getByRole('img', { name: chartLabel });
      const nextPoints = getPoints(nextChart);
      expect(nextPoints.map(({ x }) => x)).toEqual([36, 84, 132, 180, 228, 276, 324]);
      [61.4286, 51.1429, 40.8571, 30.5714, 20.2857, 10, 71.7143].forEach((expectedY, index) => (
        expect(nextPoints[index].y).toBeCloseTo(expectedY)
      ));
      expect(Array.from(nextChart.querySelectorAll('.quick-planner-activity-count'), (label) => label.textContent))
        .toEqual(['2', '3', '4', '5', '6', '7', '1']);

      const displayedWeekdays = Array.from(
        nextChart.parentElement?.querySelectorAll('.quick-planner-activity-day-label') ?? [],
        (label) => label.textContent,
      );
      const expectedWeekdays = Array.from({ length: 7 }, (_, index) => {
        const day = new Date(nextDay);
        day.setDate(nextDay.getDate() - (6 - index));
        return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(day);
      });
      expect(displayedWeekdays).toEqual(expectedWeekdays);
      const expectedDates = Array.from({ length: 7 }, (_, index) => {
        const day = new Date(nextDay);
        day.setDate(nextDay.getDate() - (6 - index));
        return String(day.getDate());
      });
      expect(Array.from(
        nextChart.parentElement?.querySelectorAll('.quick-planner-activity-date-label') ?? [],
        (label) => label.textContent,
      )).toEqual(expectedDates);
      const weeklyDays = Array.from(nextChart.parentElement?.querySelectorAll('.quick-planner-activity-day') ?? []);
      expect(weeklyDays.filter((day) => day.classList.contains('is-today'))).toHaveLength(1);
      expect(weeklyDays[weeklyDays.length - 1]).toHaveClass('is-today');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows zero counts for each day when there are no confirmed sends', () => {
    renderActivity(<QuickPlannerActivity />);

    const chart = screen.getByRole('img', { name: 'Confirmed messages sent in the last 7 days: 0' });
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
    expect(chart.querySelectorAll('.quick-planner-activity-count')).toHaveLength(0);
    expect(chart.querySelectorAll('.quick-planner-activity-point-dot')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));

    const monthChart = screen.getByRole('img', { name: 'Confirmed messages sent in the last 30 days: 0' });
    expect(monthChart.querySelectorAll('.quick-planner-activity-point-dot')).toHaveLength(0);
    expect(monthChart.querySelectorAll('.quick-planner-activity-month-bar')).toHaveLength(0);
    expect(monthChart.querySelector('.quick-planner-activity-month-bars')).toBeInTheDocument();
    expect(monthChart.querySelectorAll('.quick-planner-activity-scale-label')).toHaveLength(0);
    expect(monthChart.querySelector('.quick-planner-activity-scale-label.is-peak')).not.toBeInTheDocument();
    expect(monthChart.querySelector('.quick-planner-activity-peak-guide')).not.toBeInTheDocument();
    expect(monthChart.querySelector('.quick-planner-activity-grid-line.is-y-axis')).toBeInTheDocument();
    expect(monthChart.querySelector('.quick-planner-activity-grid-line.is-baseline'))
      .toHaveAttribute('d', 'M 0 82 H 360');
  });

  it('clips monthly grid lines and the peak guide to the activity card width', () => {
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getBounds(this: HTMLElement) {
      if (this.classList.contains('quick-planner-activity-chart')) {
        return {
          left: 0,
          right: 400,
          width: 400,
          height: 183,
          top: 0,
          bottom: 183,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      }
      if (this.classList.contains('quick-planner-activity-section')) {
        return {
          left: 20,
          right: 380,
          width: 360,
          height: 183,
          top: 0,
          bottom: 183,
          x: 20,
          y: 0,
          toJSON: () => ({}),
        };
      }
      return originalGetBoundingClientRect.call(this);
    });

    try {
      const sentAt = new Date().toISOString();
      renderActivity(
        <QuickPlannerActivity sent={Array.from({ length: 3 }, (_, index) => createSentMessage({
          id: `clipped-month-${index}`,
          sentAt,
        }))} />,
      );
      fireEvent.click(screen.getByRole('button', { name: '30 days' }));

      const chart = screen.getByRole('img', { name: 'Confirmed messages sent in the last 30 days: 3' });
      const gridPaths = Array.from(
        chart.querySelectorAll('.quick-planner-activity-month-grid .quick-planner-activity-grid-line'),
        (line) => line.getAttribute('d'),
      );
      expect(gridPaths.length).toBeGreaterThan(0);
      expect(gridPaths.every((path) => path?.startsWith('M 18 ' ) && path.endsWith(' H 342'))).toBe(true);
      expect(chart.querySelector('.quick-planner-activity-peak-guide'))
        .toHaveAttribute('d', expect.stringMatching(/^M 18 .+ H 342$/));
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('enlarges single-digit weekly labels without changing larger labels', () => {
    const now = new Date();
    const sendsForDay = (dayOffset: number, count: number) => {
      const sentAt = new Date(now);
      sentAt.setDate(sentAt.getDate() - dayOffset);
      return Array.from({ length: count }, (_, index) => createSentMessage({
        id: `label-${dayOffset}-${index}`,
        sentAt: sentAt.toISOString(),
      }));
    };
    renderActivity(
      <QuickPlannerActivity sent={[
        ...sendsForDay(0, 9),
        ...sendsForDay(1, 20),
        ...sendsForDay(2, 100),
      ]} />,
    );

    const chart = screen.getByRole('img', { name: 'Confirmed messages sent in the last 7 days: 129' });
    const labels = Array.from(chart.querySelectorAll('.quick-planner-activity-count'));
    expect(labels.find((label) => label.textContent === '9')).toHaveClass('is-single-digit');
    expect(labels.find((label) => label.textContent === '20')).not.toHaveClass('is-single-digit');
    expect(labels.find((label) => label.textContent === '100')).not.toHaveClass('is-single-digit');
  });

  it('switches between the weekly and monthly activity ranges', () => {
    const now = new Date();
    const recentSentAt = now.toISOString();
    const olderSentAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    renderActivity(
      <QuickPlannerActivity sent={[
        createSentMessage({ id: 'recent', sentAt: recentSentAt }),
        createSentMessage({ id: 'monthly-a', sentAt: olderSentAt }),
        createSentMessage({ id: 'monthly-b', sentAt: olderSentAt }),
      ]} />,
    );

    expect(screen.getByRole('img', { name: 'Confirmed messages sent in the last 7 days: 1' })).toBeInTheDocument();
    const periodGroup = screen.getByRole('group', { name: 'Activity period' });
    const monthButton = screen.getByRole('button', { name: '30 days' });
    const weekButton = screen.getByRole('button', { name: '7 days' });
    fireEvent.click(monthButton);

    const chart = screen.getByRole('img', { name: 'Confirmed messages sent in the last 30 days: 3' });
    expect(chart).toHaveAttribute('data-period', '30');
    expect(chart.querySelectorAll('.quick-planner-activity-month-bar')).toHaveLength(2);
    expect(chart.querySelectorAll('.quick-planner-activity-count')).toHaveLength(0);
    expect(chart.querySelector('.quick-planner-activity-peak-guide')).toBeInTheDocument();
    const monthDays = Array.from(chart.querySelectorAll('.quick-planner-activity-day'));
    expect(monthDays.filter((day) => day.classList.contains('has-month-tick'))).toHaveLength(5);
    expect(monthDays[monthDays.length - 1]).toHaveClass('is-today');
    expect(monthDays[monthDays.length - 2]).toHaveClass('is-before-today');
    expect(monthDays[monthDays.length - 1].querySelector('.quick-planner-activity-day-label'))
      .toHaveTextContent(String(new Date().getDate()));
    expect(chart.querySelectorAll('.quick-planner-activity-date-label')).toHaveLength(0);
    expect(monthDays[0]).not.toHaveClass('is-today');
    expect(monthButton).toHaveAttribute('aria-pressed', 'true');
    expect(periodGroup).toContainElement(monthButton);
    fireEvent.click(weekButton);

    expect(screen.getByRole('img', { name: 'Confirmed messages sent in the last 7 days: 1' })).toHaveAttribute('data-period', '7');
    expect(weekButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('scales monthly bars and aligns them with the full-width date grid', () => {
    const now = new Date();
    const monthlyPeakDate = new Date(now);
    monthlyPeakDate.setDate(monthlyPeakDate.getDate() - 20);
    monthlyPeakDate.setHours(12, 0, 0, 0);
    const makeSendsForDay = (dayOffset: number, count: number) => {
      const sentAt = new Date(now);
      sentAt.setDate(sentAt.getDate() - dayOffset);
      sentAt.setHours(12, 0, 0, 0);
      if (dayOffset === 0) sentAt.setTime(now.getTime() - 60_000);
      return Array.from({ length: count }, (_, index) => createSentMessage({
        id: `day-${dayOffset}-${index}`,
        sentAt: sentAt.toISOString(),
      }));
    };

    renderActivity(
      <QuickPlannerActivity sent={[
        ...makeSendsForDay(0, 1),
        ...makeSendsForDay(10, 100),
        ...makeSendsForDay(20, 1000),
      ]} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));

    const chart = screen.getByRole('img', { name: 'Confirmed messages sent in the last 30 days: 1101' });
    const bars = Array.from(chart.querySelectorAll('.quick-planner-activity-month-bar'));
    expect(bars).toHaveLength(3);
    expect(bars.map((bar) => Math.round(Number(bar.getAttribute('x')) + Number(bar.getAttribute('width')) / 2)))
      .toEqual([114, 234, 354]);
    expect(bars.every((bar) => Number(bar.getAttribute('x')) >= 0
      && Number(bar.getAttribute('x')) + Number(bar.getAttribute('width')) <= 360)).toBe(true);
    expect(bars.map((bar) => bar.getAttribute('aria-label')))
      .toEqual(expect.arrayContaining([
        expect.stringContaining('100 messages sent'),
        expect.stringContaining('1000 messages sent'),
      ]));
    expect(chart.querySelector('title')).not.toBeInTheDocument();
    expect(Array.from(chart.querySelectorAll('.quick-planner-activity-count'), (label) => label.textContent))
        .toEqual([]);
    expect(Array.from(chart.querySelectorAll('.quick-planner-activity-scale-label'), (label) => label.textContent))
        .toEqual(['1k']);
    expect(chart.querySelector('.quick-planner-activity-scale-label.is-peak'))
        .toHaveAttribute('x', '-12');
    expect(chart.querySelector('.quick-planner-activity-scale-label.is-peak')).toHaveTextContent('1k');
    expect(chart.querySelector('.quick-planner-activity-peak-guide'))
      .toHaveAttribute('d', 'M 0 12 H 360');
    expect(chart.querySelectorAll('.quick-planner-activity-day')).toHaveLength(30);
    const hitAreas = Array.from(chart.querySelectorAll('.quick-planner-activity-month-hit-area'));
    expect(hitAreas).toHaveLength(30);
    expect(hitAreas[0]).toHaveAttribute('x', '0');
    expect(hitAreas[0]).toHaveAttribute('width', '12');
    expect(hitAreas[29]).toHaveAttribute('x', '348');
    expect(hitAreas[29]).toHaveAttribute('width', '12');
    expect(chart.querySelector('.quick-planner-activity-days')).toHaveClass('is-month');
    expect(chart.querySelectorAll('.quick-planner-activity-day.has-month-tick')).toHaveLength(5);
    expect(chart.querySelectorAll('.quick-planner-activity-day-label')).toHaveLength(30);

    const monthDays = Array.from(chart.querySelectorAll('.quick-planner-activity-day'));
    const hoveredDay = monthDays.find((day) => day.getAttribute('aria-label')?.includes('1000 messages sent'));
    expect(hoveredDay).toBeDefined();
    if (hoveredDay === undefined) throw new Error('Expected a day with 1000 messages sent');
    expect(hoveredDay).not.toHaveClass('is-hovered');
    vi.useFakeTimers();
    const interactionArea = chart.querySelector('.quick-planner-activity-month-interaction-area');
    expect(interactionArea).toBeInTheDocument();
    if (interactionArea === null) throw new Error('Expected the monthly chart interaction area');
    fireEvent.mouseEnter(hoveredDay);
    expect(hoveredDay).not.toHaveClass('is-hovered');
    expect(chart.querySelector('.quick-planner-activity-tooltip')).not.toBeInTheDocument();
    const hoveredHitArea = hitAreas[monthDays.indexOf(hoveredDay)];
    if (hoveredHitArea === undefined) throw new Error('Expected the hovered day hit area');
    fireEvent.mouseEnter(interactionArea);
    fireEvent.mouseEnter(hoveredHitArea);
    expect(hoveredDay).toHaveClass('is-hovered');
    expect(hoveredDay.querySelector('.quick-planner-activity-day-label')).toHaveTextContent(/\d+/);
    expect(chart.querySelector('.quick-planner-activity-tooltip')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(999));
    expect(chart.querySelector('.quick-planner-activity-tooltip')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(chart.querySelector('.quick-planner-activity-tooltip')).toHaveTextContent(/1000 messages sent/);
    expect(chart.querySelector('.quick-planner-activity-tooltip')).toHaveTextContent(
      new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(monthlyPeakDate),
    );
    expect(chart.querySelector('.quick-planner-activity-day.is-near-hovered')).toBeInTheDocument();

    const zeroCountDayIndex = monthDays.findIndex((day) => day.getAttribute('aria-label')?.includes('0 messages sent'));
    expect(zeroCountDayIndex).toBeGreaterThanOrEqual(0);
    fireEvent.mouseEnter(chart.querySelectorAll('.quick-planner-activity-month-hit-area')[zeroCountDayIndex]);
    expect(chart.querySelector('.quick-planner-activity-tooltip')).toHaveTextContent(/0 messages sent/);
    fireEvent.mouseLeave(chart);
    expect(chart.querySelector('.quick-planner-activity-tooltip')).not.toBeInTheDocument();
    expect(hoveredDay).not.toHaveClass('is-hovered');

    const zeroCountHitArea = hitAreas[zeroCountDayIndex];
    if (zeroCountHitArea === undefined) throw new Error('Expected the zero-count day hit area');
    fireEvent.mouseEnter(interactionArea);
    fireEvent.mouseEnter(zeroCountHitArea);
    expect(chart.querySelector('.quick-planner-activity-tooltip')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(chart.querySelector('.quick-planner-activity-tooltip')).toHaveTextContent(/0 messages sent/);
    fireEvent.mouseLeave(chart);
    vi.useRealTimers();
  });

  it('shows the peak as the final scale label and aligns it with the peak guide', () => {
    const now = new Date();
    const sentAt = new Date(now.getTime() - 60_000).toISOString();
    renderActivity(
      <QuickPlannerActivity sent={Array.from({ length: 100 }, (_, index) => createSentMessage({
        id: `daily-${index}`,
        sentAt,
      }))} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));

    const chart = screen.getByRole('img', { name: 'Confirmed messages sent in the last 30 days: 100' });
    expect(Array.from(chart.querySelectorAll('.quick-planner-activity-scale-label'), (label) => label.textContent))
      .toEqual(['100']);
    const peakLabel = chart.querySelector('.quick-planner-activity-scale-label.is-peak');
    expect(peakLabel).toHaveTextContent('100');
    expect(peakLabel).toHaveAttribute('y', '14.5');
    expect(chart.querySelector('.quick-planner-activity-month-bar'))
      .toHaveAttribute('y', '12');
    expect(chart.querySelector('.quick-planner-activity-month-bar'))
      .toHaveAttribute('height', '70');
    expect(chart.querySelector('.quick-planner-activity-month-bar.is-peak')).toBeInTheDocument();
  });

  it('shows only the daily peak as the monthly scale label', () => {
    const sentAt = new Date(Date.now() - 60_000).toISOString();
    const { rerender } = renderActivity(
      <QuickPlannerActivity sent={Array.from({ length: 10 }, (_, index) => createSentMessage({
        id: `scale-${index}`,
        sentAt,
      }))} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));

    for (const peak of [10, 11, 30, 31, 50, 51] as const) {
      rerender(
        <LocaleProvider>
          <QuickPlannerActivity sent={Array.from({ length: peak }, (_, index) => createSentMessage({
            id: `scale-${peak}-${index}`,
            sentAt,
          }))} />
        </LocaleProvider>,
      );
      const chart = screen.getByRole('img', { name: new RegExp(`last 30 days: ${peak}$`) });
      const scaleLabels = Array.from(chart.querySelectorAll('.quick-planner-activity-scale-label'), (label) => label.textContent);
      expect(scaleLabels).toEqual([String(peak)]);
      expect(chart.querySelector('.quick-planner-activity-scale-label.is-peak')).toHaveTextContent(String(peak));
      expect(chart.querySelector('.quick-planner-activity-peak-guide')).toHaveAttribute('d', 'M 0 12 H 360');
    }
  });

  it('shows the loading state until history is ready', () => {
    renderActivity(<QuickPlannerActivity historyReady={false} />);

    expect(screen.getByText('Loading activity…')).toBeInTheDocument();
    expect(screen.queryByText('Nothing here yet.')).not.toBeInTheDocument();
  });

  it('shows history errors instead of the empty state', () => {
    renderActivity(<QuickPlannerActivity historyReady={false} historyError />);

    expect(screen.getByText('Message history could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByText('Nothing here yet.')).not.toBeInTheDocument();
  });
});
