import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import type { User } from '../App';
import { auth, db } from '../firebase';

type MayDayTab = 'home' | 'goals' | 'reminders' | 'focus' | 'progress';
type NoteCategory = 'pinned' | 'study' | 'shopping';
type ReminderRepeat = 'once' | 'daily' | 'weekdays' | 'weekends';
type SyncStatus = 'loading' | 'local' | 'saving' | 'saved' | 'offline';

type MayDayNote = {
  id: string;
  title: string;
  body: string;
  category: NoteCategory;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
};

type MayDayTask = {
  id: string;
  title: string;
  category: 'Study' | 'Personal' | 'Break';
  date: string;
  time: string;
  completed: boolean;
  createdAt: number;
};

type MayDayGoal = {
  id: string;
  title: string;
  description: string;
  targetDate: string;
  progress: number;
  createdAt: number;
};

type MayDayReminder = {
  id: string;
  title: string;
  date: string;
  time: string;
  repeat: ReminderRepeat;
  categories: string[];
  enabled: boolean;
  lastTriggeredKey?: string;
  createdAt: number;
};

type MayDayFocusSession = {
  id: string;
  date: string;
  minutes: number;
  completedAt: number;
};

type MayDayWorkspace = {
  version: 1;
  notes: MayDayNote[];
  tasks: MayDayTask[];
  goals: MayDayGoal[];
  reminders: MayDayReminder[];
  focusSessions: MayDayFocusSession[];
  updatedAt: number;
};

interface MayDayMobileProps {
  currentUser: User | null;
  isLoggedIn: boolean;
  isPremium: boolean;
  onBack: () => void;
  onUpgrade: () => void;
}

const MAY_DAY_MARKER = 'MAY_DAY_MOBILE_V1';
const EMPTY_WORKSPACE: MayDayWorkspace = {
  version: 1,
  notes: [],
  tasks: [],
  goals: [],
  reminders: [],
  focusSessions: [],
  updatedAt: 0,
};

const iconPaths: Record<string, React.ReactNode> = {
  back: <path d="M15 18l-6-6 6-6" />,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  note: <><path d="M4 4h16v16H4z" /><path d="M8 9h8M8 13h6M8 17h4" /></>,
  goal: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="M12 2v4M22 12h-4" /></>,
  bell: <><path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v5l3 2M9 2h6" /></>,
  progress: <><path d="M4 19V9M10 19V5M16 19v-7M22 19V3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  pin: <><path d="M8 3h8l-1 6 3 3H6l3-3z" /><path d="M12 12v9" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M8 10v8M12 10v8M16 10v8" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></>,
  check: <path d="M5 12l4 4L19 6" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  play: <path d="M8 5l11 7-11 7z" />,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  reset: <><path d="M4 12a8 8 0 108-8 8.5 8.5 0 00-6 2.5L4 9" /><path d="M4 4v5h5" /></>,
  sparkle: <><path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
};

