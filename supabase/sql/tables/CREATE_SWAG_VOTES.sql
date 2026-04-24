-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================
-- Run this script once in your Supabase SQL editor to enable swag voting.
-- ============================================================================


-- ============================================================================
-- CREATE SWAG_VOTES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.swag_votes (
  swag   TEXT PRIMARY KEY,
  votes  INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Keep updated_at current on every write
CREATE OR REPLACE FUNCTION public.set_swag_votes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_swag_votes_updated_at ON public.swag_votes;
CREATE TRIGGER trg_swag_votes_updated_at
  BEFORE UPDATE ON public.swag_votes
  FOR EACH ROW EXECUTE FUNCTION public.set_swag_votes_updated_at();


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.swag_votes ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated visitors) can read vote counts
CREATE POLICY "swag_votes_public_select"
  ON public.swag_votes FOR SELECT
  USING (true);

-- Anyone can insert a new swag row (first vote for that item)
CREATE POLICY "swag_votes_public_insert"
  ON public.swag_votes FOR INSERT
  WITH CHECK (true);

-- Anyone can update an existing swag row (subsequent votes)
CREATE POLICY "swag_votes_public_update"
  ON public.swag_votes FOR UPDATE
  USING (true)
  WITH CHECK (true);
