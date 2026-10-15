# ווירטועלער קאמפיין־זאל און התקבצו — מאסטער־אויפבוי 15 אקטאבער 2026

STAGING ONLY. קיין Render־דיפּלוימענט און קיין פראדוקציע־דאטעבאזע־מיגראציע. Auto Deploy איז OFF.

## 1. ווירטועלער גרויסער קאמפיין־צוזאמקום
דער מנהל עפנט א וועב־עסקנים־זאל. יעדער אקטיווער מיטגליד קען אריינקומען סיי ווען בשעתן אוונט, זיך אריינטשעקן אדער ארויסטשעקן, צוריקקומען שפעטער, און זען דעם איצטיגן מצב און די לעצטע אפדעיטס. דער באזונדערער פראגראם־לוח האט אנהייב־און־ענדע־צייטן, טיטל, רעדנער, סארט, באשרייבונג און אפציאנעלן HTTPS אודיא־לינק.

עס איז דא א לאקאל־צייט 1:30–2:00 לאנטש־און־חיזוק־איינשטעלונג. דער מנהל דארף באשטעטיגן אנהייב און סוף פונעם פראגראם; עס גייט נישט נאכנישט אויטאמאטיש דורך א Scheduler. בשעת די פראגראם־אקטיוויטעטן לאזט דער קאמפיין־זאל נישט רעקארדירן נייע רופן פון דעם זעלבן זאל. דערנאך גייט דער זאל צוריק צום רופן.

עסקנים קענען נעמען א קשר (20 מינוט, אטאמישע רשות), עפענען דעם אייגענעם טעלעפאן־דיילער, און רעקארדירן דעם רעזולטאט אין Neon. דער סערווער פרואווט גרופע־רעכטן, נישט־רופן־פארבאטן, רוף־אייגנטומערשאפט, אריינטשעקן און דאבליקאט־באריכטן. נישטא קיין אינטעגראציע וואס באשטעטיגט דער אמתער דורכגעפירטער טעלעפאן־רוף.

מנהל און עסקנים זעען לעבעדיגע ציפערן, לעצטע געשיכטע און נאכפאלגן. דער מנהל זעט לעצטנס אנליין עסקנים, קלאר אפגעטיילט פון די איינגעטשעקטע. א פריוואטער הילף־צענטער פארבינדט א עסקן מיט א בארעכטיגטן מנהל, מיט צוריקענטפערן און פארענדיקן טיקעטס. ביים פארענדיקן אוונט ווערן אלע אקטיווע טשעקינס און פראגראמען פארמאכט, אן אויסמעקן געשיכטע.

## 2. התקבצו — באזונדערער אסיפה־צענטער
אסיפות, דרשות, חיזוק, עצות און טעכנישע אויסשמועסן. מיטגלידער־איינגאנג אדער גע'האשט צוטריט־קאוד, מאדערירטער ווארט־צימער, אויפהייבן די האנט, רעדן־רשות, שטיל־מאכן, ארויסנעמען, פארשפארן, צוריקלאזן, דרשה, שאלות ותשובות און אפענע דיסקוסיע. נאר בארעכטיגטע מענטשן זעען די אינערליכע מעסעדזשעס און אנטיילנעמער.

דערווייל קאנטראלירן די רעדן־רעכטן נאר די Web־טעקסט־פונקציעס. זיי מאכן נישט די אמתע מייקראפאן שטיל. דאס איז נאכנישט א פולע Audio/Video־קאנפערענץ.

## 3. וואס עקזיסטירט אין קאוד
Repo keygovhh-art/Govhh. Branch feature/campaign-team-connect-20261015; Draft PR #4. נייער סערווער־קאוד אין server/conferences.js, server/floor.js, server/floor-programs.js; מאביל־אויסשטעלן src/conference-view.js און src/event-view.js. Schema files db/004_conference_center.sql, db/005_virtual_campaign_floor.sql, db/006_floor_program_checkins.sql. די נייע טאבעלעס זענען אריינגעשטעלט בלויז אויף Neon Staging br-sparkling-term-b5dqbtco. RLS איז צוגעשטעלט.

