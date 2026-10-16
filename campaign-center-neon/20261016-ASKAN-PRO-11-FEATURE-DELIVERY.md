# Askan Pro — 11 פונקציעס, אמתער אויפבוי־באריכט
**16 אקטאבער 2026 · Campaign Center · Draft PR #14**
באזע: Campaign Center PR #12 → Askan Plus PR #13 → Askan Pro PR #14.
**קיין Merge, Render Deploy, Neon Production Schema אדער Billing־ענטייטעלמענט נישט געמאכט.**

| # | פונקציע | מצב אין דעם Draft | באווייז / וואָס נאך פעלט |
|---|---|---|---|
| 1 | Advanced CRM | **נייער Pilot** | `/api/pro/campaigns/:cid/contacts`, contact stage/priority/10 tags/next follow-up, role/team/private filtering; staging migration 017, maobil CRM |
| 2 | Relationship History | **נייער Pilot** | Manual call events + private custom interaction records, append-only trigger, login/membership enforced, audit does not contain actual notes |
| 3 | Campaign Files | Missing | Storage, virus/file content checks, private access, max-size, export/download, retention/quotas and real Android testing needed |
| 4 | Advanced Call Lists | Existing Pilot | Member/squad contact queues, atomic claims and DNC; advanced segmentation and calling logic remain incomplete |
| 5 | CSV Import / Export | Existing Pilot | Manager preview/import, duplicate protection; exports scoped. Excel real `.xlsx` import and bigger list testing not yet done |
| 6 | Clarity Engine | **New Partial** | Deterministic API returns top five authorized overdue tasks/CRM followups, no predictive model, no autonomous workflow |
| 7 | Next Best Action | **New Partial** | Evidence-based ranking by overdue, priority, deadline; no AI probability, no agent execution |
| 8 | Advanced Automations | Missing | No background sender/verified tenant scheduler, push/email permissions, retries, unsubscribe, delivery audit |
| 9 | Professional Guidance | **New Partial** | Private internal guidance queue for manager/requester with append-only messages and audit; real contracted adviser, staff escalation and response SLA still unavailable |
| 10 | 7-Day Sprint / 30-Day Memory | **New Partial** | Real private Sprint + 1–21 steps, day 1–7, completion, archive, append-only 30-day events; staging migration 018, NO autonomous reminders/complete organization memory |
| 11 | Blocker & Pattern Intelligence | Missing | Genuine task-stage blocker reasons, completion-pattern analytics, source explanations and privacy review need implementation |

## Security test objectives
- Disposable localhost PostgreSQL only; no staging/prod secrets.
- Multi-organization and two-squad CRM search/timeline privacy; PRIVATE contacts accessible ONLY to creator even against workspace owner.
- CRM audit strips actual note content, immutable detailed interaction records; revoked member denied.
- Clarity only uses authorized tasks and visible CRM follow-ups, no hallucinated AI actions.
- Private owner-only 7-day Sprint, one open per campaign/user, unique constraint, per-step immutable activity, status transitions, 30-day archive/history, revocation denies access.
- Guidance: member-only private requests plus manager replies, immutable messages, no private text in shared audit, member revocation denial.

## Schema and release order
- `db/017_askan_pro_crm.sql` has two additive CRM tables and append-only interaction trigger.
- `db/018_askan_pro_focus_sprints.sql` has Sprint, Steps and Activity tables with secure row rules and append-only trigger.
- `db/019_askan_pro_guidance.sql` has private guidance request and append-only conversation tables.
- DB 017–019 require BASE 001–012 and unshipped 013–016 from PR #12 and #13. The old release runner ONLY certifies 001–012; NEVER assume it applied 013–019. Production migration requires an approved, reviewed path, backup, verified correct Neon project/branch/host, and explicit permission.
- No paid plan enforcement yet. These are product features staged for UAT, not available on production nor 100% end-to-end.

## Next backlog (in priority order)
1. Verify successful CI jobs for latest head and add actual Android multi-user CRM/Sprint acceptance.
2. CRM relationship history: segmentation, tag indexing, follow-up completion, duplicate handling and cross-project privacy.
3. Document storage with private access; real Excel import.
4. Per-user automation schedule, delivery backend and opt-in (not just UI), including retry and rate limits.
5. Internal guidance queue is implemented; actual staffed professional advisers, escalation, priorities and a formal SLA need human service before being offered.
6. Evidence-based blocker analytics, 30-day campaign history and Clarity explanations.
7. Billing/entitlement engine and true service plan ceilings; do not claim Askan Pro active/paid.

**No Personal Askan copy belongs in Campaign Center; that separate personal tool is ONLY in Gavhah.**