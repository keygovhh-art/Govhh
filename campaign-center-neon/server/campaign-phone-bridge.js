import {Router} from 'express';
import {createHmac,timingSafeEqual,randomInt} from 'node:crypto';

// Campaign Center phone identity never comes from caller ID or Gavhah accounts.
// A separate CC website account supplies a time-limited, single-use code.
const sections={
 '1':{label:'My campaigns',actions:{'1':'My campaigns','2':'Campaign goals','3':'Campaign status'}},
 '2':{label:'Tasks and follow ups',actions:{'1':'Assigned work','2':'Pending follow ups','3':'Recent work'}},
 '3':{label:'Contacts and calling',actions:{'1':'Contacts overview','2':'Do Not Call count','3':'My logged call results'}},
 '4':{label:'Finance',actions:{'1':'Campaign pledges','2':'Recorded receipts','3':'Verified accounting overview'}},
 '5':{label:'Team',actions:{'1':'My teams','2':'Campaign members','3':'My progress'}},
 '6':{label:'Virtual fundraising hall',actions:{'1':'Hall program','2':'Hall status','3':'Help desk status'}},
 '7':{label:'Conferences',actions:{'1':'Conference list','2':'Conference schedule','3':'My conference access'}},
 '8':{label:'Administration',actions:{'1':'My activity','2':'My organization overview','3':'Approvals status'}},
 '9':{label:'Plans and connections',actions:{'1':'Available plans','2':'My plan','3':'My MAX connection'}}
};
export {sections as campaignPhoneSections};
const secret=()=>{const s=process.env.CC_GAVHAH_BRIDGE_SECRET||'';return s.length>=40?s:null;};
const hmac=(s,x)=>createHmac('sha256',s).update(x).digest('hex');
const safe=(input,max=155)=>{
 const str=String(input??'').replace(/<[^>]+>/g,' ').replace(/https?:\/\/\S+/gi,' ');
 if(/[\u0590-\u05ff\u0600-\u06ff]/u.test(str))return 'title needs an approved Yiddish voice recording';
 return str.replace(/[&=,#;.\r\n]/g,' ').replace(/[^ -~]/g,' ')
  .replace(/\s+/g,' ').trim().slice(0,max);
};
const nav=' Press 1 for next, 2 to restart, 8 for previous, or zero for the main menu.';
const read=(res,text,step,mode='normal')=>{
 const name=(mode==='link'?'ln':'iv')+step;
 const length=mode==='link'?8:mode==='root'?2:1;
 const opts=[name,'no',length,mode==='link'?8:1,'10','No','no'];
 res.status(200).type('text/plain; charset=utf-8').set('Cache-Control','no-store')
  .send('read=t-'+safe(text,430)+'='+opts.join(','));
};
function home(){
 return 'Campaign Center. '+Object.entries(sections)
  .map(([digit,s])=>'Press '+digit+' for '+s.label+'.').join(' ')+
  ' Press 88 to securely link your Campaign Center website account. Press zero to repeat.';
}
function sectionPrompt(path){
 const x=sections[path];if(!x)return home();
 return x.label+'. '+Object.entries(x.actions)
  .map(([digit,label])=>'Press '+digit+' for '+label+'.').join(' ')+
  ' Press zero for the main menu.';
}
const fail=(res,status)=>res.status(status).type('text/plain').set('Cache-Control','no-store').send('Access denied');
const accountQuery=async(db,subject)=>{
 const r=await db.query("SELECT organization_id,role FROM cc_memberships WHERE subject=$1 AND membership_status='active' ORDER BY joined_at DESC LIMIT 1",[subject]);
 return r.rows[0]||null;
};
async function summary(db,path,subject,page){
 if(path==='91')return 'Campaign Center provides six plan tiers. The available plan information is on the Campaign Center website. No paid plan is activated by this hotline.'+nav;
 const active=subject?await accountQuery(db,subject):null;
 if(!active)return 'Private Campaign Center records require your own account. Open Campaign Center and create a phone code. At the main menu press 88 and enter the code.';
 const org=active.organization_id,role=active.role;
 const manager=['owner','manager','finance','auditor'].includes(role);
 const finance=['owner','manager','finance','auditor'].includes(role);
 const q=async(sql,params)=> (await db.query(sql,params)).rows[0]||{};
 const current=Number.isSafeInteger(page)?Math.min(Math.max(page,0),25):0;
 const data={};
 const selectedCampaign=async()=>{
  const r=await q("SELECT id,title,goal_amount,status,currency FROM cc_campaigns c "+
    "WHERE c.organization_id=$1 AND ($2::boolean OR EXISTS "+
    "(SELECT 1 FROM cc_campaign_members cm WHERE cm.campaign_id=c.id AND cm.subject=$3)) "+
    "ORDER BY c.created_at DESC,c.id DESC LIMIT 1 OFFSET $4",[org,manager,subject,current]);
  return r?.id?r:null;
 };
 if(['11','12','13'].includes(path)){
  const c=await selectedCampaign();
  if(!c)return 'No campaign is assigned to your verified account.'+nav;
  if(path==='11')return 'Campaign '+(current+1)+'. '+safe(c.title,80)+'. '+safe(c.status,40)+'.'+nav;
  if(path==='13')return 'Campaign '+safe(c.title,70)+'. Current status '+safe(c.status,55)+'.'+nav;
  const goals=await q("SELECT count(*)::int AS total,coalesce(sum(target_value),0)::text AS target "+
   "FROM cc_goals WHERE campaign_id=$1",[c.id]);
  return 'Campaign '+safe(c.title,70)+'. Goal '+Number(c.goal_amount||0)+' '+safe(c.currency||'USD',10)+
   '. '+goals.total+' tracked goals.'+nav;
 }
 if(['21','22','23'].includes(path)){
  const filters=path==='22'?" AND kind='followup'":path==='21'?" AND status NOT IN ('done','cancelled')":'';
  const r=await q("SELECT a.title,a.status,a.kind FROM cc_assignments a JOIN cc_campaigns c ON c.id=a.campaign_id "+
   "JOIN cc_memberships m ON m.organization_id=c.organization_id AND m.subject=$1 AND m.membership_status='active' "+
   "WHERE a.assignee_subject=$1 AND c.organization_id=$2"+filters+
   " ORDER BY a.created_at DESC,a.id DESC LIMIT 1 OFFSET $3",[subject,org,current]);
  return r.title?'Work '+(current+1)+'. '+safe(r.title,100)+'. Status '+safe(r.status,30)+'.'+nav:
   'No matching assigned work was found.'+nav;
 }
 if(['31','32','33'].includes(path)){
  if(path==='33'){
   const r=await q("SELECT outcome FROM cc_call_events WHERE organization_id=$1 AND member_subject=$2 "+
    "ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $3",[org,subject,current]);
   return r.outcome?'Your recorded call result '+safe(r.outcome,70)+'. No call was placed by this menu.'+nav:
    'No recorded call results. This menu never starts outgoing calls.'+nav;
  }
  if(path==='31'){
   const r=await q("SELECT count(*)::int AS count FROM cc_contacts WHERE organization_id=$1 "+
    "AND (created_by=$2 OR ($3::boolean AND privacy<>'private'))",[org,subject,manager]);
   return 'Accessible donor contact records '+r.count+'. Telephone numbers and private notes are not read aloud.'+nav;
  }
  const r=await q("SELECT count(*)::int AS count FROM cc_contacts WHERE organization_id=$1 AND do_not_call=true "+
   "AND (created_by=$2 OR ($3::boolean AND privacy<>'private'))",[org,subject,manager]);
  return 'Contacts marked Do Not Call: '+r.count+'. Outbound dialing is not started.'+nav;
 }
 if(['41','42','43'].includes(path)){
  if(!finance)return 'Finance reports require verified finance or management permission.';
  const kind=path==='41'?'pledge':path==='42'?'receipt':null;
  const r=await q("SELECT count(*)::int AS count,coalesce(sum(amount),0)::text AS total "+
   "FROM cc_finance_events WHERE organization_id=$1 AND ($2::text IS NULL OR event_kind=$2)",[org,kind]);
  return (kind?kind+' entries':'Finance ledger entries')+' '+r.count+'. Recorded total '+Number(r.total||0)+
   '. This is accounting data, not guaranteed bank settlement. No card payment is taken by phone.'+nav;
 }
 if(['51','52','53'].includes(path)){
  const r=await q("SELECT count(*)::int AS count FROM cc_campaign_members "+
   "WHERE organization_id=$1 AND ($2::boolean OR subject=$3)",[org,manager,subject]);
  const mine=await q("SELECT count(*)::int AS count FROM cc_assignments "+
   "WHERE organization_id=$1 AND assignee_subject=$2 AND status='done'",[org,subject]);
  return 'Campaign team memberships in your permitted view '+r.count+
   '. Your completed tasks '+mine.count+'.'+nav;
 }
 if(['61','62','63'].includes(path)){
  if(path==='61'){
   const r=await q("SELECT title,status FROM cc_floor_programs WHERE organization_id=$1 "+
    "ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",[org,current]);
   return r.title?'Fundraising hall program '+safe(r.title,90)+'. Status '+safe(r.status,40)+'.'+nav:
    'No scheduled hall programs in this organization.'+nav;
  }
  const table=path==='62'?'cc_live_rooms':'cc_floor_help_requests';
  const r=await q("SELECT count(*)::int AS count FROM "+table+" WHERE organization_id=$1",[org]);
  return (path==='62'?'Virtual hall room records: ':'Help desk requests: ')+r.count+
   '. This is a record status; live telephone audio participation is not activated.'+nav;
 }
 if(['71','72','73'].includes(path)){
  const r=await q("SELECT title,room_status,scheduled_at,access_mode FROM cc_conference_rooms "+
   "WHERE organization_id=$1 AND (access_mode='public' OR created_by=$2 OR "+
   "EXISTS(SELECT 1 FROM cc_conference_participants p WHERE p.room_id=cc_conference_rooms.id AND p.subject=$2 AND p.admitted=true AND p.banned=false)) "+
   "ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $3",[org,subject,current]);
  return r.title?'Available conference '+safe(r.title,95)+'. Status '+safe(r.room_status,30)+
   '. Telephone joining needs an active conference-audio provider and is not yet available.'+nav:
   'No conference is available to your linked account.'+nav;
 }
 if(['81','82','83'].includes(path)){
  if(path==='81'){
   const r=await q("SELECT event_type FROM cc_activity_events WHERE organization_id=$1 AND actor_subject=$2 "+
    "ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $3",[org,subject,current]);
   return r.event_type?'Your activity '+safe(r.event_type,95)+'.'+nav:'No recent activity on your account.'+nav;
  }
  if(path==='82')return 'Your Campaign Center organization is connected. Your role is '+safe(role,30)+'.'+nav;
  if(!manager)return 'Pending management approvals require organization management permission.';
  const r=await q("SELECT count(*)::int AS count FROM cc_gabbai_approval_requests "+
   "WHERE organization_id=$1 AND status='pending'",[org]);
  return 'Your organization has '+r.count+' pending approval requests. Sensitive approvals require secure administrator controls.'+nav;
 }
 if(path==='92'){
  const r=await q("SELECT plan_code,status FROM cc_plan_entitlements WHERE organization_id=$1",[org]);
  return r.plan_code?'Organization plan '+safe(r.plan_code,40)+' status '+safe(r.status,25)+'.'+nav:
   'No paid plan entitlement currently recorded.'+nav;
 }
 if(path==='93'){
  const r=await q("SELECT count(*)::int AS count FROM cc_external_account_links "+
   "WHERE subject=$1 AND revoked_at IS NULL AND external_system='gavhah'",[subject]);
  return r.count?'A separately authorized Gavhah MAX account link exists.':'No Gavhah MAX account link is currently active.';
 }
 return 'This feature does not have a secure telephone action yet.';
}
export function campaignPairingRouter({pool}){
 const r=Router();
 r.post('/pairing',async(req,res,next)=>{
  try{
   const s=secret();if(!s)return res.status(503).json({error:'Telephone pairing not configured'});
   const user=String(req.userId||'');if(!user)return res.status(401).json({error:'Sign in first'});
   if(!await accountQuery(pool,user))return res.status(403).json({error:'Active Campaign Center membership required'});
   const recent=await pool.query("SELECT count(*)::int AS n FROM cc_phone_pairing_codes WHERE subject=$1 AND created_at>now()-interval '15 minutes'",[user]);
   if((recent.rows[0]?.n||0)>=5)return res.status(429).json({error:'Too many pairing codes. Try later.'});
   const code=String(randomInt(10000000,100000000));
   const hash=hmac(s,'cc-pair:'+code);
   const db=await pool.connect();
   try{await db.query('BEGIN');
    await db.query("UPDATE cc_phone_pairing_codes SET used_at=now() WHERE subject=$1 AND used_at IS NULL",[user]);
    await db.query("INSERT INTO cc_phone_pairing_codes(code_hash,subject,expires_at) VALUES($1,$2,now()+interval '5 minutes')",[hash,user]);
    await db.query('COMMIT');
   }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
   res.set('Cache-Control','no-store').json({code,expiresInSeconds:300,
    instructions:'Dial existing Gavhah phone line, enter extension 4444, press 88, enter this eight-digit code.'});
  }catch(e){next(e);}
 });
 return r;
}
export function campaignBridgeRouter({pool}){
 const r=Router();
 r.post('/',async(req,res,next)=>{
  try{
   const s=secret();
   if(!s)return fail(res,503);
   const {call,key,value,stamp}=req.body||{};
   if(typeof call!=='string'||!/^[A-Za-z0-9_.:-]{8,160}$/.test(call)||
      typeof key!=='string'||key!==''&&!/^(?:iv|ln)\d{1,5}$/.test(key)||
      typeof value!=='string'||!/^\d{0,8}$/.test(value)||
      !Number.isSafeInteger(stamp)||Math.abs(Date.now()-stamp)>45000)return fail(res,403);
   const signature=String(req.get('x-cc-bridge-signature')||'');
   if(!/^[a-f0-9]{64}$/.test(signature))return fail(res,403);
   const expected=hmac(s,[stamp,call,key,value].join('|'));
   if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(signature,'hex')))return fail(res,403);
   const callHash=hmac(s,'cc-session:'+call);
   const db=await pool.connect();
   try{
    await db.query('BEGIN');
    await db.query('INSERT INTO cc_phone_bridge_states(call_hash) VALUES($1) ON CONFLICT DO NOTHING',[callHash]);
    const state=(await db.query(
      'SELECT step,path,page,subject,linked_until,failures FROM cc_phone_bridge_states WHERE call_hash=$1 FOR UPDATE',[callHash])).rows[0];
    let path=state.path||'',page=state.page||0,step=state.step||0,subject=state.subject,failures=state.failures||0;
    if(!Number.isInteger(step)||step>9000){step=0;path='';page=0;subject=null;}
    if(failures>=5){path='';subject=null;}
    if(!state.linked_until||new Date(state.linked_until).getTime()<=Date.now())subject=null;
    const expectedKey=(path==='P'?'ln':'iv')+step;
    if(key && key===expectedKey){
     if(path==='P'){
      if(failures>=5){path='';subject=null;}
      else if(/^\d{8}$/.test(value)){
       const digest=hmac(s,'cc-pair:'+value);
       const result=await db.query("UPDATE cc_phone_pairing_codes SET used_at=now() "+
        "WHERE code_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING subject",[digest]);
       if(result.rowCount&&await accountQuery(db,result.rows[0].subject)){
        subject=result.rows[0].subject;failures=0;path='';page=0;
       }else{failures++;path='P';}
      }else failures++;
     }else if(value==='0'){path='';page=0;}
     else if(!path && value==='88'){path='P';page=0;}
     else if(!path && sections[value]){path=value;page=0;}
     else if(path.length===1 && sections[path]?.actions[value]){path+=value;page=0;}
     else if(path.length===2 && value==='1')page=Math.min(25,page+1);
     else if(path.length===2 && value==='2')page=0;
     else if(path.length===2 && value==='8')page=Math.max(0,page-1);
     step++;
    }
    let text,mode='normal';
    if(path==='P'){mode='link';text=failures>=5
      ?'Too many invalid codes. Hang up and create a new website code.'
      :'Enter the eight digit Campaign Center account pairing code from your website. The code expires after five minutes.';}
    else if(!path){text=home();mode='root';}
    else if(path.length===1){text=sectionPrompt(path);}
    else text=await summary(db,path,subject,page);
    await db.query("UPDATE cc_phone_bridge_states SET path=$1,page=$2,step=$3,subject=$4,"+
      "linked_until=CASE WHEN $4::text IS NOT NULL THEN now()+interval '30 minutes' ELSE NULL END,"+
      "failures=$5,updated_at=now() WHERE call_hash=$6",
      [path,page,step,subject,failures,callHash]);
    await db.query('COMMIT');
    read(res,text,step,mode);
   }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
  }catch(e){next(e);}
 });
 return r;
}
