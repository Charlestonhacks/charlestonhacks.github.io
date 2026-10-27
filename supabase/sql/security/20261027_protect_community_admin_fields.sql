-- Protect community admin status and restore hidden-profile filtering.
-- Apply in the Supabase SQL Editor as a database owner (for example, the project SQL Editor).
-- This is additive: ordinary profile fields remain writable under existing self policies.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE CREATE ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

-- Read the role table as the trusted function owner so policies do not recursively
-- evaluate community RLS when checking whether the current caller is an admin.
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.community AS c
    WHERE c.user_id = (SELECT auth.uid())
      AND c.user_role = 'Admin'
      AND COALESCE(c.is_disabled, false) = false
  );
$function$;

REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;

-- A profile owner may edit their profile, but only an existing admin may assign
-- the Admin role or change an account's disabled status.
CREATE OR REPLACE FUNCTION private.protect_community_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Trusted SQL Editor/service-role operations have no end-user auth.uid().
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT private.is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      -- Self-created profiles always start as an enabled Member.
      NEW.user_role := 'Member';
      NEW.is_disabled := false;
    ELSE
      IF NEW.user_role IS DISTINCT FROM OLD.user_role THEN
        RAISE EXCEPTION 'Only an admin may change a community role'
          USING ERRCODE = '42501';
      END IF;

      IF NEW.is_disabled IS DISTINCT FROM OLD.is_disabled THEN
        RAISE EXCEPTION 'Only an admin may change disabled status'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.protect_community_privileged_fields() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.protect_community_privileged_fields() TO authenticated;

DROP TRIGGER IF EXISTS protect_community_privileged_fields ON public.community;
CREATE TRIGGER protect_community_privileged_fields
BEFORE INSERT OR UPDATE OF user_role, is_disabled
ON public.community
FOR EACH ROW
EXECUTE FUNCTION private.protect_community_privileged_fields();

-- Keep visible profiles available to authenticated members, allow owners to see
-- their own hidden profile, and allow admins to manage hidden profiles.
ALTER POLICY "Authenticated users can view profiles and presence"
ON public.community
USING (
  (is_hidden IS NULL)
  OR (is_hidden = false)
  OR (user_id = (SELECT auth.uid()))
  OR (SELECT private.is_admin())
);

-- The unconditional policy made the is_hidden filter ineffective.
DROP POLICY IF EXISTS community_select_auth ON public.community;

ALTER POLICY community_insert_admin
ON public.community
WITH CHECK ((SELECT private.is_admin()));

ALTER POLICY community_update_admin
ON public.community
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));

COMMIT;
