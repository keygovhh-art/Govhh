import { videoPanel } from './video-view.js';
import {smallAudioState} from './browser-audio.js';
const types={assembly:'אסיפה',inspiration:'דברי חיזוק',technical:'טעכנישע אסיפה',advice:'עצות',other:'אנדערע'};
const status={planned:'אין צוגרייטונג',open:'עפן',paused:'אויפגעהאלטן',ended:'פארענדיגט'};
const speaking={listeners:'צוהערער בלבד',moderated:'מנהל געבט רשות',open:'אפענע דיסקוסיע'};
const phase={lecture:'דרשה',qna:'שאלות ותשובות',discussion:'אויסשמועס'};
const niceTime=t=>t?new Date(t).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
export function conferenceView(state,esc){
 const elevated=['owner','manager'].includes(state.orgs.find(o=>o.id===state.orgId)?.role);
 const rooms=state.conferences||[],snap=state.conferenceSnapshot;
 const current=snap?.conference?.id===state.conferenceId?snap.conference:rooms.find(c=>c.id===state.conferenceId);
 const creation=elevated?'<section class="card"><h3>א נייע התקבצו־אסיפה</h3>'+
  '<p class="muted">דאס איז א באזונדערער צענטער פאר אסיפות און חיזוק — נישט דער קאמפיין־רוף־זאל.</p>'+
  '<form data-form="conference-new" class="stack"><label>נאמען<input required name="title" maxlength="180" placeholder="אסיפת התעוררות / מנהלים"></label>'+
  '<label>סארט<select name="category"><option value="assembly">אסיפה</option><option value="inspiration">חיזוק</option><option value="technical">טעכנישע פרטים</option><option value="advice">טרעפן עצות</option><option value="other">אנדערע</option></select></label>'+
  '<label>ווער מעג אריינקומען?<select name="accessMode"><option value="members">מיטגלידער פונעם מוסד</option><option value="code">מיט איין־מאליג געוויזענעם צוטריט־קאוד</option></select></label>'+
  '<label>רעדן־רעכטן<select name="speakingMode"><option value="moderated">מנהל געבט רשות</option><option value="listeners">בלויז צוהערן</option><option value="open">אפענע דיסקוסיע</option></select></label>'+
  '<label>וואס וויל מען אויסשמועסן?<textarea name="agenda" rows="3" maxlength="1500"></textarea></label>'+
  '<label class="confirm-check"><input type="checkbox" name="campaignOnly"> בלויז פארן איצטיגן קאמפיין</label>'+
  '<button>צוגרייטן אסיפה</button></form>'+
  (state.conferenceCode?'<p>דעם צוטריט־קאוד פארטייל נאר מיט די ערלויבטע מענטשן; ער ווערט נאר דא געוויזן.</p><input readonly dir="ltr" value="'+esc(state.conferenceCode)+'">':'')+
  '</section>':'';
 const list=rooms.map(r=>'<article class="item"><div><strong>'+esc(r.title)+'</strong><small>'+esc(types[r.category]||r.category)+
 ' · '+esc(status[r.room_status]||r.room_status)+' · לעצטנס צוזאמען: '+esc(r.online||0)+'</small></div>'+
 '<button data-action="conference-select" data-id="'+esc(r.id)+'">אויפמאכן אסיפה</button></article>').join('');
 const selected=!current?'':(()=>{
  const m=snap?.isModerator===true,me=snap?.you;
  const joined=Boolean(me?.joined),admitted=Boolean(me?.admitted),online=snap?.online||[];
  const active=current.room_status==='open';
  const people=online.map(p=>'<article class="item"><div><strong>'+esc(p.subject)+'</strong>'+
    '<small>'+esc(p.hand_raised?'הייבט די האנט':'')+' · '+esc(p.speaking_granted?'האט רעדן־רשות':'צוהערער')+
    (p.moderator_muted?' · געשטילט':'')+'</small></div>'+
    (m&&p.subject!==state.subject?'<div class="actions">'+(!p.admitted?'<button data-action="conference-admit" data-subject="'+esc(p.subject)+'">אריינלאזן</button>':'')+
     (p.admitted&&!p.speaking_granted?'<button data-action="conference-grant" data-subject="'+esc(p.subject)+'">געבן רעדן־רשות</button>':'')+
     (p.speaking_granted?'<button data-action="conference-revoke" data-subject="'+esc(p.subject)+'">אוועקנעמען רשות</button>':'')+
     '<button data-action="'+(p.moderator_muted?'conference-unmute':'conference-mute')+'" data-subject="'+esc(p.subject)+'">'+(p.moderator_muted?'אויפמאכן':'שטיל מאכן')+'</button>'+
     '<button data-action="conference-remove" data-subject="'+esc(p.subject)+'">ארויסנעמען</button>'+
     '<button data-action="conference-ban" data-subject="'+esc(p.subject)+'">פארשפארן</button></div>':'')+
    '</article>').join('');
  const notes=(snap?.messages||[]).map(msg=>'<article class="item"><div><strong>'+esc(msg.authored_by)+'</strong>'+
   '<small>'+esc(msg.message_kind)+' · '+esc(niceTime(msg.created_at))+'</small><p>'+esc(msg.body)+'</p></div></article>').join('');
  const config=m?'<form data-form="conference-settings" class="stack">'+
   '<label>אסיפה־מצב<select name="roomStatus">'+[['open','עפענען / צוריק אנהייבן'],['paused','פאוז'],['ended','פארענדיקן']].map(([v,t])=>
    '<option value="'+v+'" '+(current.room_status===v?'selected':'')+'>'+t+'</option>').join('')+'</select></label>'+
   '<label>וואס געשעט יעצט?<select name="phase">'+Object.entries(phase).map(([v,t])=>'<option value="'+v+'" '+(current.phase===v?'selected':'')+'>'+t+'</option>').join('')+'</select></label>'+
   '<label>ווער מעג שרייבן/רעדן?<select name="speakingMode">'+Object.entries(speaking).map(([v,t])=>
    '<option value="'+v+'" '+(current.speaking_mode===v?'selected':'')+'>'+t+'</option>').join('')+'</select></label>'+
   '<label>באשטעטיגטער HTTPS־אודיא־שידור אדער רעקארדירונג<input name="mediaUrl" type="url" placeholder="https://...mp3" value="'+esc(current.media_url||'')+'"></label>'+ 
   '<button '+(current.room_status==='ended'?'disabled':'')+'>אפהיטן מנהל־איינשטעלונגען</button></form>':'';
  const policyList=(state.conferencePolicies||[]).filter(r=>r.enabled).map(r=>
    '<article class="item"><div><strong>'+esc(r.subject)+'</strong><small>'+
    esc(({deny_entry:'פארשפארט פון אסיפה',skip_waiting:'מעג אריין אן ווארט־צימער',deny_messages:'נישט ערלויבט שרייבן'})[r.rule])+
    '</small></div></article>').join('');
  const policies=m?'<section class="card"><h3>באזונדערע צוטריט־און־רעדן־ליסטעס</h3>'+
   '<p class="muted">דו קאנטראלירסט יעדער ליסטע באזונדער, אפילו אינמיטן אסיפה. נאר באשטעטיגטע מוסד־מיטגלידער קענען ווערן צוגעלייגט; א מוסד־מנהל קען נישט ווערן פארשפארט דורך דעם אויסשטעל.</p>'+
   '<form data-form="conference-policy" class="stack">'+
     '<label>מיטגליד־קאוד<input name="subject" required maxlength="128" placeholder="דער באנוצער־קאוד פונעם מיטגליד"></label>'+
     '<label>וועלכע ליסטע?<select name="rule">'+
       '<option value="deny_entry">נישט אריינלאזן אין אסיפה</option>'+
       '<option value="skip_waiting">דורכלאזן ווארט־צימער</option>'+
       '<option value="deny_messages">נישט ערלויבן מעסעדזשעס</option></select></label>'+
     '<label>איינשטעלונג<select name="enabled"><option value="true">אנצינדן</option><option value="false">אויסלעשן</option></select></label>'+
     '<button>אפהיטן דעם כלל</button></form>'+
     (policyList||'<p class="muted">קיין אקטיווע באזונדערע כללים.</p>')+
   '</section>':'';
  const smallAudio=smallAudioState();
  const listeningNow=smallAudio?.roomId===current.id;
  const maySpeak=!me?.moderatorMuted&&(m||current.speaking_mode==='open'||me?.speakingGranted);
  const p2p=(state.experimentalAudioEnabled&&(m||admitted)&&joined&&active)?
   '<section class="card"><h3>קליינע לייוו־מייקראפאן־אסיפה (פרואווייזער)</h3>'+
   '<p class="muted">ביז 8 מענטשן און העכסטנס 2 רעדנער. דירעקטע WebRTC־אודיא אן א האטליין־פראוויידער; אויף געוויסע אינטערנעט־נעצן קען א TURN־פארבינדונג נאך אויספעלן. מייקראפאן ווערט נאר געעפנט מיט דיין בפירושן באשטעטיגונג.</p>'+
   (listeningNow?'<p>דו ביסט יעצט אינעם קליינעם אודיא־צימער ('+esc(smallAudio.mode)+')</p>'+
      '<button type="button" data-action="rtc-stop">אויסלעשן מייקראפאן / פארלאזן אודיא</button>':
      '<div class="actions"><button type="button" data-action="rtc-listen">איך וויל הערן</button>'+
        (maySpeak?'<button type="button" data-action="rtc-speak">איך וויל רעדן — מייקראפאן־רשות</button>':'')+
       '</div>')+'</section>':'';
  const join=!joined&&active?'<form data-form="conference-join" class="inline">'+
   (current.access_mode==='code'&&!m?'<input name="accessCode" dir="ltr" placeholder="צוטריט־קאוד" maxlength="24" required>':'')+
   '<button class="primary">אריינגיין / ווארטן אויף באשטעטיגונג</button></form>':'';
  const messages=active&&(admitted||m)?'<section class="card"><h3>שאלות, עצות און אנווייזונגען</h3>'+
   '<p class="muted">די רעדן־רעכטן אין דער וועב־ווערסיע קאנטראלירן די טעקסטן און שאלות. אמתע מייקראפאן־אודיא דארף נאך א באשטעטיגטן וועב־אודיא־שידור.</p>'+
   '<form data-form="conference-message" class="stack">'+
    '<label>סארט<select name="kind"><option value="discussion">רעדן / אויסשמועסן</option><option value="question">פרעגן א שאלה</option>'+
    (m?'<option value="announcement">אנווייזונג פאר אלע</option>':'')+'</select></label>'+
    '<textarea name="body" required maxlength="1200" rows="3" placeholder="שרייב א שאלה, עצה אדער מעלדונג"></textarea>'+
    '<button>שיקן</button></form>'+notes+'</section>':'';
  return '<section class="card"><h2>'+esc(current.title)+'</h2>'+
    '<p>'+esc(types[current.category])+' · '+esc(status[current.room_status])+' · '+esc(phase[current.phase])+'</p>'+
    '<p class="muted">'+esc(current.agenda||'')+'</p>'+
    ((m||admitted)&&current.media_url?'<audio controls preload="none" src="'+esc(current.media_url)+'" class="event-audio"></audio>':'')+
    '<p>צוהערער: '+esc(online.filter(p=>p.admitted).length)+' | אויפגעהויבענע הענט: '+esc(online.filter(p=>p.hand_raised).length)+'</p>'+
    '<button data-action="conference-refresh">דערפרישן אסיפה</button>'+
    (m?config:'')+join+
    (joined&&!admitted?'<p class="muted">דו ביסט אינעם ווארט־צימער. ווארט ביז דער מנהל לאזט דיך אריין.</p>':'')+
    (joined&&active?'<div class="actions"><button data-action="conference-hand">'+(me?.handRaised?'אראפנעמען די האנט':'אויפהייבן די האנט')+'</button><button data-action="conference-leave">ארויסגיין</button></div>':'')+
    '</section>'+
    ((m||admitted)?'<section class="card"><h3>עסקנים און רעדן־רעכטן</h3>'+people+'</section>':'')+
    messages+p2p+policies+videoPanel(state.videoStatus.conference,'conference',current.id,state.videoGrants.conference,esc,state.conferenceSnapshot?.online||[]);
 })();
 return '<section class="card"><h2>התקבצו — אסיפות און חיזוק</h2>'+
 '<p class="muted">באזונדער פון דעם קאמפיין־זאל. אסיפות, דברי חיזוק, שאלות־ותשובות, עצות און טעכנישע דיסקוסיעס מיט מנהל־קאנטראל.</p>'+
 '<div class="inline"><button data-action="conference-refresh">דערפרישן</button></div>'+
 (list||'<p>נאכנישטא קיין אסיפות.</p>')+'</section>'+creation+selected;
}
