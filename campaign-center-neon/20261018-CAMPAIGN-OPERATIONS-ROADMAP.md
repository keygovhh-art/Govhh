# גבהה קאמפיין סענטער — מקצועיות און נוצבארקייט, 18 אקטאבער 2026

## הויפט־פרינציפ
בויען *אמתע ארבעטס־פונקציעס* פאר די עסקנים, גבאים און הנהלות. זיכערהייט און אחריות זענען איינגעבויט, אבער נישט אנשטאט נוצן. יעדער פונקציע האט צו האבן א געשמאקן מאבילן אויסשטעל + אמתן API + דאטאבעיס־קוואל + CI־טעסט.

## די יעצטיגע באשטעטיגטע גיט־האבן אויסבויען (נישט דער זעלבער זאך ווי לייוו)
- Production Campaign Center: `https://gavhah-campaign-center.onrender.com`; GitHub `keygovhh-art/Govhh`, Render service `srv-db84angn74is73dnv0cg`; Neon project `still-haze-11727622`.
- Production branch `prep/neon-render-campaign-center-20261014`, autoDeploy OFF.
- Distinct separate Gavhah homepage/hotline: `keygovhh-art/Lcb`, DO NOT mix users/phone signups or databases.
- **Chesed Quick**, PR #23, migration 027: private 7-day daily focus memory, daily snapshot, system Watch, task due dates.
- **Askan Plus**, PR #24, migration 028: acknowledge own overdue alerts without altering coworkers' work; repeat after due-date change.
- **Askan Pro files**, PR #25, migration 029: authenticated PDF/JPG/PNG/TXT attachments with honest file limits; no malware scanner.
- **Askan Pro CRM automation**, PR #26, migration 030: member-controlled manual-run overdue CRM task conversion; no automatic outbound calls or messages.
- **Askan Pro call lists**, PR #27: manual DNC- and claim-filtered CRM worklists.
- **Clarity / Next Action**, PR #28: safe source filtering; PR #29, migration 031: *human* accept / later / skip decisions with private history; can now also start or complete a canonical task directly from Clarity.
- **Askan Pro Guidance**, PR #30, migration 032: search/filter, leadership take/release a case, voluntary response target, Mine/Overdue queues, actual case messages. This is internal human help, not a contracted 42-hour professional SLA.
- **Gabbai Pro**, PR #31: actionable all-record finance approval counts and sums, My/Pending/Reviewable filters, searchable approval queue, written explanation required for rejection and visible in history; actionable top 25 urgent assignments with start/complete buttons in team management view. No bank transfers performed.

## Critical pending release prerequisites
1. Never confuse green GitHub CI with a successful Android live user session.
2. Migration 027–032 depends on 001–026; earlier Neon staging `br-sparkling-term-b5dqbtco` was missing some older schema. Must set up a matching isolated staging branch, apply in order and test. DO NOT blindly run late migrations on live.
3. Only operator-authorized effective paid tier entitlements unlock paid routes; don't silently invent payments/activate plans.
4. Keep old data; ensure current production backup/recovery; obtain scope-specific production publishing permission before changes to live Render or Neon.
5. Multi-user and multi-tenant end-to-end Android testing, then monitored release and rollback.
6. Current code/docs/PRs stacked; do not merge unrelated other-chat changes.

## Next professionally useful functions, one by one
- Gabbai Pro: finance reconciliation/receipt follow-up queue, **no false bank verified** claim.
- Gabbai Pro: custom role/department templates with accurate permission enforcement.
- Organization: shared multi-campaign workload planning and delegated request center.
- Custom: negotiated capacities, controlled approved telephone/provider integration, approved authorized caller-ID, API connections.
- Campaign Center phone/member enrollment uses Neon Auth; never conflate with separate Gavhah website members.
- After each individual feature: mobile UI, real backend, CI, honest status, no background-work promises.
