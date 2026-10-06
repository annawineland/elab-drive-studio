-- Allow teachers to rename mods (names only in practice; row-level policy gates it to teachers)
GRANT UPDATE ON public.mods TO authenticated;

CREATE POLICY "Teachers can update mods"
ON public.mods FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'teacher'))
WITH CHECK (public.has_role(auth.uid(), 'teacher'));

-- Store a student display name on each roster entry, usable before the student signs in
ALTER TABLE public.mod_enrollments ADD COLUMN student_name text;