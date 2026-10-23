import { createElement, type ReactNode } from 'react';
import { act, fireEvent, render as renderTestingLibrary, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduledMessage } from '@/types';
import { LocaleProvider } from '@/lib/i18n';
import { QuickPlannerActivity } from './QuickPlannerActivity';

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
    expect(linePath).toMatch(/384 4$/);
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
    expect(monthDays[0]).not.toHaveClass('is-today');
    expect(monthButton).toHaveAttribute('aria-pressed', 'true');
    expect(periodGroup).toContainElement(monthButton);
    fireEvent.click(weekButton);

    expect(screen.getByRole('img', { name: 'Confirmed messages sent in the last 7 days: 1' })).toHaveAttribute('data-period', '7');
    expect(weekButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('scales monthly bars and aligns them with the full-width date grid', () => {
    const now = new Date();
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
    fireEvent.mouseEnter(chart);
    fireEvent.mouseEnter(hoveredDay);
    expect(hoveredDay).toHaveClass('is-hovered');
    expect(hoveredDay.querySelector('.quick-planner-activity-day-label')).toHaveTextContent(/\d+/);
    expect(chart.querySelector('.quick-planner-activity-tooltip')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(999));
    expect(chart.querySelector('.quick-planner-activity-tooltip')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(chart.querySelector('.quick-planner-activity-tooltip')).toHaveTextContent(/1000 messages sent/);
    expect(chart.querySelector('.quick-planner-activity-tooltip')).toHaveTextContent(/October 3/);
    expect(chart.querySelector('.quick-planner-activity-day.is-near-hovered')).toBeInTheDocument();

    const zeroCountDayIndex = monthDays.findIndex((day) => day.getAttribute('aria-label')?.includes('0 messages sent'));
    expect(zeroCountDayIndex).toBeGreaterThanOrEqual(0);
    fireEvent.mouseEnter(chart.querySelectorAll('.quick-planner-activity-month-hit-area')[zeroCountDayIndex]);
    expect(chart.querySelector('.quick-planner-activity-tooltip')).toHaveTextContent(/0 messages sent/);
    fireEvent.mouseLeave(chart);
    expect(chart.querySelector('.quick-planner-activity-tooltip')).not.toBeInTheDocument();
    expect(hoveredDay).not.toHaveClass('is-hovered');

    fireEvent.mouseEnter(chart);
    fireEvent.mouseEnter(chart.querySelectorAll('.quick-planner-activity-month-hit-area')[zeroCountDayIndex]);
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
