-- 029: Askan Pro upload/download real campaign documents, additive and RLS deny by default.
-- No external object store configured: 1 MiB per file, max 20 documents per
-- campaign / 12 MiB. No self-serve delete (document and audit append-only).
-- Only PDF, JPG, PNG and UTF-8 plain text. Never treat source files as trusted.
CREATE TABLE IF NOT EXISTS public.cc_pro_campaign_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 campaign_id uuid NOT NULL,
 uploaded_by text NOT NULL,
 visibility text NOT NULL CHECK(visibility IN ('private','team','campaign')),
 team_name text NOT NULL DEFAULT '',
 original_name text NOT NULL CHECK(length(original_name) BETWEEN 1 AND 120),
 media_type text NOT NULL CHECK(media_type IN ('application/pdf','image/jpeg','image/png','text/plain')),
 bytes_length integer NOT NULL CHECK(bytes_length BETWEEN 1 AND 1048576),
 sha256 char(64) NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 file_contents bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,campaign_id,id),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES public.cc_campaigns(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,uploaded_by) REFERENCES public.cc_memberships(organization_id,subject) ON DELETE RESTRICT,
 CHECK((visibility='team' AND length(team_name)>0) OR (visibility<>'team' AND team_name='')),
 CHECK(octet_length(file_contents)=bytes_length)
);
CREATE INDEX IF NOT EXISTS cc_pro_files_campaign_created ON public.cc_pro_campaign_files(organization_id,campaign_id,created_at DESC);
ALTER TABLE public.cc_pro_campaign_files ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER cc_pro_campaign_files_immutable BEFORE UPDATE OR DELETE ON public.cc_pro_campaign_files
 FOR EACH ROW EXECUTE FUNCTION public.cc_prevent_history_mutation();
COMMENT ON TABLE public.cc_pro_campaign_files IS 'Askan Pro pilot. Encrypted at rest by DB provider; limited bytea, per-document access checked by server. No virus scanning or external media CDN. Attachments only; no inline rendering.';