const Icon = ({ name, className = 'h-5 w-5' }: { name: keyof typeof iconPaths; className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {iconPaths[name]}
  </svg>
);

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const pad = (value: number) => String(value).padStart(2, '0');
const toDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const todayKey = () => toDateKey(new Date());
const safeText = (value: unknown, fallback = '') => typeof value === 'string' ? value.trim() : fallback;
const safeNumber = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const safeDateKey = (value: unknown, fallback = todayKey()) => /^\d{4}-\d{2}-\d{2}$/.test(safeText(value)) ? safeText(value) : fallback;
const safeTime = (value: unknown, fallback = '09:00') => /^([01]\d|2[0-3]):[0-5]\d$/.test(safeText(value)) ? safeText(value) : fallback;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeWorkspace = (value: unknown): MayDayWorkspace => {
  if (!isRecord(value)) return { ...EMPTY_WORKSPACE };
  const normalizeNotes = Array.isArray(value.notes) ? value.notes.map((item): MayDayNote | null => {
    if (!isRecord(item)) return null;
    const category = item.category === 'study' || item.category === 'shopping' ? item.category : 'pinned';
    const body = safeText(item.body).slice(0, 2000);
    const title = safeText(item.title, body.split('\n')[0] || 'Quick note').slice(0, 72);
    if (!body && !title) return null;
    return {
      id: safeText(item.id, makeId('note')),
      title,
      body,
      category,
      pinned: item.pinned === true || category === 'pinned',
      createdAt: safeNumber(item.createdAt, Date.now()),
      updatedAt: safeNumber(item.updatedAt, Date.now()),
    };
  }).filter((item): item is MayDayNote => Boolean(item)) : [];

  const normalizeTasks = Array.isArray(value.tasks) ? value.tasks.map((item): MayDayTask | null => {
    if (!isRecord(item)) return null;
    const title = safeText(item.title);
    if (!title) return null;
    const category = item.category === 'Personal' || item.category === 'Break' ? item.category : 'Study';
    return {
      id: safeText(item.id, makeId('task')),
      title: title.slice(0, 160),
      category,
      date: safeDateKey(item.date),
      time: safeTime(item.time),
      completed: item.completed === true,
      createdAt: safeNumber(item.createdAt, Date.now()),
    };
  }).filter((item): item is MayDayTask => Boolean(item)) : [];

  const normalizeGoals = Array.isArray(value.goals) ? value.goals.map((item): MayDayGoal | null => {
    if (!isRecord(item)) return null;
    const title = safeText(item.title);
    if (!title) return null;
    return {
      id: safeText(item.id, makeId('goal')),
      title: title.slice(0, 160),
      description: safeText(item.description, 'Keep moving forward, one focused step at a time.').slice(0, 500),
      targetDate: safeDateKey(item.targetDate),
      progress: clamp(safeNumber(item.progress, 0), 0, 100),
      createdAt: safeNumber(item.createdAt, Date.now()),
    };
  }).filter((item): item is MayDayGoal => Boolean(item)) : [];

  const normalizeReminders = Array.isArray(value.reminders) ? value.reminders.map((item): MayDayReminder | null => {
    if (!isRecord(item)) return null;
    const title = safeText(item.title);
    if (!title) return null;
    const repeat: ReminderRepeat = item.repeat === 'daily' || item.repeat === 'weekdays' || item.repeat === 'weekends' ? item.repeat : 'once';
    return {
      id: safeText(item.id, makeId('reminder')),
      title: title.slice(0, 160),
      date: safeDateKey(item.date),
      time: safeTime(item.time, '19:00'),
      repeat,
      categories: Array.isArray(item.categories) ? item.categories.map(entry => safeText(entry)).filter(Boolean).slice(0, 6) : ['Study'],
      enabled: item.enabled !== false,
      lastTriggeredKey: safeText(item.lastTriggeredKey),
      createdAt: safeNumber(item.createdAt, Date.now()),
    };
  }).filter((item): item is MayDayReminder => Boolean(item)) : [];

  const normalizeSessions = Array.isArray(value.focusSessions) ? value.focusSessions.map((item): MayDayFocusSession | null => {
    if (!isRecord(item)) return null;
    const minutes = clamp(Math.round(safeNumber(item.minutes, 0)), 1, 240);
    return {
      id: safeText(item.id, makeId('focus')),
      date: safeDateKey(item.date),
      minutes,
      completedAt: safeNumber(item.completedAt, Date.now()),
    };
  }).filter((item): item is MayDayFocusSession => Boolean(item)).slice(-500) : [];

  return {
    version: 1,
    notes: normalizeNotes.slice(0, 120),
    tasks: normalizeTasks.slice(0, 240),
    goals: normalizeGoals.slice(0, 60),
    reminders: normalizeReminders.slice(0, 60),
    focusSessions: normalizeSessions.slice(-180),
    updatedAt: safeNumber(value.updatedAt, 0),
  };
};

const formatClock = (time: string) => {
  const [hourRaw, minuteRaw] = time.split(':');
  const hour = clamp(Number(hourRaw) || 0, 0, 23);
  const minute = clamp(Number(minuteRaw) || 0, 0, 59);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${pad(minute)} ${suffix}`;
};

const formatNoteDate = (timestamp: number) => new Intl.DateTimeFormat(undefined, {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(new Date(timestamp));

const daysUntil = (dateKey: string) => {
  const target = new Date(`${safeDateKey(dateKey)}T23:59:59`);
  const diff = target.getTime() - Date.now();
  return Number.isFinite(diff) ? Math.max(0, Math.ceil(diff / 86400000)) : 0;
};

const noteTone: Record<NoteCategory, string> = {
  pinned: 'from-[#F4EEFF] to-[#F9F6FF] border-[#E3D7FF]',
  study: 'from-[#FFF7E6] to-[#FFFDF7] border-[#FFE1A8]',
  shopping: 'from-[#EAFBF4] to-[#F5FFFB] border-[#C6F0DF]',
};

const goalTones = [
  { icon: 'bg-[#7C4DFF]', bar: 'bg-[#8E62FF]' },
  { icon: 'bg-[#FF8A1F]', bar: 'bg-[#FF9E45]' },
  { icon: 'bg-[#10B8AA]', bar: 'bg-[#21C6B8]' },
  { icon: 'bg-[#2677F4]', bar: 'bg-[#3B8BFF]' },
  { icon: 'bg-[#F0478A]', bar: 'bg-[#FF69A4]' },
];

const MayDayMobile: React.FC<MayDayMobileProps> = ({ currentUser, isLoggedIn, isPremium, onBack, onUpgrade }) => {
  const initialTab = typeof window !== 'undefined' && ['home', 'goals', 'reminders', 'focus', 'progress'].includes(String(window.history.state?.dcMayDayTab))
    ? window.history.state.dcMayDayTab as MayDayTab
    : 'home';
  const [activeTab, setActiveTab] = useState<MayDayTab>(initialTab);
  const [workspace, setWorkspace] = useState<MayDayWorkspace>({ ...EMPTY_WORKSPACE });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [saveRevision, setSaveRevision] = useState(0);
  const workspaceRef = useRef(workspace);
  const dirtyRef = useRef(false);

  const [noteBody, setNoteBody] = useState('');
  const [noteCategory, setNoteCategory] = useState<NoteCategory>('pinned');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskTime, setTaskTime] = useState('09:00');
  const [taskCategory, setTaskCategory] = useState<MayDayTask['category']>('Study');
  const [goalEditorOpen, setGoalEditorOpen] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDescription, setGoalDescription] = useState('');
  const [goalDate, setGoalDate] = useState(todayKey());
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDate, setReminderDate] = useState(todayKey());
  const [reminderTime, setReminderTime] = useState('19:00');
  const [reminderRepeat, setReminderRepeat] = useState<ReminderRepeat>('daily');
  const [reminderCategories, setReminderCategories] = useState<string[]>(['Study']);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  });
  const [focusMinutes, setFocusMinutes] = useState(30);
  const [focusSeconds, setFocusSeconds] = useState(30 * 60);
  const [focusRunning, setFocusRunning] = useState(false);
  const [focusMessage, setFocusMessage] = useState('');
  const focusCompletionGuardRef = useRef(false);

  const uid = auth.currentUser?.uid || currentUser?.uid || currentUser?.id || '';
  const storageKey = useMemo(() => `eduvora.mayDay.workspace.v1:${uid || 'guest'}`, [uid]);
  const displayName = safeText(currentUser?.name, 'Learner').split(' ')[0] || 'Learner';

  useEffect(() => { workspaceRef.current = workspace; }, [workspace]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const currentState = window.history.state || {};
    if (currentState.dcView === 'mayDay' && !currentState.dcMayDayTab) {
      window.history.replaceState({ ...currentState, dcMayDayTab: 'home' }, '', window.location.href);
    }
    const onPopState = (event: PopStateEvent) => {
      if (event.state?.dcView !== 'mayDay') return;
      const nextTab = String(event.state?.dcMayDayTab || 'home');
      if (['home', 'goals', 'reminders', 'focus', 'progress'].includes(nextTab)) {
        setActiveTab(nextTab as MayDayTab);
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    setSyncStatus('loading');
    setCloudReady(!isLoggedIn || !uid);
    dirtyRef.current = false;
    let localWorkspace = { ...EMPTY_WORKSPACE };
    try {
      const stored = window.localStorage.getItem(storageKey);
      localWorkspace = stored ? normalizeWorkspace(JSON.parse(stored)) : { ...EMPTY_WORKSPACE };
    } catch {
      localWorkspace = { ...EMPTY_WORKSPACE };
    }
    setWorkspace(localWorkspace);
    workspaceRef.current = localWorkspace;
    setSyncStatus(uid && isLoggedIn ? 'loading' : 'local');

    if (!uid || !isLoggedIn) return undefined;
    const userRef = doc(db, 'users', uid);
    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      const remote = normalizeWorkspace(snapshot.data()?.mayDayWorkspace);
      const current = workspaceRef.current;
      if (remote.updatedAt > current.updatedAt && !dirtyRef.current) {
        setWorkspace(remote);
        workspaceRef.current = remote;
        try { window.localStorage.setItem(storageKey, JSON.stringify(remote)); } catch { /* local cache is best effort */ }
      } else if (current.updatedAt > remote.updatedAt) {
        dirtyRef.current = true;
        setSaveRevision((revision) => revision + 1);
      }
      setCloudReady(true);
      setSyncStatus(navigator.onLine ? 'saved' : 'offline');
    }, () => {
      setCloudReady(true);
      setSyncStatus(navigator.onLine ? 'local' : 'offline');
    });
    return unsubscribe;
  }, [isLoggedIn, storageKey, uid]);

  useEffect(() => {
    if (!cloudReady || !dirtyRef.current) return undefined;
    const snapshot = workspace;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
    } catch {
      // Local persistence may be blocked in private browser mode.
    }
    if (!uid || !isLoggedIn) {
      dirtyRef.current = false;
      setSyncStatus('local');
      return undefined;
    }

    setSyncStatus(navigator.onLine ? 'saving' : 'offline');
    const timer = window.setTimeout(async () => {
      try {
        await setDoc(doc(db, 'users', uid), {
          mayDayWorkspace: snapshot,
          mayDayUpdatedAt: serverTimestamp(),
        }, { merge: true });
        dirtyRef.current = false;
        setSyncStatus(navigator.onLine ? 'saved' : 'offline');
      } catch (error) {
        console.warn('May Day cloud sync failed; local copy remains available.', error);
        setSyncStatus(navigator.onLine ? 'local' : 'offline');
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [cloudReady, isLoggedIn, saveRevision, storageKey, uid, workspace]);

  const commitWorkspace = useCallback((updater: (current: MayDayWorkspace) => MayDayWorkspace) => {
    setWorkspace((current) => {
      const next = normalizeWorkspace({ ...updater(current), version: 1, updatedAt: Date.now() });
      workspaceRef.current = next;
      dirtyRef.current = true;
      try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* local cache is best effort */ }
      return next;
    });
    setSaveRevision((revision) => revision + 1);
  }, [storageKey]);

  const navigateTab = (tab: MayDayTab) => {
    if (tab === activeTab) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (typeof window !== 'undefined') {
      window.history.pushState({ ...(window.history.state || {}), dcView: 'mayDay', dcMayDayTab: tab }, '', window.location.href);
    }
    setActiveTab(tab);
    window.scrollTo(0, 0);
  };

  const handleHeaderBack = () => {
    if (typeof window !== 'undefined' && window.history.state?.dcView === 'mayDay' && window.history.length > 1) {
      window.history.back();
      return;
    }
    onBack();
  };

  const saveNote = () => {
    const body = noteBody.trim();
    if (!body) return;
    const now = Date.now();
    const title = body.split('\n')[0].slice(0, 72) || 'Quick note';
    commitWorkspace((current) => ({
      ...current,
      notes: editingNoteId
        ? current.notes.map(note => note.id === editingNoteId ? { ...note, title, body, category: noteCategory, pinned: noteCategory === 'pinned', updatedAt: now } : note)
        : [{ id: makeId('note'), title, body, category: noteCategory, pinned: noteCategory === 'pinned', createdAt: now, updatedAt: now }, ...current.notes],
    }));
    setNoteBody('');
    setNoteCategory('pinned');
    setEditingNoteId(null);
  };

  const editNote = (note: MayDayNote) => {
    setNoteBody(note.body);
    setNoteCategory(note.category);
    setEditingNoteId(note.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteNote = (id: string) => {
    commitWorkspace((current) => ({ ...current, notes: current.notes.filter(note => note.id !== id) }));
    if (editingNoteId === id) {
      setEditingNoteId(null);
      setNoteBody('');
    }
  };

  const addTask = () => {
    const title = taskTitle.trim();
    if (!title) return;
    commitWorkspace((current) => ({
      ...current,
      tasks: [{ id: makeId('task'), title, category: taskCategory, date: todayKey(), time: taskTime, completed: false, createdAt: Date.now() }, ...current.tasks],
    }));
    setTaskTitle('');
  };

  const toggleTask = (id: string) => {
    commitWorkspace((current) => ({
      ...current,
      tasks: current.tasks.map(task => task.id === id ? { ...task, completed: !task.completed } : task),
    }));
  };

  const deleteTask = (id: string) => commitWorkspace((current) => ({ ...current, tasks: current.tasks.filter(task => task.id !== id) }));

  const addGoal = () => {
    const title = goalTitle.trim();
    if (!title || !goalDate) return;
    commitWorkspace((current) => ({
      ...current,
      goals: [{
        id: makeId('goal'),
        title,
        description: goalDescription.trim() || 'Stay consistent. Success is built one focused day at a time.',
        targetDate: goalDate,
        progress: 0,
        createdAt: Date.now(),
      }, ...current.goals],
    }));
    setGoalTitle('');
    setGoalDescription('');
    setGoalDate(todayKey());
    setGoalEditorOpen(false);
  };

  const updateGoalProgress = (id: string, progress: number) => commitWorkspace((current) => ({
    ...current,
    goals: current.goals.map(goal => goal.id === id ? { ...goal, progress: clamp(progress, 0, 100) } : goal),
  }));

  const deleteGoal = (id: string) => commitWorkspace((current) => ({ ...current, goals: current.goals.filter(goal => goal.id !== id) }));

  const toggleReminderCategory = (category: string) => {
    setReminderCategories((current) => current.includes(category) ? current.filter(item => item !== category) : [...current, category]);
  };

  const addReminder = () => {
    const title = reminderTitle.trim();
    if (!title || !reminderTime) return;
    commitWorkspace((current) => ({
      ...current,
      reminders: [{
        id: makeId('reminder'),
        title,
        date: reminderDate || todayKey(),
        time: reminderTime,
        repeat: reminderRepeat,
        categories: reminderCategories.length ? reminderCategories : ['Study'],
        enabled: true,
        createdAt: Date.now(),
      }, ...current.reminders],
    }));
    setReminderTitle('');
  };

  const toggleReminder = (id: string) => commitWorkspace((current) => ({
    ...current,
    reminders: current.reminders.map(reminder => reminder.id === id ? { ...reminder, enabled: !reminder.enabled } : reminder),
  }));

  const deleteReminder = (id: string) => commitWorkspace((current) => ({ ...current, reminders: current.reminders.filter(reminder => reminder.id !== id) }));

  const requestBrowserPermission = async () => {
    if (typeof Notification === 'undefined') {
      setBrowserPermission('unsupported');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setBrowserPermission(result);
    } catch {
      setBrowserPermission(Notification.permission);
    }
  };

  const showReminderNotification = useCallback(async (reminder: MayDayReminder) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const options: NotificationOptions = {
      body: `${formatClock(reminder.time)} • ${reminder.categories.join(', ')}`,
      icon: '/icons/icon-192x192.svg',
      badge: '/icons/icon-192x192.svg',
      tag: `may-day-${reminder.id}`,
      data: { mayDay: true },
    };
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) await registration.showNotification(`May Day: ${reminder.title}`, options);
        else new Notification(`May Day: ${reminder.title}`, options);
      } else {
        new Notification(`May Day: ${reminder.title}`, options);
      }
    } catch {
      try { new Notification(`May Day: ${reminder.title}`, options); } catch { /* permission can be revoked at any time */ }
    }
  }, []);

  useEffect(() => {
    const reminderMatchesDate = (reminder: MayDayReminder, now: Date) => {
      const currentDate = toDateKey(now);
      const day = now.getDay();
      if (reminder.repeat === 'daily') return true;
      if (reminder.repeat === 'weekdays') return day >= 1 && day <= 5;
      if (reminder.repeat === 'weekends') return day === 0 || day === 6;
      return reminder.date === currentDate;
    };

    const checkReminders = () => {
      const now = new Date();
      const currentDate = toDateKey(now);
      const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const triggerKey = `${currentDate}-${currentTime}`;
      const due = workspaceRef.current.reminders.filter(reminder => reminder.enabled && reminder.time === currentTime && reminderMatchesDate(reminder, now) && reminder.lastTriggeredKey !== triggerKey);
      if (!due.length) return;
      due.forEach(reminder => void showReminderNotification(reminder));
      commitWorkspace((current) => ({
        ...current,
        reminders: current.reminders.map(reminder => due.some(item => item.id === reminder.id)
          ? { ...reminder, lastTriggeredKey: triggerKey, enabled: reminder.repeat === 'once' ? false : reminder.enabled }
          : reminder),
      }));
    };

    checkReminders();
    const interval = window.setInterval(checkReminders, 30000);
    return () => window.clearInterval(interval);
  }, [commitWorkspace, showReminderNotification]);

  const completeFocusSession = useCallback(() => {
    if (focusCompletionGuardRef.current) return;
    focusCompletionGuardRef.current = true;
    const session: MayDayFocusSession = { id: makeId('focus'), date: todayKey(), minutes: focusMinutes, completedAt: Date.now() };
    commitWorkspace((current) => ({ ...current, focusSessions: [...current.focusSessions, session].slice(-500) }));
    setFocusRunning(false);
    setFocusMessage(`${focusMinutes} minute focus session completed and saved.`);
    window.setTimeout(() => {
      focusCompletionGuardRef.current = false;
      setFocusSeconds(focusMinutes * 60);
    }, 400);
  }, [commitWorkspace, focusMinutes]);

  useEffect(() => {
    if (!focusRunning) return undefined;
    const interval = window.setInterval(() => {
      setFocusSeconds((seconds) => {
        if (seconds <= 1) {
          window.setTimeout(completeFocusSession, 0);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [completeFocusSession, focusRunning]);

  const selectFocusMinutes = (minutes: number) => {
    if (focusRunning) return;
    setFocusMinutes(minutes);
    setFocusSeconds(minutes * 60);
    setFocusMessage('');
    focusCompletionGuardRef.current = false;
  };

  const today = todayKey();
  const todayTasks = useMemo(() => workspace.tasks.filter(task => task.date === today).sort((a, b) => a.time.localeCompare(b.time)), [today, workspace.tasks]);
  const completedTasks = todayTasks.filter(task => task.completed).length;
  const todayFocusMinutes = useMemo(() => workspace.focusSessions.filter(session => session.date === today).reduce((sum, session) => sum + session.minutes, 0), [today, workspace.focusSessions]);
  const dailyGoal = clamp(Math.round((Math.min(completedTasks, 3) / 3) * 60 + (Math.min(todayFocusMinutes, 15) / 15) * 40), 0, 100);

  const lastSevenDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = toDateKey(date);
    const taskCount = workspace.tasks.filter(task => task.date === key && task.completed).length;
    const minutes = workspace.focusSessions.filter(session => session.date === key).reduce((sum, session) => sum + session.minutes, 0);
    return { key, label: date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1), taskCount, minutes, active: taskCount >= 3 || minutes >= 15 };
  }), [workspace.focusSessions, workspace.tasks]);

  const currentStreak = useMemo(() => {
    let streak = 0;
    const cursor = new Date();
    const todayActivity = lastSevenDays[lastSevenDays.length - 1]?.active;
    if (!todayActivity) cursor.setDate(cursor.getDate() - 1);
    for (let index = 0; index < 366; index += 1) {
      const key = toDateKey(cursor);
      const taskCount = workspace.tasks.filter(task => task.date === key && task.completed).length;
      const minutes = workspace.focusSessions.filter(session => session.date === key).reduce((sum, session) => sum + session.minutes, 0);
      if (taskCount >= 3 || minutes >= 15) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }, [lastSevenDays, workspace.focusSessions, workspace.tasks]);

  const pageTitle: Record<MayDayTab, string> = {
    home: 'Quick Notes',
    goals: 'Goal Countdown',
    reminders: 'Reminders',
    focus: 'Focus Session',
    progress: isPremium ? 'Daily Streak' : 'Daily Progress',
  };

  const syncLabel = syncStatus === 'saving' ? 'Saving…' : syncStatus === 'saved' ? 'Synced' : syncStatus === 'offline' ? 'Offline copy' : syncStatus === 'loading' ? 'Loading…' : 'Saved locally';

  const exportWorkspace = () => {
    const blob = new Blob([JSON.stringify(workspaceRef.current, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `may-day-${todayKey()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setPageMenuOpen(false);
  };

  const forceSync = () => {
    dirtyRef.current = true;
    setSaveRevision((revision) => revision + 1);
    setPageMenuOpen(false);
  };

  const renderHeader = () => (
    <header className="sticky top-0 z-40 border-b border-[#E7EBF3] bg-white/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-xl items-center justify-between">
        <button type="button" onClick={handleHeaderBack} aria-label="Go back" className="grid h-11 w-11 place-items-center rounded-2xl text-[#111827] transition active:bg-[#EEF3FF]">
          <Icon name="back" className="h-6 w-6" />
        </button>
        <div className="text-center">
          <h1 className="text-[17px] font-black tracking-[-0.02em] text-[#101828]">{pageTitle[activeTab]}</h1>
          <p className="mt-0.5 text-[10px] font-bold text-[#7B8499]">May Day • {syncLabel}</p>
        </div>
        <div className="relative">
          <button type="button" onClick={() => setPageMenuOpen(open => !open)} aria-label="May Day options" aria-expanded={pageMenuOpen} className="grid h-11 w-11 place-items-center rounded-2xl text-[#111827] transition active:bg-[#EEF3FF]">
            <Icon name="more" className="h-5 w-5" />
          </button>
          {pageMenuOpen ? <div className="absolute right-0 top-12 z-50 w-44 overflow-hidden rounded-2xl border border-[#E1E6EF] bg-white p-1.5 shadow-[0_18px_48px_rgba(25,45,96,0.18)]"><button type="button" onClick={forceSync} className="w-full rounded-xl px-3 py-2.5 text-left text-[11px] font-black text-[#344054] active:bg-[#EEF2FF]">Sync now</button><button type="button" onClick={exportWorkspace} className="w-full rounded-xl px-3 py-2.5 text-left text-[11px] font-black text-[#344054] active:bg-[#EEF2FF]">Export May Day data</button></div> : null}
        </div>
      </div>
    </header>
  );

  const renderTaskPlanner = () => (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-black text-[#111827]">Today&apos;s Plan</h2>
          <p className="text-[11px] font-semibold text-[#7A8499]">Small tasks, clear progress.</p>
        </div>
        <span className="rounded-full bg-[#EEF3FF] px-3 py-1 text-[11px] font-black text-[#315CEB]">{completedTasks}/{todayTasks.length}</span>
      </div>
      <div className="rounded-[20px] border border-[#E2E7F0] bg-white p-3 shadow-[0_12px_32px_rgba(38,68,139,0.08)]">
        <div className="grid grid-cols-[1fr_88px] gap-2">
          <input value={taskTitle} onChange={event => setTaskTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') addTask(); }} placeholder="Add a task…" maxLength={160} className="min-w-0 rounded-2xl border border-[#E5E9F2] bg-[#FAFBFD] px-3 py-3 text-sm font-bold text-[#111827] outline-none focus:border-[#4169F6]" />
          <input type="time" value={taskTime} onChange={event => setTaskTime(event.target.value)} className="rounded-2xl border border-[#E5E9F2] bg-[#FAFBFD] px-2 py-3 text-xs font-black text-[#344054] outline-none focus:border-[#4169F6]" />
        </div>
        <div className="mt-2 flex items-center gap-2">
          {(['Study', 'Personal', 'Break'] as const).map(category => (
            <button key={category} type="button" onClick={() => setTaskCategory(category)} className={`rounded-full px-3 py-1.5 text-[10px] font-black ${taskCategory === category ? 'bg-[#315CEB] text-white' : 'bg-[#F2F4F8] text-[#667085]'}`}>{category}</button>
          ))}
          <button type="button" onClick={addTask} className="ml-auto grid h-9 w-9 place-items-center rounded-xl bg-[#315CEB] text-white shadow-[0_8px_20px_rgba(49,92,235,0.28)]" aria-label="Add task"><Icon name="plus" className="h-5 w-5" /></button>
        </div>
        <div className="mt-3 divide-y divide-[#EEF1F6]">
          {todayTasks.length ? todayTasks.map(task => (
            <div key={task.id} className="flex items-center gap-3 py-3">
              <button type="button" onClick={() => toggleTask(task.id)} className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border ${task.completed ? 'border-[#16B8A6] bg-[#16B8A6] text-white' : 'border-[#C9D0DD] bg-white text-transparent'}`} aria-label={task.completed ? `Mark ${task.title} incomplete` : `Complete ${task.title}`}><Icon name="check" className="h-4 w-4" /></button>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[13px] font-black ${task.completed ? 'text-[#98A2B3] line-through' : 'text-[#1D2939]'}`}>{task.title}</p>
                <p className="mt-0.5 text-[10px] font-bold text-[#8A94A8]">{task.category} • {formatClock(task.time)}</p>
              </div>
              <button type="button" onClick={() => deleteTask(task.id)} className="grid h-8 w-8 place-items-center rounded-xl text-[#98A2B3] active:bg-red-50 active:text-red-600" aria-label={`Delete ${task.title}`}><Icon name="trash" className="h-4 w-4" /></button>
            </div>
          )) : <div className="py-6 text-center"><p className="text-2xl">✓</p><p className="mt-2 text-sm font-black text-[#344054]">Your day is clear</p><p className="mt-1 text-xs font-semibold text-[#98A2B3]">Add the next important task above.</p></div>}
        </div>
      </div>
    </section>
  );

  const renderNoteGroup = (title: string, notes: MayDayNote[]) => (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-black text-[#111827]">{title}</h2>
        <span className="text-[11px] font-black text-[#315CEB]">{notes.length} saved</span>
      </div>
      {notes.length ? <div className="grid grid-cols-2 gap-3">{notes.map(note => (
        <article key={note.id} className={`relative min-h-[132px] rounded-[18px] border bg-gradient-to-br p-3.5 shadow-[0_10px_26px_rgba(30,64,175,0.06)] ${noteTone[note.category]}`}>
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-[12px] font-black leading-5 text-[#24304A]">{note.title}</h3>
            {note.pinned ? <Icon name="pin" className="h-4 w-4 shrink-0 text-[#4E62E9]" /> : null}
          </div>
          <p className="mt-2 line-clamp-3 text-[10px] font-semibold leading-4 text-[#59647A]">{note.body}</p>
          <p className="mt-3 text-[9px] font-bold text-[#8B94A7]">{formatNoteDate(note.updatedAt)}</p>
          <div className="absolute bottom-2 right-2 flex gap-1 opacity-100">
            <button type="button" onClick={() => editNote(note)} className="grid h-7 w-7 place-items-center rounded-lg bg-white/80 text-[#536174] shadow-sm" aria-label={`Edit ${note.title}`}><Icon name="edit" className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => deleteNote(note.id)} className="grid h-7 w-7 place-items-center rounded-lg bg-white/80 text-[#9B4B56] shadow-sm" aria-label={`Delete ${note.title}`}><Icon name="trash" className="h-3.5 w-3.5" /></button>
          </div>
        </article>
      ))}</div> : <div className="rounded-[18px] border border-dashed border-[#D8DEE9] bg-white/70 px-4 py-6 text-center text-xs font-bold text-[#98A2B3]">No {title.toLowerCase()} yet.</div>}
    </section>
  );

  const renderHome = () => {
    const pinned = workspace.notes.filter(note => note.pinned);
    const study = workspace.notes.filter(note => !note.pinned && note.category === 'study');
    const shopping = workspace.notes.filter(note => !note.pinned && note.category === 'shopping');
    return (
      <div className="mx-auto max-w-xl px-4 pb-8 pt-4">
        <section className="rounded-[20px] border border-[#E1E6EF] bg-white shadow-[0_14px_38px_rgba(27,55,120,0.08)]">
          <textarea value={noteBody} onChange={event => setNoteBody(event.target.value)} placeholder="Write a note…" maxLength={2000} rows={4} className="w-full resize-none rounded-t-[20px] bg-transparent px-4 py-4 text-sm font-semibold leading-6 text-[#253047] outline-none placeholder:text-[#9AA3B5]" />
          <div className="flex items-center gap-2 border-t border-[#EEF1F5] px-3 py-3">
            {(['pinned', 'study', 'shopping'] as const).map(category => (
              <button key={category} type="button" onClick={() => setNoteCategory(category)} className={`rounded-xl px-2.5 py-2 text-[10px] font-black capitalize ${noteCategory === category ? 'bg-[#EEF1FF] text-[#315CEB]' : 'text-[#667085]'}`}>{category}</button>
            ))}
            {editingNoteId ? <button type="button" onClick={() => { setEditingNoteId(null); setNoteBody(''); }} className="ml-auto rounded-xl px-3 py-2 text-[10px] font-black text-[#7A8499]">Cancel</button> : <span className="ml-auto" />}
            <button type="button" onClick={saveNote} disabled={!noteBody.trim()} className="rounded-[14px] bg-gradient-to-r from-[#315CEB] to-[#6255F6] px-5 py-2.5 text-xs font-black text-white shadow-[0_10px_24px_rgba(49,92,235,0.28)] disabled:opacity-40">{editingNoteId ? 'Update' : 'Save'}</button>
          </div>
        </section>
        {renderTaskPlanner()}
        {renderNoteGroup('Pinned Notes', pinned)}
        {renderNoteGroup('Study Notes', study)}
        {renderNoteGroup('Shopping Notes', shopping)}
      </div>
    );
  };

  const renderGoals = () => (
    <div className="mx-auto max-w-xl px-4 pb-24 pt-4">
      <div className="space-y-3">
        {workspace.goals.length ? workspace.goals.map((goal, index) => {
          const tone = goalTones[index % goalTones.length];
          const remaining = daysUntil(goal.targetDate);
          return (
            <article key={goal.id} className="rounded-[20px] border border-[#E2E7F0] bg-white p-4 shadow-[0_12px_34px_rgba(31,61,132,0.08)]">
              <div className="flex items-start gap-3">
                <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-[13px] text-white ${tone.icon}`}><Icon name="goal" className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[14px] font-black text-[#1D2939]">{goal.title}</h2>
                  <p className="mt-1 line-clamp-2 text-[10px] font-semibold leading-4 text-[#7A8499]">{goal.description}</p>
                </div>
                <div className="text-right"><p className="text-2xl font-black tracking-tight text-[#17223B]">{remaining}</p><p className="text-[9px] font-bold text-[#7F899D]">days left</p></div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <input type="range" min="0" max="100" value={goal.progress} onChange={event => updateGoalProgress(goal.id, Number(event.target.value))} className="h-2 min-w-0 flex-1 cursor-pointer accent-[#4E63EF]" aria-label={`Progress for ${goal.title}`} />
                <span className="w-10 text-right text-[10px] font-black text-[#667085]">{goal.progress}%</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[9px] font-bold text-[#8993A7]"><span>{goal.progress}% complete</span><span>Target: {new Date(`${goal.targetDate}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#EEF1F6]"><div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${goal.progress}%` }} /></div>
              <div className="mt-3 flex justify-end"><button type="button" onClick={() => deleteGoal(goal.id)} className="rounded-xl px-3 py-2 text-[10px] font-black text-[#A34A58] active:bg-red-50">Delete goal</button></div>
            </article>
          );
        }) : <div className="rounded-[24px] border border-dashed border-[#D7DDE8] bg-white p-8 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#F0EDFF] text-[#6D50F2]"><Icon name="goal" className="h-7 w-7" /></div><h2 className="mt-4 text-lg font-black text-[#1D2939]">Set your first countdown</h2><p className="mt-2 text-sm font-semibold leading-6 text-[#7A8499]">Track an exam, assignment, course completion, or personal goal.</p></div>}
      </div>
      {goalEditorOpen ? <section className="mt-4 rounded-[20px] border border-[#DDE3EE] bg-white p-4 shadow-[0_14px_38px_rgba(37,66,137,0.09)]">
        <h2 className="text-sm font-black text-[#1D2939]">New goal</h2>
        <input value={goalTitle} onChange={event => setGoalTitle(event.target.value)} placeholder="Goal title" maxLength={160} className="mt-3 w-full rounded-2xl border border-[#E1E6EF] bg-[#FAFBFD] px-4 py-3 text-sm font-bold outline-none focus:border-[#4169F6]" />
        <textarea value={goalDescription} onChange={event => setGoalDescription(event.target.value)} placeholder="Why is this goal important?" maxLength={500} rows={3} className="mt-2 w-full resize-none rounded-2xl border border-[#E1E6EF] bg-[#FAFBFD] px-4 py-3 text-sm font-semibold outline-none focus:border-[#4169F6]" />
        <input type="date" value={goalDate} min={todayKey()} onChange={event => setGoalDate(event.target.value)} className="mt-2 w-full rounded-2xl border border-[#E1E6EF] bg-[#FAFBFD] px-4 py-3 text-sm font-bold outline-none focus:border-[#4169F6]" />
        <div className="mt-3 flex gap-2"><button type="button" onClick={() => setGoalEditorOpen(false)} className="flex-1 rounded-2xl border border-[#DDE3EE] px-4 py-3 text-sm font-black text-[#667085]">Cancel</button><button type="button" onClick={addGoal} className="flex-1 rounded-2xl bg-gradient-to-r from-[#315CEB] to-[#6255F6] px-4 py-3 text-sm font-black text-white">Save goal</button></div>
      </section> : null}
      <button type="button" onClick={() => setGoalEditorOpen(open => !open)} className="fixed bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-[#315CEB] to-[#6152F5] text-white shadow-[0_16px_36px_rgba(49,92,235,0.38)]" aria-label="Add goal"><Icon name="plus" className="h-7 w-7" /></button>
    </div>
  );

  const renderReminders = () => (
    <div className="mx-auto max-w-xl px-4 pb-8 pt-4">
      <section>
        <p className="text-xs font-black text-[#1D2939]">Reminder Time</p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[['19:00', '7 PM'], ['21:00', '9 PM'], ['22:00', '10 PM']].map(([value, label]) => <button key={value} type="button" onClick={() => setReminderTime(value)} className={`rounded-2xl border px-2 py-3 text-xs font-black ${reminderTime === value ? 'border-[#315CEB] bg-gradient-to-b from-[#4169F6] to-[#315CEB] text-white shadow-[0_10px_24px_rgba(49,92,235,0.24)]' : 'border-[#E0E5EE] bg-white text-[#344054]'}`}>{label}</button>)}
          <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-[#8EA5FF] bg-white px-2 py-3 text-[10px] font-black text-[#315CEB]">Custom<input type="time" value={reminderTime} onChange={event => setReminderTime(event.target.value)} className="sr-only" /></label>
        </div>
      </section>

      <section className="mt-4 rounded-[20px] border border-[#E1E6EF] bg-white p-4 shadow-[0_12px_34px_rgba(31,61,132,0.07)]">
        <label className="text-[11px] font-black text-[#344054]">Reminder title</label>
        <input value={reminderTitle} onChange={event => setReminderTitle(event.target.value)} placeholder="What should May Day remind you about?" maxLength={160} className="mt-2 w-full rounded-2xl border border-[#E4E8F0] bg-[#FAFBFD] px-4 py-3 text-sm font-bold outline-none focus:border-[#4169F6]" />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <input type="date" value={reminderDate} min={todayKey()} onChange={event => setReminderDate(event.target.value)} className="rounded-2xl border border-[#E4E8F0] bg-[#FAFBFD] px-3 py-3 text-xs font-bold outline-none focus:border-[#4169F6]" />
          <div className="rounded-2xl border border-[#E4E8F0] bg-[#FAFBFD] px-3 py-3 text-center text-xs font-black text-[#344054]">{formatClock(reminderTime)}</div>
        </div>
      </section>

      <section className="mt-4 rounded-[20px] border border-[#E1E6EF] bg-white p-4 shadow-[0_12px_34px_rgba(31,61,132,0.07)]">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-[13px] font-black text-[#1D2939]">Browser Notifications</h2><p className="mt-1 text-[10px] font-semibold leading-4 text-[#7A8499]">Receive reminders on this device while Eduvora is available.</p></div><button type="button" onClick={requestBrowserPermission} className={`relative h-7 w-12 rounded-full transition ${browserPermission === 'granted' ? 'bg-[#315CEB]' : 'bg-[#D0D5DD]'}`} aria-label="Enable browser notifications"><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${browserPermission === 'granted' ? 'left-6' : 'left-1'}`} /></button></div>
      </section>

      <section className="mt-5">
        <h2 className="text-xs font-black text-[#1D2939]">Repeat</h2>
        <div className="mt-3 grid grid-cols-4 gap-2">{(['daily', 'weekdays', 'weekends', 'once'] as const).map(repeat => <button key={repeat} type="button" onClick={() => setReminderRepeat(repeat)} className={`rounded-2xl border px-1 py-3 text-[9px] font-black capitalize ${reminderRepeat === repeat ? 'border-[#315CEB] bg-[#EEF2FF] text-[#315CEB]' : 'border-[#E1E6EF] bg-white text-[#667085]'}`}>{repeat}</button>)}</div>
      </section>

      <section className="mt-5">
        <h2 className="text-xs font-black text-[#1D2939]">Category Reminders</h2>
        <div className="mt-3 grid grid-cols-4 overflow-hidden rounded-[20px] border border-[#E1E6EF] bg-white">{['Study', 'Tasks', 'Habits', 'Goals'].map((category, index) => <button key={category} type="button" onClick={() => toggleReminderCategory(category)} className={`border-[#E9EDF4] px-1 py-4 text-center ${index ? 'border-l' : ''}`}><span className={`mx-auto grid h-9 w-9 place-items-center rounded-xl ${reminderCategories.includes(category) ? 'bg-[#EEF2FF] text-[#315CEB]' : 'bg-[#F6F7F9] text-[#98A2B3]'}`}><Icon name={category === 'Goals' ? 'goal' : category === 'Tasks' ? 'check' : category === 'Habits' ? 'sparkle' : 'calendar'} className="h-4 w-4" /></span><span className="mt-2 block text-[9px] font-black text-[#475467]">{category}</span><span className={`mx-auto mt-2 grid h-4 w-4 place-items-center rounded ${reminderCategories.includes(category) ? 'bg-[#315CEB] text-white' : 'border border-[#C9D0DD] text-transparent'}`}><Icon name="check" className="h-3 w-3" /></span></button>)}</div>
      </section>

      <button type="button" onClick={addReminder} disabled={!reminderTitle.trim()} className="mt-5 w-full rounded-[17px] bg-gradient-to-r from-[#315CEB] to-[#6255F6] px-4 py-3.5 text-sm font-black text-white shadow-[0_12px_28px_rgba(49,92,235,0.26)] disabled:opacity-45">Save Reminder</button>

      {browserPermission !== 'granted' ? <section className="mt-4 rounded-[20px] border border-[#DDE5FF] bg-gradient-to-r from-[#F5F8FF] to-white p-4"><div className="flex gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#DDF6F4] text-[#12A89C]"><Icon name="bell" className="h-5 w-5" /></div><div className="min-w-0 flex-1"><h3 className="text-[12px] font-black text-[#1D2939]">Stay on track with reminders</h3><p className="mt-1 text-[10px] font-semibold leading-4 text-[#667085]">Allow browser notifications so May Day can alert you while the app is available.</p><button type="button" onClick={requestBrowserPermission} className="mt-3 w-full rounded-xl bg-[#315CEB] px-3 py-2.5 text-[11px] font-black text-white">Allow Notifications</button></div></div></section> : null}

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black text-[#1D2939]">Saved Reminders</h2><span className="text-[10px] font-black text-[#315CEB]">{workspace.reminders.length}</span></div>
        <div className="space-y-2">{workspace.reminders.length ? workspace.reminders.map(reminder => <article key={reminder.id} className="flex items-center gap-3 rounded-[18px] border border-[#E2E7F0] bg-white p-3 shadow-[0_8px_24px_rgba(31,61,132,0.06)]"><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${reminder.enabled ? 'bg-[#EEF2FF] text-[#315CEB]' : 'bg-[#F2F4F7] text-[#98A2B3]'}`}><Icon name="bell" className="h-5 w-5" /></div><div className="min-w-0 flex-1"><h3 className="truncate text-xs font-black text-[#1D2939]">{reminder.title}</h3><p className="mt-1 text-[9px] font-bold capitalize text-[#7A8499]">{formatClock(reminder.time)} • {reminder.repeat} • {reminder.categories.join(', ')}</p></div><button type="button" onClick={() => toggleReminder(reminder.id)} className={`h-6 w-10 rounded-full p-1 ${reminder.enabled ? 'bg-[#315CEB]' : 'bg-[#D0D5DD]'}`} aria-label={reminder.enabled ? 'Disable reminder' : 'Enable reminder'}><span className={`block h-4 w-4 rounded-full bg-white transition ${reminder.enabled ? 'translate-x-4' : ''}`} /></button><button type="button" onClick={() => deleteReminder(reminder.id)} className="grid h-8 w-8 place-items-center rounded-xl text-[#98A2B3] active:bg-red-50 active:text-red-600"><Icon name="trash" className="h-4 w-4" /></button></article>) : <div className="rounded-[18px] border border-dashed border-[#D7DDE8] bg-white px-4 py-6 text-center text-xs font-bold text-[#98A2B3]">No reminder saved yet.</div>}</div>
      </section>
    </div>
  );

  const renderFocus = () => {
    const minutes = Math.floor(focusSeconds / 60);
    const seconds = focusSeconds % 60;
    return (
      <div className="mx-auto max-w-xl px-4 pb-8 pt-4">
        <section>
          <h2 className="text-sm font-black text-[#1D2939]">Focus Session</h2>
          <div className="mt-3 grid grid-cols-3 gap-3">{[15, 30, 45].map(minutesOption => <button key={minutesOption} type="button" onClick={() => selectFocusMinutes(minutesOption)} className={`rounded-[18px] border px-3 py-4 text-center ${focusMinutes === minutesOption ? 'border-[#315CEB] bg-gradient-to-b from-[#4169F6] to-[#315CEB] text-white shadow-[0_12px_28px_rgba(49,92,235,0.25)]' : 'border-[#E1E6EF] bg-white text-[#344054]'}`}><span className="block text-lg font-black">{minutesOption}</span><span className="text-[9px] font-bold">min</span></button>)}</div>
        </section>
        <section className="relative mt-4 overflow-hidden rounded-[24px] bg-gradient-to-br from-[#10B8AA] via-[#16B8A6] to-[#0A8D87] p-5 text-white shadow-[0_20px_48px_rgba(16,184,170,0.28)]">
          <div className="absolute -bottom-10 -left-8 h-32 w-32 rounded-full bg-white/10" /><div className="absolute -right-8 top-10 h-28 w-28 rounded-full bg-[#0A746E]/30" />
          <div className="relative flex items-center justify-between text-xs font-black"><span>Deep Focus</span><span>{focusMinutes}:00</span></div>
          <p className="relative mt-8 text-center text-5xl font-black tracking-tight">{pad(minutes)}:{pad(seconds)}</p>
          <p className="relative mt-3 text-center text-xs font-semibold text-white/85">Stay focused. Great things take time.</p>
          <div className="relative mt-6 flex justify-center gap-2">
            <button type="button" onClick={() => setFocusRunning(running => !running)} className="flex min-w-36 items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-[#0B756F] shadow-lg"><Icon name={focusRunning ? 'pause' : 'play'} className="h-4 w-4" />{focusRunning ? 'Pause' : focusSeconds < focusMinutes * 60 ? 'Resume' : 'Start Session'}</button>
            <button type="button" onClick={() => { setFocusRunning(false); setFocusSeconds(focusMinutes * 60); setFocusMessage(''); focusCompletionGuardRef.current = false; }} className="grid h-12 w-12 place-items-center rounded-full bg-white/18 text-white backdrop-blur"><Icon name="reset" className="h-5 w-5" /></button>
          </div>
        </section>
        {focusMessage ? <div className="mt-4 rounded-[18px] border border-[#BDE9E3] bg-[#EEFBF8] px-4 py-3 text-center text-xs font-black text-[#087A71]">{focusMessage}</div> : null}
        <section className="mt-4 rounded-[20px] border border-[#E5DDFE] bg-gradient-to-r from-[#F8F4FF] to-white p-4"><div className="flex items-center gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#E9E0FF] text-[#704CF2]"><Icon name="sparkle" className="h-6 w-6" /></div><div className="min-w-0 flex-1"><h3 className="text-[12px] font-black text-[#3C2A7A]">{isPremium ? 'Pro / Elite study progress' : 'Go Pro / Elite'}</h3><p className="mt-1 text-[10px] font-semibold leading-4 text-[#756A94]">{isPremium ? 'Your completed focus minutes feed May Day progress and premium streak insights.' : 'Unlock premium streaks, badges, EduCoin earning eligibility, and deeper insights.'}</p></div>{!isPremium ? <button type="button" onClick={onUpgrade} className="rounded-full bg-[#7147F4] px-3 py-2 text-[10px] font-black text-white">Upgrade</button> : null}</div></section>
        <section className="mt-5 rounded-[20px] border border-[#E1E6EF] bg-white p-4 shadow-[0_12px_34px_rgba(31,61,132,0.07)]"><div className="flex items-center justify-between"><div><p className="text-[11px] font-bold text-[#7A8499]">Today&apos;s focus</p><p className="mt-1 text-2xl font-black text-[#1D2939]">{todayFocusMinutes} min</p></div><div className="grid h-14 w-14 place-items-center rounded-full bg-[#EEF2FF] text-[#315CEB]"><Icon name="timer" className="h-7 w-7" /></div></div></section>
      </div>
    );
  };

  const renderProgress = () => (
    <div className="mx-auto max-w-xl px-4 pb-8 pt-4">
      {isPremium ? <section className="rounded-[20px] border border-[#E2E7F0] bg-white p-4 shadow-[0_12px_34px_rgba(31,61,132,0.07)]"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-black text-[#1D2939]"><span>🔥</span> Weekly Streak</h2><span className="text-sm font-black text-[#1D2939]">{currentStreak} days</span></div><div className="mt-5 grid grid-cols-7 gap-2">{lastSevenDays.map(day => <div key={day.key} className="text-center"><div className={`mx-auto grid h-8 w-8 place-items-center rounded-full border ${day.active ? 'border-[#12AFA3] bg-[#12AFA3] text-white' : 'border-[#D7DDE7] bg-white text-[#C5CBD5]'}`}><Icon name="check" className="h-4 w-4" /></div><p className="mt-2 text-[9px] font-black text-[#667085]">{day.label}</p></div>)}</div></section> : <section className="rounded-[20px] border border-[#E4DDFD] bg-gradient-to-r from-[#F8F4FF] to-white p-4"><div className="flex gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#EAE1FF] text-[#704CF2]"><Icon name="sparkle" className="h-6 w-6" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#7657DB]">Premium motivation</p><h2 className="mt-1 text-sm font-black text-[#302160]">Build streaks with Pro or Elite</h2><p className="mt-1 text-[10px] font-semibold leading-4 text-[#756A94]">Normal users can use tasks, notes, reminders, focus sessions, and daily progress. Premium members also unlock streaks, badges, milestones, and reward eligibility.</p><button type="button" onClick={onUpgrade} className="mt-3 rounded-full bg-[#7147F4] px-4 py-2 text-[10px] font-black text-white">Upgrade</button></div></div></section>}

      <section className="mt-5"><h2 className="mb-3 text-sm font-black text-[#1D2939]">Today&apos;s Progress</h2><div className="grid grid-cols-3 overflow-hidden rounded-[20px] border border-[#E1E6EF] bg-white shadow-[0_10px_30px_rgba(31,61,132,0.06)]"><div className="border-r border-[#E9EDF3] px-2 py-4 text-center"><div className="mx-auto text-[#12AFA3]"><Icon name="check" className="mx-auto h-5 w-5" /></div><p className="mt-2 text-xl font-black text-[#1D2939]">{completedTasks}</p><p className="mt-1 text-[9px] font-bold text-[#7A8499]">Tasks Done</p></div><div className="border-r border-[#E9EDF3] px-2 py-4 text-center"><div className="mx-auto text-[#F59E0B]"><Icon name="timer" className="mx-auto h-5 w-5" /></div><p className="mt-2 text-xl font-black text-[#1D2939]">{todayFocusMinutes}</p><p className="mt-1 text-[9px] font-bold text-[#7A8499]">Min Focused</p></div><div className="px-2 py-4 text-center"><div className="mx-auto text-[#704CF2]"><Icon name="goal" className="mx-auto h-5 w-5" /></div><p className="mt-2 text-xl font-black text-[#1D2939]">{dailyGoal}%</p><p className="mt-1 text-[9px] font-bold text-[#7A8499]">Daily Goal</p></div></div></section>

      <section className="relative mt-4 overflow-hidden rounded-[22px] bg-gradient-to-br from-[#10B8AA] to-[#07938A] p-5 text-center text-white shadow-[0_18px_44px_rgba(16,184,170,0.24)]"><div className="absolute left-3 top-3 text-xl">🎉</div><div className="absolute bottom-3 right-4 text-2xl">✨</div><h2 className="relative text-lg font-black">{dailyGoal >= 100 ? `Amazing work, ${displayName}!` : `Keep going, ${displayName}!`}</h2><p className="relative mt-2 text-xs font-semibold leading-5 text-white/88">{dailyGoal >= 100 ? 'You completed today’s May Day target.' : `Complete 3 tasks or study for 15 minutes to finish today's goal.`}</p><button type="button" onClick={() => navigateTab(dailyGoal >= 100 ? 'home' : 'focus')} className="relative mt-4 rounded-full bg-white px-5 py-2.5 text-xs font-black text-[#087A73]">{dailyGoal >= 100 ? 'Plan tomorrow' : 'Continue progress'}</button></section>

      {isPremium ? <section className="mt-4 rounded-[20px] border border-[#E5DDFE] bg-[#FBF9FF] p-4"><div className="flex items-center gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#EAE1FF] text-[#704CF2]">♛</div><div className="min-w-0 flex-1"><h3 className="text-xs font-black text-[#5132B4]">Your Next Milestone</h3><p className="mt-1 text-[10px] font-semibold leading-4 text-[#756A94]">Maintain a 15-day streak to unlock the next premium milestone.</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#DED7F3]"><div className="h-full rounded-full bg-[#704CF2]" style={{ width: `${Math.min(100, (currentStreak / 15) * 100)}%` }} /></div><p className="mt-1 text-[9px] font-black text-[#756A94]">{Math.min(currentStreak, 15)}/15 days</p></div></div></section> : null}

      <section className="mt-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black text-[#1D2939]">Today&apos;s Tasks</h2><button type="button" onClick={() => navigateTab('home')} className="text-[10px] font-black text-[#315CEB]">Manage</button></div><div className="rounded-[20px] border border-[#E1E6EF] bg-white px-4 shadow-[0_10px_30px_rgba(31,61,132,0.06)]">{todayTasks.length ? todayTasks.map(task => <div key={task.id} className="flex items-center gap-3 border-b border-[#EEF1F5] py-3 last:border-0"><span className={`grid h-5 w-5 place-items-center rounded-full ${task.completed ? 'bg-[#12AFA3] text-white' : 'border border-[#C9D0DD] text-transparent'}`}><Icon name="check" className="h-3 w-3" /></span><span className="min-w-0 flex-1 truncate text-xs font-black text-[#344054]">{task.title}</span><span className="text-[9px] font-bold text-[#8A94A8]">{formatClock(task.time)}</span></div>) : <div className="py-6 text-center text-xs font-bold text-[#98A2B3]">No task planned for today.</div>}</div></section>
    </div>
  );

  const navItems: Array<{ tab: MayDayTab; label: string; icon: keyof typeof iconPaths }> = [
    { tab: 'home', label: 'May Day', icon: 'note' },
    { tab: 'goals', label: 'Goals', icon: 'goal' },
    { tab: 'reminders', label: 'Reminders', icon: 'bell' },
    { tab: 'focus', label: 'Focus', icon: 'timer' },
    { tab: 'progress', label: 'Progress', icon: 'progress' },
  ];

  return (
    <div data-feature={MAY_DAY_MARKER} className="min-h-[100dvh] bg-[#F7F9FC] pb-[calc(env(safe-area-inset-bottom)+6.6rem)] text-[#101828] md:hidden">
      {renderHeader()}
      {activeTab === 'home' ? renderHome() : null}
      {activeTab === 'goals' ? renderGoals() : null}
      {activeTab === 'reminders' ? renderReminders() : null}
      {activeTab === 'focus' ? renderFocus() : null}
      {activeTab === 'progress' ? renderProgress() : null}

      <nav aria-label="May Day sections" className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E2E7F0] bg-white/96 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-14px_38px_rgba(20,38,84,0.10)] backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">{navItems.map(item => {
          const active = activeTab === item.tab;
          return <button key={item.tab} type="button" onClick={() => navigateTab(item.tab)} aria-current={active ? 'page' : undefined} className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 transition active:scale-95 ${active ? 'bg-[#EEF2FF] text-[#315CEB]' : 'text-[#596579]'}`}><span className={`grid h-7 w-7 place-items-center rounded-xl ${active ? 'bg-white shadow-sm' : ''}`}><Icon name={item.icon} className="h-[18px] w-[18px]" /></span><span className="w-full truncate text-center text-[9px] font-black">{item.label}</span></button>;
        })}</div>
      </nav>
    </div>
  );
};

export default MayDayMobile;

