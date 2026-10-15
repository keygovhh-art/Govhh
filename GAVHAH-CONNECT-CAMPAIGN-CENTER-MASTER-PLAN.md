# Campaign Center × Gavhah MAX — Integration/Operations Architecture
2026-10-14 · STAGING ONLY · Architecture contract, **not** a connected production feature

## Product promise
- **Campaign Center** runs the campaign **team**: organizer roles, assignments, goal reporting, team leadership, verified money, departments, multiple campaigns.
- Each member receives a first-class **personal** desk answering "וואס דארף איך יעצט טון?" and optionally full **Gavhah MAX**, paid by the organization through sponsored seats.
- **My Askanus** summarizes each member's individual projects, their true financial impact and history.
- **Olam Hachesed MAX** tracks *how work is performed*: donor contacts, call outcomes, personal planning, pledges, money receipts and unlimited linked follow-ups.
- **כח הרבים לייוו** is a future provider-backed virtual room with large-group announcements, managed breakout groups, private donor-call handoffs, call outcomes and honest verified real-time totals.

## Cross-product connection — required API contract
### Entities
Account, PersonalWorkspace, Organization, Campaign, TeamMembership, SponsoredSeat,
CampaignLead, LeadAssignment, CampaignProjectLink, SharedFollowup, CallEvent,
Pledge, PaymentReceipt, Correction, Room, RoomParticipation.
Use immutable UUID identifiers at integration boundary; do not rely on matching integer IDs across old repositories.

### Roles, isolation, consent
Owner, manager, squadLeader, askan, finance, auditor. Workspace membership is checked server-side on EVERY read/write. Independent campaigns do not share leads or financial data by default. A team member's private address book/notes stay private unless explicitly exported/linked to a campaign; revocation removes access but keeps campaign audit records.

### Data flow
1. Manager assigns 20 campaign leads to one member in Campaign Center.
2. Member sees their own 20 leads and 3 overdue follow-ups inside MAX, plus their My Askanus overview.
3. Member records $20 manually received tied to a specific campaign and call. One idempotent finance event becomes visible to authorized personal and campaign dashboards, not three separate donations.
4. Manager sees permitted team progress, not private notes.
5. If payment was only promised, do not add to received. Ledger reconciliation and partial payments distinguish paid from outstanding.
6. If a follow-up is created in either view, it is the same immutable record; all status/note/date updates reuse one API; no synchronization copies.
7. Sponsor license revocation ends sponsored access without deleting private content or historical campaign attribution.

## Virtual hall
- Moderator address and announcements for the main room
- Breakout groups with assigned squad leader
- Private donor call leg separate from room audio; automated return when call ends
- Room presence, assignment queue and team support
- Real-time numbers represent server-confirmed activity, not fake demo events
- Telephone provider and scale verification required before launch

## Present repo reality (verified in code audit 2026-10-14)
`campaign-center-v2` uses browser localStorage for most team/campaign data; the old Supabase client is not Neon production integration. Multi-campaign counts, sponsoring a MAX license, telephony and shared finance ledger are **not** safely wired. Do not present any of these as live.
The separate portal code in `keygovhh-art/Lcb` has a new staging-only first phase on `feature/gavhah-max-integration-20261014`.

## Migration sequence
1. Stabilize Campaign Center app load and authentication; validate ownership and membership.
2. Replace demo/localStorage team state with actual Neon tables/secure backend before cross-product integration.
3. Implement consented Gavhah Connect membership, assignments, billing entitlements and API scopes.
4. Integrate single ledger/follow-ups with My Askanus and MAX; test conflict/retries and privacy.
5. Implement provider-driven virtual fundraising hall and enterprise scale testing.

## No production action
Do not merge/deploy this contract as a claim that product functionality is active; code integration requires the backend work above.
