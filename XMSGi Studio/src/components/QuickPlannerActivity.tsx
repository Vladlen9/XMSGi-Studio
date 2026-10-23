import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ScheduledMessage } from '@/types';
import { useLocale } from '@/lib/i18n';
import './QuickPlannerActivity.css';

type QuickPlannerActivityProps = {
  sent?: ScheduledMessage[];
  historyReady?: boolean;
  historyError?: boolean;
};

type ActivityPeriod = 7 | 30;
const WEEKLY_PLOT_TOP = 10;
const ACTIVITY_SCALE_STEPS = 5;
const WEEKLY_LINE_EDGE_INSET_PX = 12;

function getLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function getActivityDays(messages: ScheduledMessage[], now: Date, period: ActivityPeriod) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const firstDay = new Date(today);
  firstDay.setDate(firstDay.getDate() - (period - 1));
  const dates = Array.from({ length: period }, (_, index) => {
    const date = new Date(firstDay);
    date.setDate(firstDay.getDate() + index);
    return date;
  });
  const counts = new Map(dates.map((date) => [getLocalDateKey(date), 0]));
  const seen = new Set<string>();

  for (const message of messages) {
    if (message.status !== 'sent' || !message.sentAt) continue;
    const timestamp = Date.parse(message.sentAt);
    if (!Number.isFinite(timestamp) || timestamp > now.getTime() || timestamp < firstDay.getTime()) continue;

    const identity = message.sendAttemptId
      ? `attempt:${message.sendAttemptId}`
      : `message:${message.id}`;
    if (seen.has(identity)) continue;
    seen.add(identity);

    const key = getLocalDateKey(new Date(timestamp));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return dates.map((date) => ({ date, count: counts.get(getLocalDateKey(date)) ?? 0 }));
}

function getChartPoints(
  counts: number[],
  top: number,
  scaleMax = Math.max(...counts),
  left = 0,
  right = 360,
) {
  const bottom = 82;
  const max = Math.max(...counts);

  return counts.map((count, index) => ({
    x: counts.length === 7
      ? left + (index / (counts.length - 1)) * (right - left)
      : left + ((index + 0.5) / counts.length) * (right - left),
    y: max === 0 || scaleMax <= 0
      ? bottom
      : bottom - (count / scaleMax) * (bottom - top),
  }));
}

function formatMonthlyCount(count: number) {
  if (count < 1000) return String(count);
  const thousands = count / 1000;
  return `${Number(thousands.toFixed(thousands < 10 ? 1 : 0))}k`;
}

function getSmoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) return '';

  const slopes = points.slice(0, -1).map((point, index) => points[index + 1].y - point.y);
  const tangents = points.map((_, index) => {
    if (index === 0 || index === points.length - 1) return 0;

    const previousSlope = slopes[index - 1];
    const nextSlope = slopes[index];
    return previousSlope * nextSlope <= 0 ? 0 : (previousSlope + nextSlope) / 2;
  });

  return points.slice(0, -1).reduce((path, point, index) => {
    const next = points[index + 1];
    const delta = next.y - point.y;
    let startTangent = tangents[index];
    let endTangent = tangents[index + 1];

    if (delta === 0) {
      startTangent = 0;
      endTangent = 0;
    } else {
      const startRatio = startTangent / delta;
      const endRatio = endTangent / delta;
      const tangentMagnitude = Math.hypot(startRatio, endRatio);
      if (tangentMagnitude > 3) {
        const scale = 3 / tangentMagnitude;
        startTangent *= scale;
        endTangent *= scale;
      }
    }

    const segmentWidth = next.x - point.x;
    const startsAfterFlat = index > 0 && slopes[index - 1] === 0;
    const endsBeforeFlat = index < slopes.length - 1 && slopes[index + 1] === 0;
    const startHandle = startsAfterFlat ? 0.38 : 1 / 3;
    const endHandle = endsBeforeFlat ? 0.38 : 1 / 3;
    const control1X = point.x + segmentWidth * startHandle;
    const control1Y = Math.min(Math.max(point.y + startTangent / 3, Math.min(point.y, next.y)), Math.max(point.y, next.y));
    const control2X = next.x - segmentWidth * endHandle;
    const control2Y = Math.min(Math.max(next.y - endTangent / 3, Math.min(point.y, next.y)), Math.max(point.y, next.y));
    return `${path} C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${next.x} ${next.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

export function QuickPlannerActivity({
  sent = [],
  historyReady = true,
  historyError = false,
}: QuickPlannerActivityProps) {
  const { locale, t } = useLocale();
  const [period, setPeriod] = useState<ActivityPeriod>(7);
  const [hoveredMonthDay, setHoveredMonthDay] = useState<string | null>(null);
  const [monthTooltipVisible, setMonthTooltipVisible] = useState(false);
  const [monthTooltipLeft, setMonthTooltipLeft] = useState<number | null>(null);
  const [monthlyChartWidth, setMonthlyChartWidth] = useState(0);
  const [monthlyChartHeight, setMonthlyChartHeight] = useState(0);
  const [weeklyBaselineBounds, setWeeklyBaselineBounds] = useState({ left: 0, right: 360 });
  const monthTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activitySectionRef = useRef<HTMLElement>(null);
  const activityChartRef = useRef<HTMLDivElement>(null);
  const monthTooltipRef = useRef<HTMLDivElement>(null);
  const activityDays = getActivityDays(sent, new Date(), period);
  const chartDays = activityDays;
  const dateLocale = locale === 'ru' ? 'ru-RU' : 'en-US';
  const total = activityDays.reduce((count, day) => count + day.count, 0);
  const todayKey = getLocalDateKey(new Date());
  const gradientId = `activity-area-${useId().replace(/:/g, '')}`;
  const lineGradientId = `${gradientId}-line`;
  const monthBarGradientId = `${gradientId}-month-bar`;
  const edgeFadeId = `${gradientId}-edge-fade`;
  const activityMax = Math.max(...activityDays.map(({ count }) => count));
  const monthlyScaleMax = Math.max(activityMax, ACTIVITY_SCALE_STEPS);
  const weeklyScaleMax = Math.max(ACTIVITY_SCALE_STEPS, activityMax);
  const weeklyGridLines = Array.from({ length: ACTIVITY_SCALE_STEPS }, (_, index) => (
    Number((WEEKLY_PLOT_TOP + ((82 - WEEKLY_PLOT_TOP) * index) / ACTIVITY_SCALE_STEPS).toFixed(1))
  ));
  const monthlyPlotTop = monthlyChartHeight > 26
    ? 12 - (10 * 108) / (monthlyChartHeight - 26)
    : 12;
  const monthlyPlotLeft = 0;
  const monthlyPlotRight = 360;
  const weeklyPlotLeft = monthlyChartWidth > 24
    ? ((12 + (monthlyChartWidth - 24) / 14) * 360) / monthlyChartWidth
    : 36;
  const monthlyScaleLabelX = monthlyPlotLeft - 12;
  const chartPoints = getChartPoints(
    chartDays.map(({ count }) => count),
    period === 30 ? monthlyPlotTop : WEEKLY_PLOT_TOP,
    period === 30 ? monthlyScaleMax : weeklyScaleMax,
    period === 30 ? monthlyPlotLeft : weeklyPlotLeft,
    period === 30 ? monthlyPlotRight : 360 - weeklyPlotLeft,
  );
  const monthlyScaleTicks = activityMax === 0
    ? [{ value: 0, y: 82 }]
    : Array.from({ length: 5 }, (_, index) => {
      const value = Math.round((activityMax * index) / 4);
      const y = 82 - (value / monthlyScaleMax) * (82 - monthlyPlotTop);
      return { value, y };
    }).filter((tick, index, ticks) => index === 0 || tick.value !== ticks[index - 1].value);
  const monthlyPeakY = 82 - (activityMax / monthlyScaleMax) * (82 - monthlyPlotTop);
  const weeklyEdgeInset = monthlyChartWidth > 0 ? (7 * 360) / monthlyChartWidth : 0;
  const weeklyLineEdgeInset = monthlyChartWidth > 0
    ? (WEEKLY_LINE_EDGE_INSET_PX * 360) / monthlyChartWidth
    : 0;
  const lineStartX = period === 7 ? -24 + weeklyEdgeInset + weeklyLineEdgeInset : -24;
  const lineEndX = period === 7 ? 384 - weeklyEdgeInset - weeklyLineEdgeInset : 384;
  const hoveredMonthDayIndex = chartDays.findIndex(
    ({ date }) => getLocalDateKey(date) === hoveredMonthDay,
  );
  const hoveredMonthDayData = hoveredMonthDayIndex >= 0
    ? chartDays[hoveredMonthDayIndex]
    : null;
  const hoveredMonthDayDateLabel = hoveredMonthDayData
    ? new Intl.DateTimeFormat(dateLocale, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(hoveredMonthDayData.date)
    : '';
  useLayoutEffect(() => {
    const chart = activityChartRef.current;
    const section = activitySectionRef.current;
    if (!chart || !section) return;

    const updateChartBounds = () => {
      const chartBounds = chart.getBoundingClientRect();
      const sectionBounds = section.getBoundingClientRect();
      setMonthlyChartWidth(chartBounds.width);
      setMonthlyChartHeight(chartBounds.height);
      if (chartBounds.width === 0) return;

      const scale = 360 / chartBounds.width;
      const left = Math.max(-24, (sectionBounds.left - chartBounds.left) * scale);
      const right = Math.min(384, (sectionBounds.right - chartBounds.left) * scale);
      setWeeklyBaselineBounds((current) => (
        Math.abs(current.left - left) < 0.01 && Math.abs(current.right - right) < 0.01
          ? current
          : { left, right }
      ));
    };
    updateChartBounds();
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(updateChartBounds);
    observer.observe(chart);
    observer.observe(section);
    return () => observer.disconnect();
  }, [historyReady, historyError]);

  useLayoutEffect(() => {
    const section = activitySectionRef.current;
    const chart = activityChartRef.current;
    const workbench = document.querySelector<HTMLElement>('.quick-planner-workbench');
    if (!section || !chart || !workbench) return;

    const updateCardHeight = () => {
      if (window.innerWidth <= 1040) {
        section.style.removeProperty('height');
        return;
      }

      const sectionBounds = section.getBoundingClientRect();
      const chartBounds = chart.getBoundingClientRect();
      const workbenchBounds = workbench.getBoundingClientRect();
      const sectionStyle = getComputedStyle(section);
      const naturalHeight = chartBounds.bottom - sectionBounds.top
        + Number.parseFloat(sectionStyle.paddingBottom)
        + Number.parseFloat(sectionStyle.borderBottomWidth);
      const workbenchAlignedHeight = workbenchBounds.bottom - sectionBounds.top;
      const targetHeight = Math.max(naturalHeight, workbenchAlignedHeight);

      if (Math.abs(sectionBounds.height - targetHeight) > 0.5) {
        section.style.height = `${targetHeight}px`;
      }
    };

    updateCardHeight();
    window.addEventListener('resize', updateCardHeight);
    if (typeof ResizeObserver === 'undefined') {
      return () => window.removeEventListener('resize', updateCardHeight);
    }

    const observer = new ResizeObserver(updateCardHeight);
    observer.observe(section);
    observer.observe(chart);
    observer.observe(workbench);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateCardHeight);
      section.style.removeProperty('height');
    };
  }, [historyReady, historyError]);

  const handleMonthChartEnter = () => {
    if (monthTooltipVisible || monthTooltipTimerRef.current) return;
    setMonthTooltipVisible(false);
    monthTooltipTimerRef.current = setTimeout(() => {
      setMonthTooltipVisible(true);
      monthTooltipTimerRef.current = null;
    }, 1000);
  };
  const handleMonthDayEnter = (dayKey: string) => {
    setHoveredMonthDay(dayKey);
  };
  const handleMonthDayLeave = () => {
    if (monthTooltipTimerRef.current) clearTimeout(monthTooltipTimerRef.current);
    monthTooltipTimerRef.current = null;
    setHoveredMonthDay(null);
    setMonthTooltipVisible(false);
  };
  useEffect(() => () => {
    if (monthTooltipTimerRef.current) clearTimeout(monthTooltipTimerRef.current);
  }, []);
  useLayoutEffect(() => {
    if (period !== 30 || hoveredMonthDayIndex < 0) return undefined;

    const updateTooltipPosition = () => {
      const section = activitySectionRef.current;
      const chart = activityChartRef.current;
      const tooltip = monthTooltipRef.current;
      if (!section || !chart || !tooltip) return;

      const sectionBounds = section.getBoundingClientRect();
      const chartBounds = chart.getBoundingClientRect();
      tooltip.style.maxWidth = `${Math.max(0, sectionBounds.width - 16)}px`;
      const tooltipWidth = tooltip.getBoundingClientRect().width;
      setMonthTooltipLeft(chartBounds.width - tooltipWidth);
    };

    updateTooltipPosition();
    window.addEventListener('resize', updateTooltipPosition);
    return () => window.removeEventListener('resize', updateTooltipPosition);
  }, [hoveredMonthDayDateLabel, hoveredMonthDayIndex, monthTooltipVisible, period]);
  const linePoints = [
    { x: lineStartX, y: chartPoints[0].y },
    ...chartPoints,
    { x: lineEndX, y: chartPoints[chartPoints.length - 1].y },
  ];
  const linePath = getSmoothPath(linePoints);
  const areaPath = `${linePath} L ${lineEndX} 92 L ${lineStartX} 92 Z`;

  return (
    <section
      className="quick-planner-activity-section"
      aria-labelledby="quick-planner-activity-heading"
      ref={activitySectionRef}
    >
      <div className="quick-planner-activity-header">
        <h2 id="quick-planner-activity-heading">{t('quickPlanner.activity')}</h2>
        <div className="quick-planner-activity-period" role="group" aria-label={t('quickPlanner.activityPeriodLabel')}>
          {([7, 30] as const).map((days) => (
            <button
              aria-pressed={period === days}
              className={`quick-planner-activity-period-option${period === days ? ' is-active' : ''}`}
              key={days}
              onClick={() => setPeriod(days)}
              type="button"
            >
              {t('quickPlanner.activityPeriodValue', { days })}
            </button>
          ))}
        </div>
      </div>
      {historyError ? (
        <p className="quick-planner-activity-state is-error">{t('quickPlanner.historyError')}</p>
      ) : !historyReady ? (
        <p className="quick-planner-activity-state">{t('quickPlanner.loadingActivity')}</p>
      ) : (
        <>
          <div className={`quick-planner-activity-total${total === 0 ? ' is-empty' : ''}`}>
            <strong className="quick-planner-activity-total-count">{new Intl.NumberFormat(dateLocale).format(total)}</strong>
            <span className="quick-planner-activity-total-copy">
              {total === 0 ? (
                <span className="quick-planner-activity-empty-copy">{t('quickPlanner.emptyActivity')}</span>
              ) : (
                <span className="quick-planner-activity-total-label">{t('quickPlanner.activityTotalLabel')}</span>
              )}
            </span>
          </div>
          <div
            className="quick-planner-activity-chart"
            role="img"
            aria-label={t('quickPlanner.activityChartLabel', { count: total, days: period })}
            data-period={period}
            ref={activityChartRef}
            onMouseLeave={() => period === 30 && handleMonthDayLeave()}
          >
            {period === 30 && <div className="quick-planner-activity-plot-depth" aria-hidden="true" />}
            <svg
              className="quick-planner-activity-chart-svg"
              viewBox="0 0 360 108"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#239dfb" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#239dfb" stopOpacity="0.015" />
                </linearGradient>
                <linearGradient id={lineGradientId} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#65c5ff" />
                  <stop offset="50%" stopColor="#168ff2" />
                  <stop offset="100%" stopColor="#54baff" />
                </linearGradient>
                <linearGradient id={monthBarGradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#75d0ff" />
                  <stop offset="45%" stopColor="#299ff4" />
                  <stop offset="100%" stopColor="#0874d1" />
                </linearGradient>
                <linearGradient
                  id={`${edgeFadeId}-gradient`}
                  gradientUnits="userSpaceOnUse"
                  x1="-24"
                  x2="384"
                  y1="0"
                  y2="0"
                >
                  <stop offset="0%" stopColor="black" />
                    <stop offset={`${((chartPoints[0].x + 24) / 408) * 100}%`} stopColor="white" />
                    <stop offset={`${((chartPoints[chartPoints.length - 1].x + 24) / 408) * 100}%`} stopColor="white" />
                  <stop offset="100%" stopColor="black" />
                </linearGradient>
              </defs>
              <mask id={edgeFadeId} maskUnits="userSpaceOnUse" x="-24" y="0" width="408" height="108">
                  <rect x="-24" width="408" height="108" fill={`url(#${edgeFadeId}-gradient)`} />
              </mask>
              {period === 30 ? (
                <>
                  {monthlyScaleTicks.map(({ value, y }, index) => (
                    <g className="quick-planner-activity-month-grid" key={`${value}-${index}`}>
                      <path
                        className={`quick-planner-activity-grid-line${index === 0 ? ' is-baseline' : ''}`}
                        d={`M ${weeklyBaselineBounds.left} ${y} H ${weeklyBaselineBounds.right}`}
                      />
                      {value === activityMax && activityMax > 0 && (
                        <text
                          className="quick-planner-activity-scale-label is-peak"
                          x={monthlyScaleLabelX}
                          y={y + 2.5}
                          textAnchor="end"
                        >
                          {formatMonthlyCount(value)}
                        </text>
                      )}
                    </g>
                  ))}
                  <path
                    className="quick-planner-activity-grid-line is-y-axis"
                    d={`M ${monthlyPlotLeft} ${monthlyPlotTop} V 82`}
                  />
                </>
              ) : (
                <>
                  {weeklyGridLines.map((y) => (
                    <path
                      className="quick-planner-activity-grid-line"
                      key={y}
                      d={`M ${weeklyBaselineBounds.left} ${y} H ${weeklyBaselineBounds.right}`}
                    />
                  ))}
                  <path
                    className="quick-planner-activity-grid-line is-baseline"
                    d={`M ${weeklyBaselineBounds.left} 82 H ${weeklyBaselineBounds.right}`}
                  />
                </>
              )}
              {period === 30 && activityMax > 0 && (
                <path
                  className="quick-planner-activity-peak-guide"
                  d={`M ${weeklyBaselineBounds.left} ${monthlyPeakY} H ${weeklyBaselineBounds.right}`}
                />
              )}
              {period === 30 && (
                <g
                  className="quick-planner-activity-month-interaction-area"
                  onMouseEnter={handleMonthChartEnter}
                  onMouseLeave={handleMonthDayLeave}
                >
                  <g className="quick-planner-activity-month-hit-areas">
                    {chartPoints.map((point, index) => {
                      const { date } = chartDays[index];
                      const dayKey = getLocalDateKey(date);

                      return (
                        <rect
                          className="quick-planner-activity-month-hit-area"
                          key={dayKey}
                          x={point.x - 360 / (period * 2)}
                          y={monthlyPlotTop}
                          width={360 / period}
                          height={82 - monthlyPlotTop}
                          onMouseEnter={() => handleMonthDayEnter(dayKey)}
                        />
                      );
                    })}
                  </g>
                  <g className="quick-planner-activity-month-bars">
                    {chartPoints.map((point, index) => {
                      const { date, count } = chartDays[index];
                      if (count === 0) return null;

                      const dateLabel = new Intl.DateTimeFormat(dateLocale, {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                      }).format(date);
                      const dayDescription = t('quickPlanner.activityDayCount', { date: dateLabel, count });

                      return (
                        <rect
                          className={`quick-planner-activity-month-bar${count === activityMax ? ' is-peak' : ''}${getLocalDateKey(date) === getLocalDateKey(new Date()) ? ' is-today' : ''}`}
                          key={getLocalDateKey(date)}
                          x={point.x - 4.3}
                          y={point.y}
                          width="8.6"
                          height={82 - point.y}
                          rx="0"
                          fill={`url(#${monthBarGradientId})`}
                          tabIndex={0}
                          aria-label={dayDescription}
                          onMouseEnter={() => handleMonthDayEnter(getLocalDateKey(date))}
                          onFocus={() => {
                            handleMonthDayEnter(getLocalDateKey(date));
                            setMonthTooltipVisible(true);
                          }}
                          onBlur={handleMonthDayLeave}
                        />
                      );
                    })}
                  </g>
                </g>
              )}
              {period === 7 && chartPoints.length > 0 && (
                <g mask={`url(#${edgeFadeId})`}>
                  <path className="quick-planner-activity-area" d={areaPath} fill={`url(#${gradientId})`} />
                  <path className="quick-planner-activity-line-depth" d={linePath} vectorEffect="non-scaling-stroke" />
                  <path className="quick-planner-activity-line-glow" d={linePath} vectorEffect="non-scaling-stroke" />
                  <path
                    className="quick-planner-activity-line"
                    d={linePath}
                    stroke={`url(#${lineGradientId})`}
                    vectorEffect="non-scaling-stroke"
                  />
                  <path className="quick-planner-activity-line-highlight" d={linePath} vectorEffect="non-scaling-stroke" />
                </g>
              )}
              {chartPoints.map((point, index) => {
                const count = chartDays[index].count;
                const showCount = period === 7 && count > 0;
                const countY = point.y + 19;

                return (
                  <g className="quick-planner-activity-point" key={getLocalDateKey(chartDays[index].date)}>
                    {showCount && (
                      <>
                        <text
                          className={`quick-planner-activity-count-shadow${count < 10 ? ' is-single-digit' : ''}`}
                          x={point.x}
                          y={countY + 1}
                          textAnchor="middle"
                        >
                          {count}
                        </text>
                        <text
                          className={`quick-planner-activity-count${count < 10 ? ' is-single-digit' : ''}`}
                          x={point.x}
                          y={countY}
                          textAnchor="middle"
                        >
                          {count}
                        </text>
                      </>
                    )}
                    {period === 7 && count > 0 && (
                      <>
                        <circle className="quick-planner-activity-point-halo" cx={point.x} cy={point.y} r="9" />
                        <circle className="quick-planner-activity-point-ring" cx={point.x} cy={point.y} r="5.5" />
                        <circle className="quick-planner-activity-point-dot" cx={point.x} cy={point.y} r="3.5" />
                      </>
                    )}
                  </g>
                );
              })}
            </svg>
            {period === 30 && hoveredMonthDayData && monthTooltipVisible && (
              <div
                className="quick-planner-activity-tooltip"
                role="tooltip"
                ref={monthTooltipRef}
                style={{ left: monthTooltipLeft ?? 0 }}
              >
                {t('quickPlanner.activityDayCount', {
                  date: hoveredMonthDayDateLabel,
                  count: hoveredMonthDayData.count,
                })}
              </div>
            )}
            <div
              className={`quick-planner-activity-days${period === 30 ? ' is-month' : ''}`}
              style={{ gridTemplateColumns: `repeat(${period}, minmax(0, 1fr))` }}
            >
              {chartDays.map(({ date, count }, index) => {
                const isToday = getLocalDateKey(date) === todayKey;
                const previousDayIsToday = index > 0
                  && getLocalDateKey(chartDays[index - 1].date) === todayKey;
                const nextDayIsToday = index < chartDays.length - 1
                  && getLocalDateKey(chartDays[index + 1].date) === todayKey;
                const showMonthTick = period === 30
                  && (isToday || (index % 7 === 0 && !previousDayIsToday && !nextDayIsToday));
                const dayLabel = period === 7
                  ? new Intl.DateTimeFormat(dateLocale, { weekday: 'short' }).format(date)
                  : new Intl.DateTimeFormat(dateLocale, { day: 'numeric' }).format(date);
                const dateLabel = new Intl.DateTimeFormat(dateLocale, { day: 'numeric' }).format(date);
                const dayKey = getLocalDateKey(date);
                const isNearHoveredMonthDay = period === 30
                  && hoveredMonthDayIndex >= 0
                  && Math.abs(index - hoveredMonthDayIndex) <= 2;
                const fullDate = new Intl.DateTimeFormat(dateLocale, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                }).format(date);
                return (
                  <div
                    className={`quick-planner-activity-day${period === 30 ? ' is-month' : ''}${isToday ? ' is-today' : ''}${period === 30 && nextDayIsToday ? ' is-before-today' : ''}${showMonthTick ? ' has-month-tick' : ''}${hoveredMonthDay === dayKey ? ' is-hovered' : ''}${isNearHoveredMonthDay ? ' is-near-hovered' : ''}`}
                    key={dayKey}
                    title={t('quickPlanner.activityDayCount', { date: fullDate, count })}
                    aria-label={t('quickPlanner.activityDayCount', { date: fullDate, count })}
                  >
                    <span className="quick-planner-activity-day-label">{dayLabel}</span>
                    {period === 7 && (
                      <span className="quick-planner-activity-date-label">{dateLabel}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
