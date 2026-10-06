CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  entry_id uuid REFERENCES public.entries(id) ON DELETE CASCADE,
  mission_id uuid,
  stage text NOT NULL DEFAULT '',
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_recipient_idx ON public.notifications (recipient_id, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipients read their notifications"
ON public.notifications FOR SELECT TO authenticated
USING (recipient_id = auth.uid());

CREATE POLICY "Recipients update their notifications"
ON public.notifications FOR UPDATE TO authenticated
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "Recipients delete their notifications"
ON public.notifications FOR DELETE TO authenticated
USING (recipient_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_teachers_of_mission_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_name text;
  _team_name text;
  _mission_title text;
  _graded boolean := false;
  _kind text;
  _title text;
BEGIN
  IF NEW.mission_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip teachers editing their own notebook
  IF public.has_role(NEW.user_id, 'teacher') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.title IS NOT DISTINCT FROM OLD.title
     AND NEW.content IS NOT DISTINCT FROM OLD.content THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO _actor_name FROM public.profiles WHERE id = NEW.user_id;
  SELECT name INTO _team_name FROM public.teams WHERE id = NEW.team_id;
  SELECT title INTO _mission_title FROM public.stage_missions WHERE id = NEW.mission_id;

  IF NEW.team_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.mission_grades
      WHERE mission_id = NEW.mission_id AND team_id = NEW.team_id
    ) INTO _graded;
  END IF;

  IF _graded THEN
    _kind := 'graded_mission_changed';
    _title := 'Graded mission work changed';
  ELSIF TG_OP = 'UPDATE' THEN
    _kind := 'mission_updated';
    _title := 'Mission response edited';
  ELSE
    _kind := 'mission_submitted';
    _title := 'New mission response';
  END IF;

  INSERT INTO public.notifications
    (recipient_id, kind, actor_id, team_id, entry_id, mission_id, stage, title, body)
  SELECT ur.user_id, _kind, NEW.user_id, NEW.team_id, NEW.id, NEW.mission_id, NEW.stage, _title,
         coalesce(_actor_name, 'A student')
         || coalesce(' (' || _team_name || ')', '')
         || ' · ' || coalesce(_mission_title, NEW.title)
  FROM public.user_roles ur
  WHERE ur.role = 'teacher';

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_teachers_mission_entry
AFTER INSERT OR UPDATE ON public.entries
FOR EACH ROW EXECUTE FUNCTION public.notify_teachers_of_mission_entry();

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;