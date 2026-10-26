import { Router, urlencoded } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';

// Public callback for Campaign Center's OWN Yemot number. No Gavhah dependencies.
// Incoming callers are UNAUTHENTICATED: do not expose contacts, private campaigns,
// donation records or management actions merely from caller-ID.
const menu={
 '1':{label:'Campaigns',children:{'1':'Campaign list','2':'Campaign goals','3':'Campaign status','4':'Campaign settings'}},
 '2':{label:'Tasks and follow ups',children:{'1':'My tasks','2':'Follow ups','3':'Call backs','4':'Activity history'}},
 '3':{label:'Contacts and calling',children:{'1':'Donor contacts','2':'Call queues','3':'My call results','4':'Do not call'}},
 '4':{label:'Donations and finances',children:{'1':'Pledges','2':'Manual receipts','3':'Accounting reports'}},
 '5':{label:'Teams and members',children:{'1':'Team members','2':'Departments','3':'Invitations','4':'Member progress'}},
 '6':{label:'Virtual campaign hall',children:{'1':'Program','2':'Attendance','3':'Team help'}},
 '7':{label:'Conferences',children:{'1':'Conference directory','2':'Join by code','3':'Speaker management'}},
 '8':{label:'Reports and management',children:{'1':'Manager overview','2':'Reports','3':'Admin controls'}},
 '9':{label:'Plans and information',children:{'1':'Available plans','2':'MAX connection','3':'Contact management'}}
};
const speak=(v)=>String(v).replace(/[^ -~]/g,' ').replace(/[&=,#;.]/g,' ').replace(/\s+/g,' ').trim().slice(0,450);
const prompt=(path)=>{
 if(!path)return 'Welcome to Campaign Center. '+Object.entries(menu).map(([n,v])=>'Press '+n+' for '+v.label+'.').join(' ')+' Press zero to hear this menu again.';
 const parent=menu[path[0]];
 if(!parent)return prompt('');
 if(path.length===1)return parent.label+'. '+Object.entries(parent.children).map(([n,v])=>'Press '+n+' for '+v+'.').join(' ')+' Press zero for the main menu.';
 const label=parent.children[path[1]];
 if(!label)return prompt(path[0]);
 return label+'. Private information and actions require your verified Campaign Center account. Sign in to the Campaign Center website to use this feature securely. Press zero for the main menu.';
};
const reply=(res,step,text)=>{
 const name='iv'+step;
 res.type('text/plain; charset=utf-8').set('Cache-Control','no-store')
 .send('read=t-'+speak(text)+'='+[name,'no','1','1','8','No','no'].join(','));
};
export default function campaignIvrRouter({pool}){
 const router=Router();
 router.use(urlencoded({extended:false,limit:'4kb'}));
 const run=async(req,res)=>{
  const supplied=String(req.body?.entryKey??req.query?.entryKey??'');
  if(!/^[a-f0-9]{64}$/.test(supplied))return res.status(403).type('text/plain').send('Access denied');
  const row=(await pool.query("SELECT callback_hash,install_state FROM public.cc_platform_yemot_line WHERE id='campaign-center'")).rows[0];
  const hash=createHash('sha256').update(supplied).digest('hex');
  if(!row?.callback_hash||!['pending','live'].includes(row.install_state)||
    !timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(row.callback_hash,'hex')))
    return res.status(403).type('text/plain').send('Access denied');
  const call=String(req.body?.ApiCallId??req.query?.ApiCallId??'');
  if(!/^[A-Za-z0-9_.:-]{8,160}$/.test(call)){
   reply(res,0,'Call identifier missing. Please call back.');return;
  }
  // Unlink telephone caller identity from the web account and keep only an HMAC-like
  // digest derived from the unexposed per-install callback secret.
  const callHash=createHash('sha256').update(supplied+':'+call).digest('hex');
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   await db.query('INSERT INTO public.cc_platform_yemot_call_states(call_hash) VALUES($1) ON CONFLICT DO NOTHING',[callHash]);
   const result=await db.query('SELECT path,step FROM public.cc_platform_yemot_call_states WHERE call_hash=$1 FOR UPDATE',[callHash]);
   const current=result.rows[0]||{path:'',step:0};
   const step=(Number.isInteger(current.step)&&current.step>=0&&current.step<10000)?current.step:0;
   let path=/^[1-9]{0,2}$/.test(current.path)?current.path:'';
   const value=req.body?.['iv'+step]??req.query?.['iv'+step];
   if(value!==undefined){
    const digit=String(value).trim();
    if(digit==='0')path='';
    else if(/^[1-9]$/.test(digit)){
     if(!path && menu[digit])path=digit;
     else if(path.length===1&&menu[path]?.children[digit])path+=digit;
    }
   }
   const nextStep=value!==undefined?step+1:step;
   await db.query('UPDATE public.cc_platform_yemot_call_states SET path=$1,step=$2,updated_at=now() WHERE call_hash=$3',[path,nextStep,callHash]);
   await db.query('COMMIT');
   reply(res,nextStep,prompt(path));
  }catch(e){
   await db.query('ROLLBACK').catch(()=>{});throw e;
  }finally{db.release();}
 };
 router.all('/',(req,res,next)=>{run(req,res).catch(next);});
 return router;
}
