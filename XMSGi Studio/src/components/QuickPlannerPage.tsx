import { useState } from 'react';
import {
  CalendarDays,
  BellOff,
  Check,
  ChevronDown,
  Clock,
  Eraser,
  FileText,
  List,
  Lightbulb,
  MoreHorizontal,
  Paperclip,
  Repeat2,
  Send,
  Smile,
  Zap,
} from 'lucide-react';
import './QuickPlannerPage.css';

type QuickPlannerMode = 'send' | 'schedule' | 'draft';

const plannerModes: Array<{ id: QuickPlannerMode; label: string; icon: typeof Send }> = [
  { id: 'send', label: 'Send now', icon: Send },
  { id: 'schedule', label: 'Schedule', icon: CalendarDays },
  { id: 'draft', label: 'Draft', icon: FileText },
];

const upcomingReminders = [
  { time: '09:30', title: 'Finish project proposal', date: 'Mon, Oct 12, 2026' },
  { time: '14:00', title: 'Gym', date: 'Mon, Oct 12, 2026' },
  { time: '20:15', title: 'Call mom ♡', date: 'Mon, Oct 12, 2026', complete: true },
];

export function QuickPlannerPage() {
  const [publishMode, setPublishMode] = useState<QuickPlannerMode>('send');
  const [reminderText, setReminderText] = useState('');
  const [silentSending, setSilentSending] = useState(false);

  return (
    <section className="quick-planner-page" aria-labelledby="quick-planner-title" data-publish-mode={publishMode}>
      <header className="quick-planner-header">
          <div className="quick-planner-heading">
            <Zap size={19} strokeWidth={2.2} aria-hidden="true" />
            <div>
              <h1 id="quick-planner-title">Quick Planner</h1>
              <span>Make space for what matters</span>
            </div>
          </div>
          <div className="quick-planner-today"><span>Today</span><strong>Sun, Oct 11</strong></div>
      </header>

      <div className="quick-planner-layout">
          <aside className="quick-planner-sidebar">
            <nav className="quick-planner-nav" aria-label="Reminder views">
              <button className="quick-planner-nav-item is-active" type="button" aria-current="page">
                <Zap size={17} aria-hidden="true" />
                <span>Quick Plan</span>
              </button>
              <button className="quick-planner-nav-item" type="button">
                <Clock size={16} aria-hidden="true" />
                <span>All Reminders</span>
              </button>
              <button className="quick-planner-nav-item" type="button">
                <CalendarDays size={16} aria-hidden="true" />
                <span>Today</span>
              </button>
              <button className="quick-planner-nav-item" type="button">
                <List size={16} aria-hidden="true" />
                <span>Archive</span>
              </button>
            </nav>
            <p className="quick-planner-sidebar-note">Small steps today build a bigger tomorrow.</p>
          </aside>

          <div className="quick-planner-editor">
            <div className="quick-planner-editor-heading">
              <span className="quick-planner-section-label">Create reminder</span>
              <div className="quick-planner-heading-actions">
                <div className="quick-planner-mode-switch" role="group" aria-label="Action mode">
                  <span className="quick-planner-mode-caption">Current action</span>
                  {plannerModes.map(({ id, label, icon: ModeIcon }) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={publishMode === id}
                      className={publishMode === id ? 'is-selected' : ''}
                      onClick={() => setPublishMode(id)}
                    >
                      <ModeIcon size={13} aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <section className="quick-planner-compose" aria-label="New reminder">
              <textarea
                aria-label="Reminder text"
                aria-describedby="quick-planner-counter"
                maxLength={500}
                value={reminderText}
                onChange={(event) => setReminderText(event.target.value)}
                placeholder="What do you want to remember?"
              />
              <div className="quick-planner-compose-footer">
                <div className="quick-planner-tools">
                  <button type="button" aria-label="Add emoji" title="Emoji"><Smile size={18} aria-hidden="true" /></button>
                  <button type="button" aria-label="Add attachment" title="Attachment"><Paperclip size={18} aria-hidden="true" /></button>
                  <button
                    className={silentSending ? 'is-selected' : ''}
                    type="button"
                    aria-label="Silent sending"
                    aria-pressed={silentSending}
                    title={silentSending ? 'Silent sending enabled' : 'Send silently'}
                    onClick={() => setSilentSending((current) => !current)}
                  >
                    <BellOff size={18} aria-hidden="true" />
                  </button>
                </div>
                <span id="quick-planner-counter" className="quick-planner-counter">{reminderText.length} / 500</span>
                <button className="quick-planner-format" type="button" aria-label="Text options" title="Text options">
                  <List size={18} aria-hidden="true" />
                </button>
                {reminderText && (
                  <button
                    className="quick-planner-clear"
                    type="button"
                    aria-label="Clear reminder text"
                    title="Clear text"
                    onClick={() => setReminderText('')}
                  >
                    <Eraser size={17} aria-hidden="true" />
                  </button>
                )}
              </div>
            </section>

            <div className="quick-planner-date-time">
              <button className="quick-planner-value-field" type="button" aria-label="Date, 12 / 10 / 2026">
                <CalendarDays size={17} aria-hidden="true" />
                <span className="quick-planner-value-content">
                  <span className="quick-planner-date-segments" aria-hidden="true">
                    <span className="quick-planner-date-segment">12</span>
                    <span className="quick-planner-date-separator">/</span>
                    <span className="quick-planner-date-month">
                      <span className="quick-planner-date-segment">10</span>
                      <small className="quick-planner-date-caption">Date</small>
                    </span>
                    <span className="quick-planner-date-separator">/</span>
                    <span className="quick-planner-date-segment is-year">2026</span>
                  </span>
                </span>
              </button>
              <button className="quick-planner-value-field" type="button" aria-label="Time, 09 : 30">
                <Clock size={17} aria-hidden="true" />
                <span className="quick-planner-value-content">
                  <small>Time</small>
                  <span className="quick-planner-time-segments" aria-hidden="true">
                    <span className="quick-planner-time-segment">09</span>
                    <span className="quick-planner-time-separator">:</span>
                    <span className="quick-planner-time-segment">30</span>
                  </span>
                </span>
              </button>
            </div>

            <div className="quick-planner-shortcuts" aria-label="Quick time options">
              <button type="button">+ 1 hour</button>
              <button type="button">+ 3 hours</button>
              <button type="button">+ 1 day</button>
              <button type="button">+ 1 week</button>
            </div>

            <div className="quick-planner-repeat-slot">
              {publishMode !== 'draft' && (
                <button className="quick-planner-repeat" type="button">
                  <Repeat2 size={17} aria-hidden="true" />
                  <span><small>Repeat</small><strong>Not repeating</strong></span>
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
              )}
            </div>

            <button className="quick-planner-submit" type="button">
              <Check size={16} aria-hidden="true" />
              <span>Set reminder</span>
            </button>
          </div>

          <aside className="quick-planner-upcoming">
            <div className="quick-planner-upcoming-heading">
              <span className="quick-planner-section-label">Upcoming</span>
              <span>3 reminders</span>
            </div>
            <div className="quick-planner-reminder-list">
              {upcomingReminders.map((reminder) => (
                <article className="quick-planner-reminder" key={reminder.title}>
                  <span className={`quick-planner-check ${reminder.complete ? 'is-complete' : ''}`} aria-hidden="true">
                    {reminder.complete ? <Check size={12} /> : null}
                  </span>
                  <div className="quick-planner-reminder-copy">
                    <strong>{reminder.time}</strong>
                    <span>{reminder.title}</span>
                    <small><CalendarDays size={11} aria-hidden="true" />{reminder.date}</small>
                  </div>
                  <button type="button" className="quick-planner-more" aria-label={`More options for ${reminder.title}`}>
                    <MoreHorizontal size={16} aria-hidden="true" />
                  </button>
                </article>
              ))}
            </div>
            <div className="quick-planner-note">
              <span className="quick-planner-note-icon"><Lightbulb size={17} aria-hidden="true" /></span>
              <p>Your future self will thank you for these reminders.</p>
            </div>
          </aside>
      </div>
    </section>
  );
}