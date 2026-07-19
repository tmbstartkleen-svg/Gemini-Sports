PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS facilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent TEXT DEFAULT '',
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  website TEXT DEFAULT '',
  lat REAL,
  lng REAL,
  priority TEXT DEFAULT 'Medium',
  status TEXT DEFAULT 'Prospect',
  category TEXT DEFAULT '',
  products TEXT DEFAULT '',
  employees INTEGER,
  establishment_number TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  source_url TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  linkedin TEXT DEFAULT '',
  source TEXT DEFAULT 'Team entry',
  verified_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (facility_id) REFERENCES facilities(id)
);
CREATE TABLE IF NOT EXISTS facility_notes (
  id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (facility_id) REFERENCES facilities(id)
);
CREATE INDEX IF NOT EXISTS idx_facilities_updated ON facilities(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_facility ON contacts(facility_id);
CREATE INDEX IF NOT EXISTS idx_notes_facility ON facility_notes(facility_id);

CREATE TABLE IF NOT EXISTS recall_events (
  id TEXT PRIMARY KEY,
  facility_id TEXT,
  source TEXT NOT NULL,
  recall_number TEXT DEFAULT '',
  event_id TEXT DEFAULT '',
  firm_name TEXT NOT NULL,
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  report_date TEXT DEFAULT '',
  classification TEXT DEFAULT '',
  product TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  source_url TEXT DEFAULT '',
  priority TEXT DEFAULT 'Medium',
  score INTEGER DEFAULT 50,
  raw_json TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (facility_id) REFERENCES facilities(id)
);

CREATE TABLE IF NOT EXISTS construction_projects (
  id TEXT PRIMARY KEY,
  facility_id TEXT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  project_date TEXT DEFAULT '',
  stage TEXT DEFAULT 'Project Intelligence',
  source_name TEXT DEFAULT '',
  source_url TEXT DEFAULT '',
  priority TEXT DEFAULT 'Medium',
  score INTEGER DEFAULT 50,
  raw_json TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (facility_id) REFERENCES facilities(id)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  fda_records INTEGER DEFAULT 0,
  usda_records INTEGER DEFAULT 0,
  construction_records INTEGER DEFAULT 0,
  facilities_upserted INTEGER DEFAULT 0,
  error TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_recalls_facility ON recall_events(facility_id);
CREATE INDEX IF NOT EXISTS idx_recalls_date ON recall_events(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_projects_date ON construction_projects(project_date DESC);
CREATE INDEX IF NOT EXISTS idx_sync_completed ON sync_runs(completed_at DESC);
