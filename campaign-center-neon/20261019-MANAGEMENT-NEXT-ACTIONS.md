# Management — operational next-action queues (GitHub Draft)

This stage extends PR #44's management command center without additional DB migrations.

**What a manager can see immediately:** real organization-wide counts for "my assigned plans", "needs attention", overdue plans, due in the coming 48 hours and unassigned plans. There is a one-touch Yiddish RTL action queue picker next to the full status list. Every filter is executed server-side before the 40-card mobile pagination, with actual global matching counts; manager/owner permissions and organization boundaries are enforced by the existing API. Search, status and action queue combine rather than silently resetting one another.

The needs_action queue deliberately means **manually recorded** work that is ready, blocked, failed or waiting, plus open overdue deadlines. It is NOT an AI judgement about an employee or an assertion that a charity campaign failed.

A manager's "mine" queue is limited to plan records explicitly assigned to their authenticated subject. Unassigned plans are shown separately and cannot be mistaken for an unassigned employee. Existing assignment, Gabbai blocked handoffs, finance approvals and Guidance counters remain distinct facts on the leadership overview.

Disposable PostgreSQL tests cover a 44-plan backlog, second-page filtering, two managers' personal assignments, overdue vs due-soon separation, mixed status filtering and invalid inputs. RTL view tests verify counts and appropriate labels.

No Render deployment, no production Neon changes, no external telephony, payments or background notifications. Stage 035 and earlier 027–034 remain Draft pending end-to-end Android approval.
