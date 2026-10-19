-- 034: Gabbai Pro honest human-reported work blockers.
-- Staged after ONE reconciled canonical 033_gabbai_operations_handoffs.sql.
-- No phone calls or automated follow-up; historical events remain immutable.
ALTER TABLE public.cc_gabbai_handoffs
 DROP CONSTRAINT IF EXISTS cc_gabbai_handoffs_status_check;
ALTER TABLE public.cc_gabbai_handoffs
 ADD CONSTRAINT cc_gabbai_handoffs_status_check
 CHECK(status IN ('open','in_progress','blocked','done'));
ALTER TABLE public.cc_gabbai_handoff_events
 DROP CONSTRAINT IF EXISTS cc_gabbai_handoff_events_status_to_check;
ALTER TABLE public.cc_gabbai_handoff_events
 ADD CONSTRAINT cc_gabbai_handoff_events_status_to_check
 CHECK(status_to IN ('open','in_progress','blocked','done'));
COMMENT ON COLUMN public.cc_gabbai_handoffs.status IS
 'Blocked is a manually-reported obstacle, NOT an automatic work score or escalation.';
