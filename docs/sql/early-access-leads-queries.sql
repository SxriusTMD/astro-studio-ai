-- AeroLex AI Early Access manual review queries.
-- Run these manually from an authorized PostgreSQL client or Supabase SQL Editor.
-- Do not wire them into application logs, scheduled scripts or public endpoints.

-- Latest 20 leads for authorized follow-up.
SELECT id, email, role, main_pain, source, created_at
FROM early_access_leads
ORDER BY created_at DESC
LIMIT 20;

-- Lead count by role.
SELECT role, COUNT(*) AS lead_count
FROM early_access_leads
GROUP BY role
ORDER BY lead_count DESC, role;

-- Lead count by stated pain.
SELECT main_pain, COUNT(*) AS lead_count
FROM early_access_leads
GROUP BY main_pain
ORDER BY lead_count DESC, main_pain;

-- Leads by UTC calendar day.
SELECT created_at::date AS lead_day, COUNT(*) AS lead_count
FROM early_access_leads
GROUP BY created_at::date
ORDER BY lead_day DESC;

-- Basic manual export. Treat email as personal data and store the export securely.
SELECT email, role, main_pain, source, created_at
FROM early_access_leads
ORDER BY created_at DESC;
