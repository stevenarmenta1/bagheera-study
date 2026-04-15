import { useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig, supabase } from './lib/supabase.js';

const STORAGE_KEY = 'bagheera-study.entries';
const LEGACY_STORAGE_KEY = 'practice-log-studio.entries';

const emptyForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  title: '',
  type: 'Project',
  minutes: '',
  notes: '',
});

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }

    return (b.created_at ?? b.id).localeCompare(a.created_at ?? a.id);
  });
}

function normalizeEntries(entries) {
  return sortEntries(
    entries
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        id: String(entry.id),
        user_id: entry.user_id ? String(entry.user_id) : '',
        date: String(entry.date ?? ''),
        title: String(entry.title ?? ''),
        type: entry.type === 'LeetCode' ? 'LeetCode' : 'Project',
        minutes: Number(entry.minutes ?? 0),
        notes: String(entry.notes ?? ''),
        created_at: String(entry.created_at ?? entry.id ?? ''),
      })),
  );
}

function readStorageEntries(key) {
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getLocalEntriesForImport() {
  const currentEntries = readStorageEntries(STORAGE_KEY);
  const legacyEntries = readStorageEntries(LEGACY_STORAGE_KEY);
  return normalizeEntries([...currentEntries, ...legacyEntries]);
}

function getImportMarker(userId) {
  return `bagheera-study.imported.${userId}`;
}

function calculateStreak(entries) {
  if (entries.length === 0) {
    return 0;
  }

  const uniqueDates = [...new Set(entries.map((entry) => entry.date))]
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));

  if (uniqueDates.length === 0) {
    return 0;
  }

  let streak = 0;
  let cursor = new Date(`${uniqueDates[0]}T00:00:00`);

  for (const dateString of uniqueDates) {
    const current = new Date(`${dateString}T00:00:00`);
    if (current.getTime() !== cursor.getTime()) {
      break;
    }

    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function formatDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getProfile(session) {
  const user = session?.user;
  if (!user) {
    return null;
  }

  return {
    name: user.user_metadata?.full_name || user.user_metadata?.name || 'Bagheera learner',
    email: user.email || '',
  };
}

async function fetchEntries(userId) {
  const { data, error } = await supabase
    .from('practice_entries')
    .select('id, user_id, date, title, type, minutes, notes, created_at')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return normalizeEntries(data ?? []);
}

async function maybeImportLocalEntries(userId) {
  const marker = getImportMarker(userId);
  if (window.localStorage.getItem(marker)) {
    return;
  }

  const entries = getLocalEntriesForImport();
  if (entries.length === 0) {
    window.localStorage.setItem(marker, 'done');
    return;
  }

  const payload = entries.map((entry) => ({
    user_id: userId,
    date: entry.date,
    title: entry.title,
    type: entry.type,
    minutes: entry.minutes,
    notes: entry.notes,
  }));

  const { error } = await supabase.from('practice_entries').insert(payload);
  if (error) {
    throw error;
  }

  window.localStorage.setItem(marker, 'done');
}

function App() {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(() => emptyForm());
  const [session, setSession] = useState(null);
  const [authState, setAuthState] = useState(hasSupabaseConfig ? 'loading' : 'missing-config');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!hasSupabaseConfig) {
      return undefined;
    }

    let isActive = true;

    async function loadSession() {
      const {
        data: { session: activeSession },
        error,
      } = await supabase.auth.getSession();

      if (!isActive) {
        return;
      }

      if (error) {
        setMessage(error.message);
      }

      setSession(activeSession);
      setAuthState(activeSession ? 'signed-in' : 'signed-out');
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isActive) {
        return;
      }

      setSession(nextSession);
      setEntries([]);
      setAuthState(nextSession ? 'signed-in' : 'signed-out');
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    let isActive = true;

    async function syncUserData() {
      setMessage('');
      setAuthState('loading');

      try {
        await maybeImportLocalEntries(session.user.id);
        const nextEntries = await fetchEntries(session.user.id);
        if (!isActive) {
          return;
        }

        setEntries(nextEntries);
        setAuthState('signed-in');
      } catch (error) {
        if (!isActive) {
          return;
        }

        setEntries([]);
        setAuthState('signed-in');
        setMessage(error.message || 'Could not sync your practice entries yet.');
      }
    }

    syncUserData();

    return () => {
      isActive = false;
    };
  }, [session?.user?.id]);

  const totalMinutes = useMemo(
    () => entries.reduce((sum, entry) => sum + entry.minutes, 0),
    [entries],
  );
  const streak = useMemo(() => calculateStreak(entries), [entries]);
  const profile = getProfile(session);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!session?.user?.id) {
      setMessage('Sign in before saving a practice session.');
      return;
    }

    const title = form.title.trim();
    const notes = form.notes.trim();
    const minutes = Number(form.minutes);

    if (!title || !form.date || !Number.isFinite(minutes) || minutes <= 0) {
      setMessage('Fill out the date, title, and minutes before saving.');
      return;
    }

    setIsSaving(true);
    setMessage('');

    const payload = {
      user_id: session.user.id,
      date: form.date,
      title,
      type: form.type === 'LeetCode' ? 'LeetCode' : 'Project',
      minutes,
      notes,
    };

    const { data, error } = await supabase
      .from('practice_entries')
      .insert(payload)
      .select('id, user_id, date, title, type, minutes, notes, created_at')
      .single();

    setIsSaving(false);

    if (error) {
      setMessage(error.message || 'Could not save your entry.');
      return;
    }

    setEntries((current) => sortEntries([data, ...current]));
    setForm((current) => ({
      ...emptyForm(),
      date: current.date,
    }));
  }

  async function handleDelete(id) {
    setMessage('');

    const previousEntries = entries;
    setEntries((current) => current.filter((entry) => entry.id !== id));

    const { error } = await supabase.from('practice_entries').delete().eq('id', id);
    if (error) {
      setEntries(previousEntries);
      setMessage(error.message || 'Could not delete that entry.');
    }
  }

  async function handleGoogleSignIn() {
    if (!hasSupabaseConfig) {
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      setMessage(error.message || 'Could not start Google sign-in.');
    }
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setMessage(error.message || 'Could not sign out right now.');
    } else {
      setMessage('');
    }
  }

  if (authState === 'missing-config') {
    return (
      <main className="page-shell">
        <section className="setup-panel">
          <p className="eyebrow">Bagheera Study</p>
          <h1>Connect Supabase to turn this into a real multi-device app.</h1>
          <p className="hero-text">
            Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to your local
            `.env.local` file and to Vercel, then run the SQL in
            `supabase/schema.sql`.
          </p>
          <div className="setup-list">
            <span>1. Create a Supabase project</span>
            <span>2. Enable Google auth in Supabase</span>
            <span>3. Add the env vars from `.env.example`</span>
            <span>4. Run the SQL schema file</span>
          </div>
        </section>
      </main>
    );
  }

  if (authState === 'loading') {
    return (
      <main className="page-shell">
        <section className="setup-panel">
          <p className="eyebrow">Bagheera Study</p>
          <h1>Loading your study space...</h1>
        </section>
      </main>
    );
  }

  if (authState === 'signed-out') {
    return (
      <main className="page-shell">
        <section className="hero-panel auth-hero">
          <div className="hero-copy">
            <p className="eyebrow">Bagheera Study</p>
            <h1>Keep your coding streak alive across every device.</h1>
            <p className="hero-text">
              Sign in with Google to save your project sessions and LeetCode
              practice in the cloud, not just one browser.
            </p>
            <div className="landing-actions">
              <button type="button" className="primary-button" onClick={handleGoogleSignIn}>
                Continue with Google
              </button>
              <p className="subtle-copy">
                Your entries stay private to your account.
              </p>
            </div>
          </div>

          <div className="hero-stats auth-cards">
            <StatCard value="Cloud" label="Sync" accent="amber" />
            <StatCard value="Private" label="Entries" accent="blue" />
            <StatCard value="Google" label="Login" accent="coral" />
          </div>
        </section>

        {message ? <p className="message-banner">{message}</p> : null}
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Bagheera Study</p>
          <h2>{profile?.name}</h2>
          <p className="subtle-copy">{profile?.email}</p>
        </div>

        <button type="button" className="ghost-button" onClick={handleSignOut}>
          Sign out
        </button>
      </section>

      {message ? <p className="message-banner">{message}</p> : null}

      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Cloud practice log</p>
          <h1>Build momentum, one focused session at a time.</h1>
          <p className="hero-text">
            Log project work and LeetCode reps in one place so your effort
            turns into a visible streak instead of a vague memory.
          </p>
        </div>

        <div className="hero-stats">
          <StatCard value={streak} label="Current streak" accent="amber" />
          <StatCard value={entries.length} label="Sessions logged" accent="blue" />
          <StatCard value={totalMinutes} label="Minutes practiced" accent="coral" />
        </div>
      </section>

      <section className="studio-grid">
        <section className="panel entry-panel">
          <div className="panel-heading">
            <p className="panel-kicker">Quick capture</p>
            <h2>Add today&apos;s practice</h2>
          </div>

          <form className="entry-form" onSubmit={handleSubmit}>
            <label>
              <span>Date</span>
              <input
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              <span>Title</span>
              <input
                type="text"
                name="title"
                placeholder="Finished dynamic programming review"
                value={form.title}
                onChange={handleChange}
                required
              />
            </label>

            <div className="split-fields">
              <label>
                <span>Type</span>
                <select name="type" value={form.type} onChange={handleChange}>
                  <option value="Project">Project</option>
                  <option value="LeetCode">LeetCode</option>
                </select>
              </label>

              <label>
                <span>Minutes</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  name="minutes"
                  placeholder="45"
                  value={form.minutes}
                  onChange={handleChange}
                  required
                />
              </label>
            </div>

            <label>
              <span>Notes</span>
              <textarea
                name="notes"
                rows="4"
                placeholder="What clicked? What felt hard? What do you want to try next?"
                value={form.notes}
                onChange={handleChange}
              />
            </label>

            <button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save practice session'}
            </button>
          </form>
        </section>

        <section className="panel feed-panel">
          <div className="panel-heading">
            <p className="panel-kicker">Recent work</p>
            <h2>Your session feed</h2>
          </div>

          {entries.length === 0 ? (
            <div className="empty-state">
              <p>No sessions yet.</p>
              <span>
                Your first cloud-saved log will show up here and follow you
                across devices.
              </span>
            </div>
          ) : (
            <div className="entry-list">
              {entries.map((entry) => (
                <article className="entry-card" key={entry.id}>
                  <div className="entry-meta">
                    <span className={`type-pill ${entry.type.toLowerCase()}`}>
                      {entry.type}
                    </span>
                    <span>{formatDate(entry.date)}</span>
                    <span>{entry.minutes} min</span>
                  </div>

                  <div className="entry-body">
                    <h3>{entry.title}</h3>
                    <p>{entry.notes || 'No notes for this session yet.'}</p>
                  </div>

                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => handleDelete(entry.id)}
                  >
                    Delete
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function StatCard({ value, label, accent }) {
  return (
    <article className={`stat-card ${accent}`}>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

export default App;
