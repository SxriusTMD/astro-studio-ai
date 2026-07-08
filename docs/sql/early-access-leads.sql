-- Apply manually to the PostgreSQL database referenced by DATABASE_URL before deployment.
-- The API generates UUID values with crypto.randomUUID(); no UUID extension is required.
-- Phase 1 does not persist raw IP addresses or populate ip_hash.
CREATE TABLE IF NOT EXISTS early_access_leads (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (
    role IN ('animator', '3d_artist', 'indie_dev', 'studio', 'other')
  ),
  main_pain TEXT NOT NULL CHECK (
    main_pain IN (
      'rigging',
      'animation',
      'texture_optimization',
      'rendering',
      'pipeline_automation'
    )
  ),
  source TEXT NOT NULL DEFAULT 'landing',
  user_agent TEXT,
  ip_hash TEXT, -- Reserved for a future privacy-reviewed multi-instance rate-limit design.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Leads are written through the trusted Express/PostgreSQL connection only.
-- No public Data API policy is intentionally defined.
ALTER TABLE public.early_access_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.early_access_leads FROM anon, authenticated;
