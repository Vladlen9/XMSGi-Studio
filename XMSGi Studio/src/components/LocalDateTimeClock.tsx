import { useEffect, useState } from 'react';

export function LocalDateTimeClock() {
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    let timeoutId = 0;
    const updateAtNextMinute = () => {
      setCurrentTime(new Date());
      timeoutId = window.setTimeout(updateAtNextMinute, 60_000 - (Date.now() % 60_000) + 25);
    };

    timeoutId = window.setTimeout(updateAtNextMinute, 60_000 - (Date.now() % 60_000) + 25);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const dateLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(currentTime).toUpperCase();
  const timeLabel = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(currentTime);

  return (
    <div className="local-date-time-clock" aria-label="Current local date and time">
      <span className="local-date-time-clock-date">{dateLabel}</span>
      <time dateTime={currentTime.toISOString()}>{timeLabel}</time>
      <small>LOCAL TIME</small>
    </div>
  );
}