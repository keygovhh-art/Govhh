# Gabbai Pro — mobile workload triage (staged, not live)

Campaign Center Govhh only. This Draft is stacked on PR #35 (which is stacked on #34 → #30). It does not change Render or Neon.

## Delivered in this branch
- RTL Yiddish mobile workload view: show all, overdue, due within 48 hours (recorded campaign tasks), or members with no recorded assigned task/handoff.
- Search permitted loaded campaign members by subject, team, and role; HTML-escaped values; manager-only display.
- One-tap delegation into the existing handoff form, keeping the selected member.
- Exact loaded-row counts and clear note that the existing endpoint returns at most 500 members. No claim that a member with no recorded work is truly available.
- Standalone Node DOM/string tests added to the existing CI workflow. No new database migration or background worker needed.

## Release and integration warnings
- **PRs #33, #34, #36, and #37 have multiple incompatible stage-033 handoff database designs.** DO NOT combine their migrations or assume any is canonical. The branch here extends PR #34/#35 only. Reconcile alternatives and select one reviewed database shape before any production release.
- Current production is at October 16 Render code; all stage-027...033 changes remain staged. Preserve Neon backup branches.
- Full Android owner and member testing and scope/plan-permission tests are needed, as well as CI confirmation.
- This is a managerial workload tool, never an employee performance rating, automatic assignment, outbound phone call, or donor database export.


## Campaign-scale upgrade in the same draft
- The authenticated leadership-only member-workload endpoint computes global totals over **all** active members, using grouped task/handoff counts before the 500-card limit. This fixes previously incomplete totals for larger campaigns.
- Returns top 100 team aggregates (member counts, overdue/open tasks, due-in-48-hour tasks and open/overdue handoffs), the exact campaign member total, 500 mobile cards and an explicit truncated flag. Teams outside the top-100 summary are not silently claimed to be displayed.
- The Android Yiddish UI shows the campaign-wide totals and the five teams most affected by overdue work, with per-team drilldown and a complete team picker for the included team summaries.
- Search, group choice and the individual-card filter apply **only** to cards currently loaded. They do not claim to search all 500+ active members; the full-team aggregate does account for all records.
- PostgreSQL acceptance coverage inserts 505 additional active members and checks that 507-member global/team totals remain accurate while payload cards cap at 500.
- Release remains blocked until the mutually incompatible 033 handoff drafts are reconciled, migrations 027–033 are staged in order, and two-user Android user acceptance is verified. Render and Neon production remain unchanged.
