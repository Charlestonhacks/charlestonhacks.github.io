-- Secure public BBS posting/moderation and private direct-message access.
-- Apply in Supabase SQL Editor as a database owner after reviewing the matching site changes.
-- This does not change the live database until it is run in Supabase.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE CREATE ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

-- Resolve the caller's active community profile without recursively invoking
-- community RLS from policies on messages and conversations.
CREATE OR REPLACE FUNCTION private.current_active_community_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT c.id
  FROM public.community AS c
  WHERE c.user_id = (SELECT auth.uid())
    AND COALESCE(c.is_disabled, false) = false
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION private.current_active_community_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT c.name
  FROM public.community AS c
  WHERE c.user_id = (SELECT auth.uid())
    AND COALESCE(c.is_disabled, false) = false
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION private.current_active_community_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_active_community_name() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.current_active_community_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_active_community_name() TO authenticated;

ALTER TABLE public.bbs_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Remove older permissive policies on these three tables before installing
-- one explicit policy for each intended operation.
DO $block$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('bbs_messages', 'conversations', 'messages')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  END LOOP;
END;
$block$;

-- BBS history is public. Posting requires an active signed-in community profile
-- and uses that profile's name. Only admins may remove stored messages.
REVOKE ALL PRIVILEGES ON TABLE public.bbs_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.bbs_messages TO anon, authenticated;
GRANT INSERT (user_id, username, text) ON TABLE public.bbs_messages TO authenticated;
GRANT DELETE ON TABLE public.bbs_messages TO authenticated;

CREATE POLICY bbs_messages_public_read
  ON public.bbs_messages FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY bbs_messages_active_member_insert
  ON public.bbs_messages FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND username = (SELECT private.current_active_community_name())
    AND (SELECT private.current_active_community_id()) IS NOT NULL
    AND length(trim(text)) BETWEEN 1 AND 500
  );

CREATE POLICY bbs_messages_admin_delete
  ON public.bbs_messages FOR DELETE TO authenticated
  USING ((SELECT private.is_admin()));

-- Direct-message tables are private to active participants. Revoke broad table
-- grants and grant only the columns the current clients need to write.
REVOKE ALL PRIVILEGES ON TABLE public.conversations FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.messages FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, participant_1_id, participant_2_id, context_type, context_id, context_title, last_message_at, last_message_preview, created_at, updated_at)
  ON TABLE public.conversations FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, conversation_id, sender_id, content, read, created_at)
  ON TABLE public.messages FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.conversations, public.messages TO authenticated;
GRANT INSERT (participant_1_id, participant_2_id, context_type, context_id, context_title, last_message_at, last_message_preview)
  ON TABLE public.conversations TO authenticated;
GRANT UPDATE (updated_at, last_message_at, last_message_preview)
  ON TABLE public.conversations TO authenticated;
GRANT INSERT (conversation_id, sender_id, content, read)
  ON TABLE public.messages TO authenticated;
GRANT UPDATE (read) ON TABLE public.messages TO authenticated;

CREATE POLICY conversations_participant_select
  ON public.conversations FOR SELECT TO authenticated
  USING (
    (SELECT private.current_active_community_id()) IS NOT NULL
    AND (
      participant_1_id = (SELECT private.current_active_community_id())
      OR participant_2_id = (SELECT private.current_active_community_id())
    )
  );

CREATE POLICY conversations_participant_insert
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.current_active_community_id()) IS NOT NULL
    AND (
      participant_1_id = (SELECT private.current_active_community_id())
      OR participant_2_id = (SELECT private.current_active_community_id())
    )
  );

CREATE POLICY conversations_participant_metadata_update
  ON public.conversations FOR UPDATE TO authenticated
  USING (
    participant_1_id = (SELECT private.current_active_community_id())
    OR participant_2_id = (SELECT private.current_active_community_id())
  )
  WITH CHECK (
    participant_1_id = (SELECT private.current_active_community_id())
    OR participant_2_id = (SELECT private.current_active_community_id())
  );

CREATE POLICY messages_participant_select
  ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations AS c
      WHERE c.id = messages.conversation_id
        AND (
          c.participant_1_id = (SELECT private.current_active_community_id())
          OR c.participant_2_id = (SELECT private.current_active_community_id())
        )
    )
  );

CREATE POLICY messages_participant_insert
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT private.current_active_community_id())
    AND read = false
    AND EXISTS (
      SELECT 1 FROM public.conversations AS c
      WHERE c.id = messages.conversation_id
        AND (
          c.participant_1_id = (SELECT private.current_active_community_id())
          OR c.participant_2_id = (SELECT private.current_active_community_id())
        )
    )
  );

-- The only permitted message update is a recipient changing read=false to true.
-- Column grants prevent changing content or sender identity; USING prevents
-- senders and already-read rows from being updated.
CREATE POLICY messages_recipient_mark_read
  ON public.messages FOR UPDATE TO authenticated
  USING (
    read = false
    AND sender_id <> (SELECT private.current_active_community_id())
    AND EXISTS (
      SELECT 1 FROM public.conversations AS c
      WHERE c.id = messages.conversation_id
        AND (
          c.participant_1_id = (SELECT private.current_active_community_id())
          OR c.participant_2_id = (SELECT private.current_active_community_id())
        )
    )
  )
  WITH CHECK (
    read = true
    AND sender_id <> (SELECT private.current_active_community_id())
    AND EXISTS (
      SELECT 1 FROM public.conversations AS c
      WHERE c.id = messages.conversation_id
        AND (
          c.participant_1_id = (SELECT private.current_active_community_id())
          OR c.participant_2_id = (SELECT private.current_active_community_id())
        )
    )
  );

COMMIT;
