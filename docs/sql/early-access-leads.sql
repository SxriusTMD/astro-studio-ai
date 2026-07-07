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
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
