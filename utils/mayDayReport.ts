interface MayDayReportNote {
  id: string;
  title: string;
  body: string;
  category: 'pinned' | 'study' | 'shopping';
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

interface MayDayReportTask {
  id: string;
  title: string;
  category: 'Study' | 'Personal' | 'Break';
  date: string;
  time: string;
  completed: boolean;
  createdAt: number;
}

interface MayDayReportGoal {
  id: string;
  title: string;
  description: string;
  targetDate: string;
  progress: number;
  createdAt: number;
}

interface MayDayReportReminder {
  id: string;
  title: string;
  date: string;
  time: string;
  repeat: 'once' | 'daily' | 'weekdays' | 'weekends';
  categories: string[];
  enabled: boolean;
  createdAt: number;
}

interface MayDayReportFocusSession {
  id: string;
  date: string;
  minutes: number;
  completedAt: number;
}

export interface MayDayReportWorkspace {
  notes: MayDayReportNote[];
  tasks: MayDayReportTask[];
  goals: MayDayReportGoal[];
  reminders: MayDayReportReminder[];
  focusSessions: MayDayReportFocusSession[];
  updatedAt: number;
}

const pad = (value: number) => String(value).padStart(2, '0');
const toDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatClock = (time: string) => {
  const [hourRaw, minuteRaw] = time.split(':');
  const hour = clamp(Number(hourRaw) || 0, 0, 23);
  const minute = clamp(Number(minuteRaw) || 0, 0, 59);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${pad(minute)} ${suffix}`;
};

const formatDate = (date: Date) => date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const formatShortDate = (dateKey: string) => {
  const parsed = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? dateKey : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const daysUntil = (dateKey: string) => {
  const target = new Date(`${dateKey}T23:59:59`);
  const diff = target.getTime() - Date.now();
  return Number.isFinite(diff) ? Math.max(0, Math.ceil(diff / 86400000)) : 0;
};

const categoryLabel = (category: string) => category.charAt(0).toUpperCase() + category.slice(1);

const goalStatus = (progress: number, remaining: number) => {
  if (progress >= 100) return { label: 'Completed', tone: 'green' };
  if (remaining === 0) return { label: 'Due today', tone: 'amber' };
  if (remaining <= 7) return { label: 'Due soon', tone: 'orange' };
  return { label: 'On track', tone: 'blue' };
};

const goalToneClass: Record<string, string> = {
  green: 'badge-green',
  amber: 'badge-amber',
  orange: 'badge-orange',
  blue: 'badge-blue',
};

export const buildMayDayReportHtml = (workspace: MayDayReportWorkspace, displayName: string, generatedAt: Date = new Date()): string => {
  const today = toDateKey(generatedAt);

  const todayTasks = workspace.tasks.filter(task => task.date === today).sort((a, b) => a.time.localeCompare(b.time));
  const completedToday = todayTasks.filter(task => task.completed).length;
  const todayFocusMinutes = workspace.focusSessions.filter(session => session.date === today).reduce((sum, session) => sum + session.minutes, 0);
  const dailyGoal = clamp(Math.round((Math.min(completedToday, 3) / 3) * 60 + (Math.min(todayFocusMinutes, 15) / 15) * 40), 0, 100);

  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(generatedAt);
    date.setDate(date.getDate() - (6 - index));
    const key = toDateKey(date);
    const taskCount = workspace.tasks.filter(task => task.date === key && task.completed).length;
    const minutes = workspace.focusSessions.filter(session => session.date === key).reduce((sum, session) => sum + session.minutes, 0);
    return { key, label: date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1), taskCount, minutes, active: taskCount >= 3 || minutes >= 15 };
  });

  let currentStreak = 0;
  {
    const cursor = new Date(generatedAt);
    const todayActivity = lastSevenDays[lastSevenDays.length - 1]?.active;
    if (!todayActivity) cursor.setDate(cursor.getDate() - 1);
    for (let index = 0; index < 366; index += 1) {
      const key = toDateKey(cursor);
      const taskCount = workspace.tasks.filter(task => task.date === key && task.completed).length;
      const minutes = workspace.focusSessions.filter(session => session.date === key).reduce((sum, session) => sum + session.minutes, 0);
      if (taskCount >= 3 || minutes >= 15) {
        currentStreak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
  }

  const totalCompletedTasks = workspace.tasks.filter(task => task.completed).length;
  const totalTasks = workspace.tasks.length;
  const taskCompletionRate = totalTasks ? Math.round((totalCompletedTasks / totalTasks) * 100) : 0;
  const totalFocusMinutes = workspace.focusSessions.reduce((sum, session) => sum + session.minutes, 0);
  const focusSessionCount = workspace.focusSessions.length;
  const activeDays = lastSevenDays.filter(day => day.active).length;
  const pinnedNotes = workspace.notes.filter(note => note.pinned).length;
  const studyNotes = workspace.notes.filter(note => !note.pinned && note.category === 'study').length;
  const shoppingNotes = workspace.notes.filter(note => !note.pinned && note.category === 'shopping').length;

  const categoryStats = ['Study', 'Personal', 'Break'].map(category => ({
    category,
    count: workspace.tasks.filter(task => task.category === category).length,
  }));
  const categoryTotal = Math.max(1, categoryStats.reduce((sum, item) => sum + item.count, 0));
  const categoryColors = ['#315CEB', '#12AFA3', '#FF9E45'];

  const sortedGoals = [...workspace.goals].sort((a, b) => a.targetDate.localeCompare(b.targetDate));
  const sortedReminders = [...workspace.reminders].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  const recentSessions = [...workspace.focusSessions].sort((a, b) => b.completedAt - a.completedAt).slice(0, 6);
  const sortedNotes = [...workspace.notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);

  const chartMaxMinutes = Math.max(15, ...lastSevenDays.map(day => day.minutes));
  const chartMaxTasks = Math.max(3, ...lastSevenDays.map(day => day.taskCount));

  const weekChart = lastSevenDays.map(day => {
    const minutesHeight = Math.max(4, Math.round((day.minutes / chartMaxMinutes) * 100));
    const tasksHeight = Math.max(4, Math.round((day.taskCount / chartMaxTasks) * 100));
    return `
      <div class="day-col" title="${escapeHtml(day.key)}">
        <div class="day-stack">
          <div class="bar bar-min" style="height:${minutesHeight}%"><span class="bar-val">${day.minutes || ''}</span></div>
          <div class="bar bar-task" style="height:${tasksHeight}%"><span class="bar-val">${day.taskCount || ''}</span></div>
        </div>
        <div class="day-label">${escapeHtml(day.label)}</div>
        <div class="day-dot ${day.active ? 'dot-on' : 'dot-off'}"></div>
      </div>`;
  }).join('');

  const goalCards = sortedGoals.length ? sortedGoals.map(goal => {
    const remaining = daysUntil(goal.targetDate);
    const status = goalStatus(goal.progress, remaining);
    return `
      <div class="goal-card">
        <div class="goal-head">
          <div class="goal-title-wrap">
            <p class="goal-title">${escapeHtml(goal.title)}</p>
            <p class="goal-desc">${escapeHtml(goal.description)}</p>
          </div>
          <span class="badge ${goalToneClass[status.tone]}">${status.label}</span>
        </div>
        <div class="goal-meta">
          <span>Target: ${escapeHtml(formatShortDate(goal.targetDate))}</span>
          <span class="goal-remaining">${remaining} ${remaining === 1 ? 'day' : 'days'} left</span>
        </div>
        <div class="track"><div class="track-fill goal-fill" style="width:${clamp(goal.progress, 0, 100)}%"></div></div>
        <div class="goal-foot">
          <span>${goal.progress}% complete</span>
          <span class="goal-progress">${goal.progress >= 100 ? 'Target reached' : `${100 - goal.progress}% remaining`}</span>
        </div>
      </div>`;
  }).join('') : '<p class="empty">No goals set yet — every great result starts with a target.</p>';

  const categoryRows = categoryStats.map((item, index) => {
    const percent = Math.round((item.count / categoryTotal) * 100);
    return `
      <div class="cat-row">
        <span class="cat-name">${escapeHtml(item.category)}</span>
        <div class="track"><div class="track-fill" style="width:${percent}%;background:${categoryColors[index]}"></div></div>
        <span class="cat-count">${item.count} · ${percent}%</span>
      </div>`;
  }).join('');

  const reminderRows = sortedReminders.length ? sortedReminders.slice(0, 12).map(reminder => `
    <div class="row-item">
      <span class="row-icon bell-icon ${reminder.enabled ? 'on' : ''}">${reminder.enabled ? '●' : '○'}</span>
      <div class="row-main">
        <p class="row-title">${escapeHtml(reminder.title)}</p>
        <p class="row-sub">${escapeHtml(formatShortDate(reminder.date))} at ${formatClock(reminder.time)} · ${escapeHtml(reminder.repeat)} · ${escapeHtml(reminder.categories.join(', '))}</p>
      </div>
      <span class="badge ${reminder.enabled ? 'badge-blue' : 'badge-gray'}">${reminder.enabled ? 'Active' : 'Paused'}</span>
    </div>`).join('') : '<p class="empty">No reminders set yet — stay on track with gentle nudges.</p>';

  const taskRows = todayTasks.length ? todayTasks.map(task => `
    <div class="row-item">
      <span class="row-icon ${task.completed ? 'check-on' : 'check-off'}">${task.completed ? '✓' : ''}</span>
      <div class="row-main">
        <p class="row-title ${task.completed ? 'strike' : ''}">${escapeHtml(task.title)}</p>
        <p class="row-sub">${escapeHtml(task.category)} · ${formatClock(task.time)}</p>
      </div>
      <span class="badge ${task.completed ? 'badge-green' : 'badge-gray'}">${task.completed ? 'Done' : 'Open'}</span>
    </div>`).join('') : '<p class="empty">No tasks planned for today.</p>';

  const sessionRows = recentSessions.length ? recentSessions.map(session => `
    <div class="row-item">
      <span class="row-icon timer-icon">⌁</span>
      <div class="row-main">
        <p class="row-title">${session.minutes} minute focus session</p>
        <p class="row-sub">${escapeHtml(formatShortDate(session.date))}</p>
      </div>
      <span class="badge badge-blue">${session.minutes} min</span>
    </div>`).join('') : '<p class="empty">Complete a focus session to start building your deep-work record.</p>';

  const noteCards = sortedNotes.length ? sortedNotes.map(note => `
    <div class="note-card">
      <div class="note-head">
        <p class="note-title">${escapeHtml(note.title)}</p>
        ${note.pinned ? '<span class="note-pin">●</span>' : ''}
      </div>
      <p class="note-body">${escapeHtml(note.body)}</p>
      <div class="note-foot">
        <span class="badge badge-gray">${escapeHtml(categoryLabel(note.category))}</span>
        <span class="note-date">${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(note.updatedAt))}</span>
      </div>
    </div>`).join('') : '<p class="empty">No notes yet — capture your ideas to grow your portfolio of learning.</p>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>May Day Performance Report — ${escapeHtml(displayName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif; background: #eef1f7; color: #17223b; line-height: 1.55; padding: 20px; }
  .page { max-width: 980px; margin: 0 auto; }
  .hero { position: relative; overflow: hidden; border-radius: 26px; padding: 42px 38px; color: #fff; background: linear-gradient(135deg, #315CEB 0%, #6255F6 55%, #7C4DFF 100%); box-shadow: 0 24px 60px rgba(49, 92, 235, 0.28); }
  .hero:before { content: ""; position: absolute; width: 300px; height: 300px; border-radius: 50%; background: rgba(255, 255, 255, 0.09); top: -130px; right: -70px; }
  .hero:after { content: ""; position: absolute; width: 200px; height: 200px; border-radius: 50%; background: rgba(255, 255, 255, 0.07); bottom: -110px; left: -50px; }
  .hero .kicker { text-transform: uppercase; letter-spacing: 0.26em; font-size: 11px; font-weight: 800; opacity: 0.92; }
  .hero h1 { margin-top: 12px; font-size: 36px; letter-spacing: -0.02em; line-height: 1.15; }
  .hero .sub { margin-top: 10px; max-width: 640px; font-size: 14px; opacity: 0.9; }
  .hero .meta { margin-top: 18px; font-size: 12px; font-weight: 700; opacity: 0.85; }
  .hero .ring-wrap { position: absolute; right: 34px; top: 50%; transform: translateY(-50%); text-align: center; z-index: 1; }
  .hero .ring { position: relative; width: 128px; height: 128px; border-radius: 50%; display: grid; place-items: center; }
  .hero .ring-inner { width: 96px; height: 96px; border-radius: 50%; background: #fff; display: grid; place-items: center; }
  .hero .ring-value { font-size: 26px; font-weight: 900; color: #17223b; line-height: 1; }
  .hero .ring-label { font-size: 9px; font-weight: 900; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px; }
  .section { margin-top: 22px; background: #fff; border-radius: 22px; padding: 26px 28px; box-shadow: 0 14px 40px rgba(23, 34, 59, 0.07); }
  .section h2 { font-size: 18px; letter-spacing: -0.01em; color: #17223b; }
  .section .lead { margin-top: 6px; font-size: 13px; color: #5e6a7e; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin-top: 20px; }
  .stat { border-radius: 18px; border: 1px solid #e6eaf3; background: #fafbfe; padding: 16px; }
  .stat .stat-value { font-size: 26px; font-weight: 900; letter-spacing: -0.02em; }
  .stat .stat-label { margin-top: 4px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #7a8499; }
  .stat .stat-note { margin-top: 4px; font-size: 11px; font-weight: 600; color: #98a2b3; }
  .stat.blue .stat-value { color: #315CEB; } .stat.green .stat-value { color: #12AFA3; } .stat.orange .stat-value { color: #FF8A1F; } .stat.purple .stat-value { color: #7C4DFF; } .stat.pink .stat-value { color: #F0478A; }
  .split { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; }
  .chart { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; height: 180px; margin-top: 20px; padding: 10px 6px 0; }
  .day-col { display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1; min-width: 0; }
  .day-stack { display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 4px; width: 100%; height: 138px; }
  .bar { width: min(26px, 70%); border-radius: 8px 8px 3px 3px; position: relative; min-height: 4px; }
  .bar-min { background: linear-gradient(180deg, #7C8DFF, #315CEB); }
  .bar-task { background: linear-gradient(180deg, #43D4C3, #12AFA3); }
  .bar-val { position: absolute; left: 50%; top: -16px; transform: translateX(-50%); font-size: 9px; font-weight: 900; color: #6b7280; }
  .day-label { font-size: 11px; font-weight: 900; color: #7a8499; }
  .day-dot { width: 8px; height: 8px; border-radius: 50%; }
  .dot-on { background: #12AFA3; } .dot-off { background: #d8deea; border: 1px solid #c3ccdb; }
  .chart-legend { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 16px; font-size: 11px; font-weight: 700; color: #5e6a7e; }
  .legend-dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: middle; }
  .track { height: 10px; border-radius: 999px; background: #eef1f6; overflow: hidden; }
  .track-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #315CEB, #7C4DFF); transition: width 0.3s ease; }
  .goal-card { border: 1px solid #e6eaf3; border-radius: 18px; padding: 18px; margin-top: 14px; background: #fafbfe; }
  .goal-card:first-of-type { margin-top: 18px; }
  .goal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
  .goal-title { font-size: 15px; font-weight: 900; color: #17223b; }
  .goal-desc { margin-top: 4px; font-size: 12px; color: #6b7280; }
  .goal-meta { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; font-size: 11px; font-weight: 700; color: #8a94a8; }
  .goal-remaining { color: #315CEB; }
  .goal-card .track { margin-top: 10px; }
  .goal-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; font-size: 11px; font-weight: 800; color: #667085; }
  .goal-progress { color: #12AFA3; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; }
  .badge-blue { background: #eef2ff; color: #315CEB; } .badge-green { background: #e6faf5; color: #0c9d8c; } .badge-amber { background: #fff7e0; color: #c98000; } .badge-orange { background: #fff0e0; color: #d96e00; } .badge-gray { background: #f0f2f6; color: #7a8499; }
  .cat-row { display: grid; grid-template-columns: 110px 1fr 90px; align-items: center; gap: 14px; margin-top: 14px; }
  .cat-name { font-size: 12px; font-weight: 800; color: #344054; }
  .cat-count { text-align: right; font-size: 11px; font-weight: 800; color: #7a8499; }
  .row-item { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-bottom: 1px solid #eef1f6; }
  .row-item:last-child { border-bottom: none; }
  .row-icon { width: 34px; height: 34px; border-radius: 12px; display: grid; place-items: center; font-size: 14px; font-weight: 900; flex-shrink: 0; }
  .row-main { min-width: 0; flex: 1; }
  .row-title { font-size: 13px; font-weight: 800; color: #263248; }
  .row-sub { margin-top: 2px; font-size: 11px; font-weight: 600; color: #8a94a8; }
  .strike { text-decoration: line-through; color: #98a2b3; }
  .check-on { background: #e6faf5; color: #0c9d8c; } .check-off { background: #f0f2f6; color: #b6bfcf; } .bell-icon.on { background: #eef2ff; color: #315CEB; } .bell-icon { background: #f0f2f6; color: #b6bfcf; } .timer-icon { background: #e8f7ff; color: #137cc1; }
  .notes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; margin-top: 18px; }
  .note-card { border: 1px solid #e6eaf3; border-radius: 18px; padding: 16px; background: #fafbfe; }
  .note-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .note-title { font-size: 13px; font-weight: 900; color: #263248; }
  .note-pin { color: #4e62e9; font-size: 12px; }
  .note-body { margin-top: 8px; font-size: 12px; color: #667085; white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
  .note-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
  .note-date { font-size: 10px; font-weight: 800; color: #98a2b3; }
  .empty { margin-top: 18px; padding: 22px; border-radius: 16px; background: #f8f9fb; border: 1px dashed #d5dbe7; text-align: center; font-size: 12px; font-weight: 700; color: #8a94a8; }
  footer { margin-top: 26px; padding: 18px; text-align: center; font-size: 11px; font-weight: 700; color: #98a2b3; }
  @media (max-width: 720px) { .split { grid-template-columns: 1fr; } .hero { padding: 30px 24px; } .hero .ring-wrap { position: static; transform: none; margin-top: 24px; } .hero h1 { font-size: 28px; } .cat-row { grid-template-columns: 1fr; } }
  @media print { body { background: #fff; padding: 0; } .section, .hero { box-shadow: none; } .hero { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="page">
  <header class="hero">
    <p class="kicker">May Day · Personal Performance Report</p>
    <h1>${escapeHtml(displayName)}'s learning portfolio</h1>
    <p class="sub">A structured snapshot of your tasks, focus time, goals and habits — how active you are and how close you are to every target.</p>
    <p class="meta">Generated ${escapeHtml(formatDate(generatedAt))} · ${escapeHtml(displayName)}</p>
    <div class="ring-wrap">
      <div class="ring" style="background: conic-gradient(#13B3A6 ${dailyGoal * 3.6}deg, rgba(255,255,255,0.28) 0deg)">
        <div class="ring-inner">
          <div><div class="ring-value">${dailyGoal}%</div><div class="ring-label">Daily goal</div></div>
        </div>
      </div>
    </div>
  </header>

  <section class="section">
    <h2>Performance snapshot</h2>
    <p class="lead">Across all your May Day activity you completed <strong>${totalCompletedTasks} of ${totalTasks} tasks</strong> (${taskCompletionRate}%), logged <strong>${totalFocusMinutes} focused minutes</strong> across ${focusSessionCount} sessions, and kept <strong>${workspace.goals.length} goal${workspace.goals.length === 1 ? '' : 's'}</strong> in motion. This week you were active on ${activeDays} of 7 days${currentStreak ? ` with a ${currentStreak}-day streak` : ''}.</p>
    <div class="stats">
      <div class="stat blue"><div class="stat-value">${totalCompletedTasks}<span style="font-size:14px;color:#7a8499">/${totalTasks}</span></div><div class="stat-label">Tasks done</div><div class="stat-note">${taskCompletionRate}% all-time completion</div></div>
      <div class="stat green"><div class="stat-value">${totalFocusMinutes}</div><div class="stat-label">Focus minutes</div><div class="stat-note">${focusSessionCount} sessions saved</div></div>
      <div class="stat orange"><div class="stat-value">${completedToday}<span style="font-size:14px;color:#7a8499">/${todayTasks.length}</span></div><div class="stat-label">Today's tasks</div><div class="stat-note">${todayFocusMinutes} min focused today</div></div>
      <div class="stat purple"><div class="stat-value">${activeDays}<span style="font-size:14px;color:#7a8499">/7</span></div><div class="stat-label">Active days</div><div class="stat-note">This week</div></div>
      <div class="stat blue"><div class="stat-value">${currentStreak}</div><div class="stat-label">Day streak</div><div class="stat-note">3 tasks or 15 min keeps it alive</div></div>
      <div class="stat pink"><div class="stat-value">${workspace.goals.length}</div><div class="stat-label">Goals active</div><div class="stat-note">${workspace.reminders.length} reminders set</div></div>
    </div>
  </section>

  <section class="section">
    <h2>Weekly activity</h2>
    <p class="lead">Completed tasks (teal) and focused minutes (blue) for the last 7 days. A green dot marks a fully active day.</p>
    <div class="chart">${weekChart}</div>
    <div class="chart-legend">
      <span><span class="legend-dot" style="background:#12AFA3"></span>Tasks completed</span>
      <span><span class="legend-dot" style="background:#315CEB"></span>Focus minutes</span>
      <span><span class="legend-dot" style="background:#12AFA3;border-radius:50%"></span>Active day (3+ tasks or 15+ min)</span>
    </div>
  </section>

  <section class="section split">
    <div>
      <h2>Today's progress</h2>
      <p class="lead">Your daily goal combines task completion and focused minutes.</p>
      <div class="chart" style="height:130px">
        <div class="day-col"><div class="day-stack"><div class="bar bar-min" style="height:${Math.max(6, dailyGoal)}%"><span class="bar-val">${dailyGoal}%</span></div></div><div class="day-label">Daily goal</div></div>
        <div class="day-col"><div class="day-stack"><div class="bar bar-task" style="height:${Math.max(6, todayTasks.length ? (completedToday / todayTasks.length) * 100 : 0)}%"><span class="bar-val">${completedToday}/${todayTasks.length}</span></div></div><div class="day-label">Tasks</div></div>
        <div class="day-col"><div class="day-stack"><div class="bar bar-min" style="height:${Math.max(6, todayFocusMinutes ? Math.min(100, (todayFocusMinutes / 60) * 100) : 0)}%"><span class="bar-val">${todayFocusMinutes}m</span></div></div><div class="day-label">Focus</div></div>
      </div>
    </div>
    <div>
      <h2>Focus performance</h2>
      <p class="lead">Your most recent completed deep-work sessions.</p>
      <div style="margin-top:18px">${sessionRows}</div>
    </div>
  </section>

  <section class="section">
    <h2>Goals &amp; targets</h2>
    <p class="lead">Every goal with its target date, remaining time and current progress.</p>
    ${goalCards}
  </section>

  <section class="section">
    <h2>Task breakdown</h2>
    <p class="lead">How your planned tasks split across study, personal life and breaks.</p>
    ${categoryRows}
  </section>

  <section class="section">
    <h2>Today's tasks</h2>
    <p class="lead">${todayTasks.length ? `${completedToday} of ${todayTasks.length} completed` : 'Nothing planned for today yet.'}</p>
    <div style="margin-top:6px">${taskRows}</div>
  </section>

  <section class="section">
    <h2>Reminders</h2>
    <p class="lead">The gentle nudges keeping you on schedule.</p>
    <div style="margin-top:6px">${reminderRows}</div>
  </section>

  <section class="section">
    <h2>Notes &amp; ideas</h2>
    <p class="lead">${workspace.notes.length} saved notes · ${pinnedNotes} pinned, ${studyNotes} study, ${shoppingNotes} shopping.</p>
    <div class="notes-grid">${noteCards}</div>
  </section>

  <footer>Generated by May Day · Eduvora. Small steps today create the progress you will be proud of tomorrow.</footer>
</div>
</body>
</html>`;
};
