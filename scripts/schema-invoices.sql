-- Tables added for invoice approval and invoice email attachments (applied to Neon on 2026-10-27).
-- Existing tables are unchanged.

CREATE TABLE IF NOT EXISTS invoice_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  approver_name text NOT NULL,          -- typed at approval; CargoPilot has no login, so it is self-declared
  approved_at timestamptz NOT NULL DEFAULT now(),
  data_hash text NOT NULL,              -- SHA-256 of the canonical invoice data
  pdf_hash text NOT NULL,               -- SHA-256 of the exact approved PDF bytes
  pdf bytea NOT NULL,                   -- the approved PDF, stored only with its booking
  pdf_size integer NOT NULL,
  rules_version text NOT NULL           -- compliance rulebook version at approval
);
CREATE INDEX IF NOT EXISTS invoice_approvals_booking_idx ON invoice_approvals (booking_id, approved_at DESC);

CREATE TABLE IF NOT EXISTS email_attachments (
  email_id uuid NOT NULL REFERENCES carrier_emails(id) ON DELETE CASCADE,
  approval_id uuid NOT NULL REFERENCES invoice_approvals(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  size_bytes integer NOT NULL,
  recipient_role text NOT NULL DEFAULT 'carrier' CHECK (recipient_role IN ('carrier', 'buyer'))
);
