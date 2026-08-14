CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  account_hash TEXT NOT NULL,
  subscription TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS subscriptions_account ON subscriptions(account_hash);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  account_hash TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reminders_due ON reminders(status, due_at);
CREATE INDEX IF NOT EXISTS reminders_account ON reminders(account_hash);
