# קאמפיין סענטער — Askan Plus: פונקציע־דורך־פונקציע איבערפרוף
**16 אקטאבער 2026 | סקאָופּ:** בלויז Askan Plus, דער צווייטער פון זעקס קאמפיין־פלענער.
**Branches:** הויפט־Draft PR #12 = `feature/six-tier-master-rollout-20261016`; דאס ארבעטס־פאקטעט = `feature/askan-plus-real-operations-20261016`, Draft PR #13, באזירט אויפן ערשטן.
**נישט לייוו:** קיין Merge, קיין Render־פובליקאציע, קיין Neon־פראדוקציע־מיגראציע, קיין Paid Plan־אקטיוויזאציע.

## 14 פונקציעס און דער אמתער מצב
| # | Askan Plus פונקציע | קאוד/סטאַטוס | וואס איז געבויט אדער וואס פעלט |
|---|---|---|---|
| 1 | גרופעס, גרופע־פירער | Pilot | Invite, Team Assign, active membership/roles שוין דא; Android UAT פעלט |
| 2 | אייגענער עסקן־דעשבאורד | **נייער Pilot** | Authenticated `/api/plus/campaigns/:cid/member-desk`: אייגענע Tasks, איבערטערמין, רופן, פינאנץ; קיין אנדערע עסקן־פריוואטע פרטים |
| 3 | נדבן־ליסטעס | Pilot | Contacts, Privacy, No-Call, scoped CSV, manager view; פילטער־פארבעסערונגען פעלן |
| 4 | רופן־צוטיילונגען | Pilot | Contact team assignment, atomic claim/release, conflicting claim 409 |
| 5 | רוף־נאטיצן און נאכפאלגן | Pilot | Manual call outcomes/notes, case tasks; לענגערע Followup Scheduler פעלט |
| 6 | טיילווייזע התחייבויות | **נייער Pilot** | Append-only receipt linkage, remaining amount, idempotent request UUID, `GET pledges`, טראַנזאקציע־לאק |
| 7 | טשעק/קעש־דעטאלן | **נייער Pilot** | `cc_plus_manual_receipts` מיט cash/check/bank/external און רעפערענץ, מענטש־אריינגעגעבן; נישט באנק־באשטעטיגט |
| 8 | עסקן/גרופע Credit | Partial | Finances credited_member_subject און Team totals; פולע attribution/corrections און Cross-Case parity פעלן |
| 9 | Donation Levels | **נייער Pilot** | 0–8 מנהל־באשטימטע סכומים/נעמען, איין־דרוק אויספילן די מאנועלע Finance־פאָרם; נישט Payment Checkout |
| 10 | פארגעשריטענע טעסקס | **פארבעסערטער Pilot** | Manager handoff / same-squad leader only, due date and permanent audit, rejects completed and closed tasks |
| 11 | פריוואטער מאנשאפט־זאל | Pilot | Existing room join/role/announcement foundations, אמתע סקיילעד קול/ווידעא נאך אפן |
| 12 | מנהל־מעלדונגען | Pilot | Existing scoped room announcements / program tools |
| 13 | טיפערע Reports | **נייער Pilot** | 7/30/90-day role-restricted teams-report, separate aggregates for tasks/calls/pledges/net manual |
| 14 | Basic Alerts | **פארבעסערטער Partial** | אויפן סקרין overdue tasks scoped by member/squad/manager, 7-day unlogged call report for manager. **קיין background push/email** |

## געלט־זיכערהייט
- הבטחה און אפגעגעבן געלט זענען באַזונדערע append-only פינאנציעלע רעקארדס; אן אומבאשטעטיגטער מאנועל באריכט איז נישט קיין באנק־ אדער קארטל־באשטעטיגונג.
- Partial receipt ID מוז זיין אן אייגענער UUID; אן איבערחזרנדיקער פארלאנג מיטן זעלבן UUID שאפט נישט קיין צווייטע פינאנציעלע געשעעניש.
- א נעא־טראַנזאקציע לאקט די Pledge־שורה, און א גרעסערע סכום ווי דער אפענער רעשט ווערט אפגעווארפן.
- Check/Cash מעטאד און רעפערענץ בלייבן אין באשיצטער טאבעלע; פינאנציעלע History האט א DB־trigger קעגן Update/Delete.
- קיין געהיימע Provider Tokens, Card Numbers אדער Backoffice Privilege ווערן נישט געוויזן אויפן Browser.

## נייע טעסטן
- `tests/askan-plus.test.mjs`: צוויי גרופעס, אן אנדערע ארגאניזאציע, role denial, manager reports, per-member metrics, task handoff, audit/no-op, scoped overdue warnings and donation preset permissions.
- `tests/plus-pledges.test.mjs`: אנדערער מוסד אפגעווארפן, cashier-only writes, manual amounts, incomplete pledge, retries, overpayment, race/serialization, check provenance, append-only trigger, no processor verification.
- `npm run check` און Vite `npm run build` דורך GitHub Actions, אויף צוגעלייגטן Pull Request; א גרינער CI זאגט נישט אז די React־סקרינען זענען אנדרויד־אויספרובירט.

## DB migrations און נעקסטע Release Gates
- `015_donation_levels.sql`: נאר קאנטראלירטע סכום־איינשטעלונגען מיט RLS.
- `016_partial_pledge_receipts.sql`: immutable metadata פאר מאנועלע טייל־באצאלונגען מיט RLS.
- די פריערדיגע 013 Campaign Goals און 014 Donation Link מיגראציעס קומען פונעם בסיס־Draft PR #12. **מען טאר נישט דורכפירן בלויז 015/016 אויף אן אלטן פראדוקציע־DB.**
- דער דערווייליגער release runner (001–012) איז *נישט* א באשטעטיגטע production 013–016 migration procedure. Staging backup, verified host/branch, conflict-free base, rollback און דערלויבעניש זענען נויטיג.
- פונקציעס קענען נישט פארקויפט ווערן פאר Askan Plus ביז paid-entitlement / tier-limits טעסטן און אמתע Android user testing.
- צו גיין צום קומענדיגן פלאן **Askan Pro** מוז די Askan Plus אַפּאראט קודם האבן באשטעטיגטע release gates; קיין אומבאשטעטיגטע פובליקאציע פֿון אנדערע שמועסן.

**סוף־פסק:** 14 פון 14 פונקציעס זענען אפגעדעקט אינעם מאסטער־קאוד־פלאן מיט אן עכטע יסוד אדער א קלארן Partial; **נישט** 14 פון 14 ווי 100% ארויסגעגעבן אויף פראדוקציע.