-- Enforce at DB level that a single ship visit can never have two active invoices for the same billing_stage
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_visit_billing_stage ON invoices (visit_id, billing_stage) WHERE status <> 'VOID';
