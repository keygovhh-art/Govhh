-- 010: Optional clock-driven event programming. Manager chooses automatic start.
-- No cron provider: first authorized room request after a boundary reconciles
-- the schedule, and call submissions themselves enforce the break immediately.
ALTER TABLE public.cc_floor_programs
 ADD COLUMN IF NOT EXISTS auto_start boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS cc_floor_auto_pending_idx
 ON public.cc_floor_programs(room_id,scheduled_start,scheduled_end)
 WHERE auto_start AND status IN ('scheduled','live');
