ALTER TABLE public.feedback ADD COLUMN mission_id uuid REFERENCES public.missions(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS feedback_mission_id_idx ON public.feedback (mission_id);