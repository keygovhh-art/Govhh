# Gabbai Pro: manually reported blockers and manager attention

**Draft only — not released to Render or production Neon.** Built after PR #39, in the PR #34/#35 canonical handoff draft lineage. Other PR #33/#36/#37 handoff stage-033 alternatives are incompatible and **must not** be combined blindly.

A worker assigned to a Gabbai handoff can report **blocked** with a mandatory short reason. This remains a human declaration, not an automated employee assessment. The manager's Yiddish RTL handoff board displays the blocked count and a Blocked filter, and the member/manager can explicitly resume work. The reason is recorded in an append-only timestamped handoff history, accessible only to authorized handoff participants/management; shared audit contains status and note-present flag but not private text.

Schema file `034_gabbai_blocker_status.sql` extends the *unreleased* canonical 033 handoff status and event status-to CHECK constraints. Test migration order: 001, 002, 026, 033, 034 for the isolated dedicated regression; full pre-release staging order still requires reviewed 001..034 as applicable. Never apply 034 before 033 or to an alternate handoff schema without explicit review.

This feature does not place calls, send emails, alter finances, promise a service response time, or mark work completed automatically. Android member and manager confirmation, migration conflict resolution and user-approved release remain open.
