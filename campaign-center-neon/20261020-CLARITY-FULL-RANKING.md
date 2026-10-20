# Clarity: exact SQL ranking of the complete authorized task and CRM candidate pool

**Stage: GitHub Draft; no Render production deployment, no production Neon migration and no paid third-party service.**

## Corrected
The original `GET /api/pro/campaigns/:cid/clarity` independently sliced tasks and CRM candidates to `LIMIT 50`, then ranked their union in JavaScript. This could omit overdue/high-priority tasks or CRM callbacks, especially for large organizations. It also did not report the true total count.

The new endpoint uses a single read-only PostgreSQL CTE over every authorized outstanding assignment and each permitted active CRM follow-up, with one deterministic priority/deadline ranking and **only one final `LIMIT 5`**. It returns `eligibleTotal`, `allEligibleActionsConsidered`, `rankedServerSide`, actual 5 recommendations, `Cache-Control: private,no-store`, and explicit labels that there is no autonomous AI, message sending or dialing.

Access is verified through current authenticated campaign/organization membership. Ordinary askanim cannot see another team's assignments; captains can see only peers of the same nonempty team. CRM follow-ups preserve private-owner-only records, nonblank assigned teams, DNC exclusions, closed contacts and ongoing call claims by other workers.

The Android Yiddish Clarity panel now shows the **full number of eligible candidate actions** along with its top 5, so the display does not misleadingly claim there are only five things to do. Failed backend reads are shown as incomplete, never reported as a false empty workload.

## QA and remaining release gates
Disposable PostgreSQL integration regression creates **382 authorized action candidates** for a team (261 tasks plus 121 CRM follow-ups), another team's hidden critical task, private, empty-team and do-not-call contacts. Tests owner/captain/worker scopes, DNC flipping, other organization's privacy and inactive membership. Android UI tests show the true total, safe HTML escaping and no fake empty success.

This is a bounded, source-grounded pilot; the system is **not a predictive AI** and does not automatically make decisions or place calls. The remaining partial features, real carrier/hotline/Caller ID connectors, 001–038 production-matched staging rehearsal, safe backup/recovery and two-account Android UAT are still needed before any actual launch. Do not self-upgrade paid plan entitlements.
