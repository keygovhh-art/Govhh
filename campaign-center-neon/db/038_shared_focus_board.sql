-- 038: human-curated Campaign Center shared Focus, NOT personal Gavhah notes.
-- Empty team_name means leadership-only campaign board; named boards belong to
-- the selected campaign team. Existing worker privacy still applies on reads.
CREATE TABLE public.cc_shared_focus_boards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 team_name text NOT NULL DEFAULT '' CHECK(length(team_name)<=100),
 task_ids uuid[] NOT NULL DEFAULT '{}'::uuid[] CHECK(cardinality(task_ids)<=3),
 version integer NOT NULL DEFAULT 0 CHECK(version>=0),
 updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,campaign_id,team_name),
 UNIQUE(organization_id,campaign_id,id),
 FOREIGN KEY(organization_id,campaign_id)
  REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,updated_by)
  REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT
);
CREATE INDEX cc_shared_focus_campaign ON public.cc_shared_focus_boards
 (organization_id,campaign_id,updated_at DESC);
ALTER TABLE public.cc_shared_focus_boards ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.cc_shared_focus_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 board_id uuid NOT NULL,
 actor_subject text NOT NULL,
 version integer NOT NULL CHECK(version>=1),
 previous_task_ids uuid[] NOT NULL,
 new_task_ids uuid[] NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(board_id,version),
 FOREIGN KEY(organization_id,campaign_id,board_id)
  REFERENCES public.cc_shared_focus_boards(organization_id,campaign_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,actor_subject)
  REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT
);
CREATE INDEX cc_shared_focus_history_scope ON public.cc_shared_focus_history
 (organization_id,campaign_id,board_id,created_at DESC);
ALTER TABLE public.cc_shared_focus_history ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER cc_shared_focus_history_immutable BEFORE UPDATE OR DELETE
 ON public.cc_shared_focus_history FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
COMMENT ON TABLE public.cc_shared_focus_boards IS
 'Human-curated shared campaign Focus. Manager/captain updates only. Members see only tasks otherwise authorized by existing task rules.';
