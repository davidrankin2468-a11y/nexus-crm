-- Migration 002: Add company-scoped staff directory and scheduled appointments.
-- Additive migration. Does not alter existing tenants/customers/jobs or their records.
CREATE TABLE IF NOT EXISTS employees (
  id TEXT NOT NULL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 150),
  job_title TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees(tenant_id,created_at);
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT NOT NULL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  job_id TEXT NOT NULL,
  employee_id TEXT,
  appointment_date TEXT NOT NULL,
  appointment_time TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(tenant_id,job_id) REFERENCES jobs(tenant_id,id),
  FOREIGN KEY(tenant_id,employee_id) REFERENCES employees(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_date ON appointments(tenant_id,appointment_date,appointment_time);
