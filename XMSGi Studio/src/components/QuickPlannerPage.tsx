import { useState } from 'react';
import {
  Archive,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eraser,
  FileText,
  List,
  Lightbulb,
  MoreHorizontal,
  Paperclip,
  Send,
  Smile,
  Zap,
} from 'lucide-react';
import './QuickPlannerPage.css';

type QuickPlannerMode = 'send' | 'schedule' | 'draft';
type ReminderType = 'task' | 'meeting' | 'reminder' | 'event' | 'idea';

const plannerModes: Array<{ id: QuickPlannerMode; label: string; icon: typeof Send }> = [
  { id: 'send', label: 'Send now', icon: Send },
  { id: 'schedule', label: 'Schedule', icon: CalendarDays },
  { id: 'draft', label: 'Draft', icon: FileText },
];

const reminderTypes: Array<{ id: ReminderType; label: string; icon: typeof CheckCircle2 }> = [
  { id: 'task', label: 'Task', icon: CheckCircle2 },
  { id: 'meeting', label: 'Meeting', icon: Clock },
  { id: 'reminder', label: 'Reminder', icon: Bell },
  { id: 'event', label: 'Event', icon: CalendarDays },
  { id: 'idea', label: 'Idea', icon: Lightbulb },
];

const upcomingReminders = [
  { time: '09:30', title: 'Finish project proposal', date: 'Mon, Oct 12, 2026' },
  { time: '14:00', title: 'Gym', date: 'Mon, Oct 12, 2026' },
  { time: '20:15', title: 'Call mom ♡', date: 'Mon, Oct 12, 2026', complete: true },
];

export function QuickPlannerPage() {
  const [publishMode, setPublishMode] = useState<QuickPlannerMode>('send');
  const [reminderType, setReminderType] = useState<ReminderType>('task');
  const [reminderText, setReminderText] = useState('');
  const selectedReminderType = reminderTypes.find(({ id }) => id === reminderType) ?? reminderTypes[0];
  const SelectedReminderTypeIcon = selectedReminderType.icon;

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
      </header>

      <div className="quick-planner-layout">
          <aside className="quick-planner-sidebar">
            {publishMode === 'send' ? (
              <div className="quick-planner-overview">
                <div className="quick-planner-overview-heading">
                  <span><Zap size={16} aria-hidden="true" />Quick Plan</span>
                  <button type="button" aria-label="Quick Plan options" title="Options">
                    <MoreHorizontal size={18} aria-hidden="true" />
                  </button>
                </div>
                <nav className="quick-planner-overview-list" aria-label="Quick Plan categories">
                  <button className="quick-planner-overview-item is-active" type="button" aria-current="page">
                    <CheckCircle2 size={17} aria-hidden="true" />
                    <span>All tasks</span>
                    <strong>7</strong>
                    <ChevronRight size={15} aria-hidden="true" />
                  </button>
                  <button className="quick-planner-overview-item" type="button">
                    <CalendarDays size={16} aria-hidden="true" />
                    <span>Today</span>
                    <strong>3</strong>
                    <ChevronRight size={15} aria-hidden="true" />
                  </button>
                  <button className="quick-planner-overview-item" type="button">
                    <CalendarDays size={16} aria-hidden="true" />
                    <span>This week</span>
                    <strong>12</strong>
                    <ChevronRight size={15} aria-hidden="true" />
                  </button>
                  <button className="quick-planner-overview-item" type="button">
                    <Archive size={16} aria-hidden="true" />
                    <span>Archive</span>
                    <strong>24</strong>
                    <ChevronRight size={15} aria-hidden="true" />
                  </button>
                </nav>
              </div>
            ) : (
              <>
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
              </>
            )}
          </aside>

          <div className="quick-planner-editor">
            <div className="quick-planner-today"><span>Today</span><strong>Sun, Oct 11</strong></div>
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
            <div className="quick-planner-selected-type" aria-live="polite">
              <SelectedReminderTypeIcon size={14} aria-hidden="true" />
              <span>{selectedReminderType.label}</span>
            </div>
            <section className="quick-planner-compose" aria-label="New reminder">
              <div className="quick-planner-compose-input-row">
                <textarea
                  aria-label="Reminder text"
                  aria-describedby="quick-planner-counter"
                  maxLength={500}
                  value={reminderText}
                  onChange={(event) => setReminderText(event.target.value)}
                  placeholder="What do you want to remember?"
                />
                <div className="quick-planner-compose-clear-rail">
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
              </div>
              <div className="quick-planner-compose-footer">
                <div className="quick-planner-tools">
                  <button type="button" aria-label="Add emoji" title="Emoji"><Smile size={18} aria-hidden="true" /></button>
                  <button type="button" aria-label="Add attachment" title="Attachment"><Paperclip size={18} aria-hidden="true" /></button>
                  <button className="quick-planner-format" type="button" aria-label="Text options" title="Text options">
                    <List size={18} aria-hidden="true" />
                  </button>
                  <div className="quick-planner-reminder-types" role="group" aria-label="Reminder type">
                    {reminderTypes.map(({ id, label, icon: TypeIcon }) => (
                      <button
                        key={id}
                        className={reminderType === id ? 'is-selected' : ''}
                        type="button"
                        aria-pressed={reminderType === id}
                        onClick={() => setReminderType(id)}
                      >
                        <TypeIcon size={12} aria-hidden="true" />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <span id="quick-planner-counter" className="quick-planner-counter">{reminderText.length} / 500</span>
                <button className="quick-planner-send" type="button" aria-label="Send reminder" title="Send reminder">
                  <Send size={21} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>
            </section>

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