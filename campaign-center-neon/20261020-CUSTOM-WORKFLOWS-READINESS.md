# Campaign Center 72-feature buildout — Custom Workflows (stage 036)

Scope: **six Campaign Center plans only**. Personal Askan Free and personal notes belong to independent Gavhah, linked only by reviewed Gavhah Connect sharing permissions.

## Previously missing: Custom Workflows
A campaign leader with **trusted Custom plan entitlement** can build a human checklist (1–12 named steps), archive a template and assign a template instance to a currently active member of the **same campaign**. The member is selected from the existing campaign member dropdown, not by typing a raw ID. Workers only see their own instances; leaders can see their campaign's instances. A worker or leader can confirm exactly one step at a time, declare a blocked step with a reason, or explicitly resume. Only leadership can cancel. Each change uses an expected version, avoiding simultaneous overwrites. Completed runs do not reopen implicitly. Events are append-only with actor, time and step index. Neither archiving a template nor pausing work deletes history.

## Real integration
- Backend: `/api/custom/campaigns/:cid/workflow-templates`, `workflow-runs`, `workflow-runs/:id/action`, `workflow-runs/:id/events`
- Server plan-policy exact-route checks require Custom tier and `custom_workflows` specifically. No lower tier gains access.
- New RLS-enabled tables: `cc_custom_workflow_templates`, `cc_custom_workflow_runs`, `cc_custom_workflow_events` (migration 036).
- Mobile UI: `src/custom-workflows-view.js`, tab `workflows`, independent of Custom Focus.
- Organization management command center now includes real **open, blocked and completed Custom workflows** totals; no fabricated success.
- Disposable Postgres acceptance tests check plan grants, tenant isolation, manager/worker role gates, active assignment, concurrency, history, failures and archive.
- Release manifest, read-only schema gate, guarded additive upgrade, and immutable RLS review updated to 036. Old partial 027–035 upgrader is intentionally disabled.

## Not done / blockers
This is a human workflow **pilot in source code**, not a production-tested external automation engine. It does not charge cards, dial calls, send provider messages, invent artificial "AI" results or allocate Custom capacities. The other missing catalogue items — custom roles, hotline provider, outbound authorized caller ID, contracted capacity — still need implementation or explicit third-party integration/contract approval. A green GitHub CI result is not a production mobile acceptance test.

Before launch: production-matched Neon staging and fresh backup, review 036 in migration sequence, two-account Android walkthrough, chosen six-tier service permissions and independent explicit user permission for any production Neon or Render writes.