## 4. וואס פעלט נאך פאר א פולן לייוו־רעליס
א אמתער WebRTC/מעדיע־סערווער פאר דרשות און לייוו־מייקראפאן, אפיציעלער וועב־שידור, Full Duplex Audio, רעדן־רשות וואס ווערט אינפארסירט אויפן מידיע־סערווער, רעקארדירונג מיט צושטימונג, גרויסע צוהערער־קאפאציטעט, אויטאמאטישער צייט־Scheduler, Push בשעת דער אפפ איז פארמאכט, Auth־טעסטן מיט אמתע באנוצער און די עכטע צוויי־Render־סערווערס, זיכערע צוויי־פראדוקט־פארבינדונג, Backup, Rollback און פריוואטקייט־טעסטן. א געהעריגער HTTPS אודיא־לינק קען שוין ווערן געשפילט ביי א פראגראם אויב מ'שטעלט אים צו; דער סיסטעם נעמט אבער נישט אליין אויף און שטרימט נישט דעם מייקראפאן.

A telecom hotline provider is NOT a prerequisite for the web workflow. Neither unlimited conference size nor verified bank transfers nor automatic phone calling are claimed. Go-live requires separate explicit authorization. Render AutoDeploy remains OFF.

## 5. נייע התקבצו־צוטריט־ליסטעס — געבויט אויפן אפגעזונדערטן ברענטש
דער אסיפה־מנהל קען דריי באזונדערע כללים אנצינדן אדער אויסלעשן פאר באשטעטיגטע מוסד־אקאונטס: פארשפארן דעם איינגאנג, דורכלאזן דעם ווארט־צימער, און אפשטעלן טעקסט־מעסעדזשעס. די סערווער־רשות ארבעט אויך קעגן דירעקטע API־פרואוון. דער צוטריט־קאוד קען נישט איבערגיין א פארשפארונג; בעל־הבית און מנהל קענען נישט ווערן פארשפארט דורך די ליסטעס. יעדע ענדערונג ווערט אודיטירט. דער פרישער Schema איז db/007_conference_policy_lists.sql און איז אויפגעשטעלט בלויז אין Neon Staging.

וויכטיג: די ליסטעס זענען געבונדן צו באשטעטיגטע וועב־אקאונטס, נישט בלויז איינגעשריבענע טעלעפאן־נומערן. די מייקראפאן־רשות איז נאכנישט פארבונדן צו אן עכטן וועב־מעדיע־סערווער. א GitHub CI Build איז נאך נישט קיין אמתער Render־לייוו־טעסט.


## 6. 2026-10-15 — optional Internet livestream video (new staged feature)
- OFF by default for both independent room types: fundraising hall and Hitkabtzu conference.
- A manager may supply an approved external HTTPS video source (MP4 or HLS .m3u8), and select either explicitly approved users or the eligible checked-in/admitted room audience.
- User must press the explicit "I want to watch live" button. Never load or autoplay a stream merely because a user joined. Users without bandwidth or interest use all other room features normally.
- The player remains docked outside the main app DOM, so refreshing campaign totals or updating tasks does not interrupt voluntary viewing; HLS.js downloads only after an explicit opt-in, saving mobile bandwidth.
- The app API checks current active organization and campaign membership, session admission/check-in, live room status, manager policy, and explicit video grant if necessary. Unadmitted/banned/no-check-in/disabled members cannot obtain the video URL via this API.
- Administrators can revoke individual viewing grants; active player closes on the next authenticated status check (~12 s while app visible). The permission list and changes are kept in PostgreSQL and audit.
- The external video source itself is NOT hosted, signed or transmitted by Campaign Center. Provider-side signed short-lived playback URLs/DRM are needed to prevent users from forwarding a copied URL. Video recording, camera broadcast, full-duplex WebRTC, provider load guarantees and large-audience testing remain unimplemented.
- Migration db/008_opt_in_video.sql applied ONLY to Neon staging branch br-sparkling-term-b5dqbtco. New routes server/video.js and media UI src/video-view.js. Two database-backed auth scenarios covered by disposable PostgreSQL CI.

## 7. MAX ↔ virtual fundraiser handoff
- MAX account-linked user can see the currently planned/open/paused Campaign Center fundraising room titles and current scheduled program, from a scoped authenticated server-to-server endpoint; no private donor/contact/call notes copied.
- MAX offers a browser link to the corresponding hall. Campaign Center validates its own Neon Auth membership and requires explicit event join/check-in. MAX authentication never automatically logs the user into Campaign Center.
- No background auto-refresh in MAX is promised; this is a read-only room summary with a separate link. All newer code stays in separate draft branches until a proper audited release.
