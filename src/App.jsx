import { useEffect, useState } from 'react';

const STORAGE_KEY = 'bagheera-study.entries';

const emptyForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  title: '',
  type: 'Project',
  minutes: '',
  notes: '',
});

function readEntries() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }

    return b.id.localeCompare(a.id);
  });
}

function normalizeEntries(entries) {
  return sortEntries(
    entries
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        id: String(entry.id),
        date: String(entry.date ?? ''),
        title: String(entry.title ?? ''),
        type: entry.type === 'LeetCode' ? 'LeetCode' : 'Project',
        minutes: Number(entry.minutes ?? 0),
        notes: String(entry.notes ?? ''),
      })),
  );
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

function App() {
  const [entries, setEntries] = useState(() => normalizeEntries(readEntries()));
  const [form, setForm] = useState(() => emptyForm());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  const totalMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);
  const streak = calculateStreak(entries);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    const title = form.title.trim();
    const notes = form.notes.trim();
    const minutes = Number(form.minutes);

    if (!title || !form.date || !Number.isFinite(minutes) || minutes <= 0) {
      return;
    }

    const nextEntry = {
      id: `${Date.now()}`,
      date: form.date,
      title,
      type: form.type === 'LeetCode' ? 'LeetCode' : 'Project',
      minutes,
      notes,
    };

    setEntries((current) => sortEntries([nextEntry, ...current]));
    setForm((current) => ({
      ...emptyForm(),
      date: current.date,
    }));
  }

  function handleDelete(id) {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Bagheera Study</p>
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

            <button type="submit">Save practice session</button>
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
                Your first log will show up here and start building your streak.
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
