// Non-destructive Neon Auth route check. No account creation and no credentials.
const base=process.env.NEON_AUTH_PROBE_URL;
if(!base)throw new Error('NEON_AUTH_PROBE_URL is required');
const url=new URL(base);
if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Invalid URL');
const checks=[
 {path:'/get-session',method:'GET'},
 {path:'/sign-in/email',method:'POST',body:'{}'},
 {path:'/sign-up/email',method:'POST',body:'{}'}
];
let failed=false;
for(const c of checks){
 const endpoint=base.replace(/\/+$/,'')+c.path;
 try{
  const res=await fetch(endpoint,{method:c.method,headers:{'content-type':'application/json','origin':'https://gavhah-campaign-center.onrender.com'},
   ...(c.body?{body:c.body}:{}),redirect:'error',signal:AbortSignal.timeout(12000)});
  console.log(c.method,c.path,'HTTP',res.status);
  if(res.status===404||res.status>=500)failed=true;
 }catch(e){console.log(c.path,'UNREACHABLE',e?.message||String(e));failed=true;}
}
if(failed)process.exitCode=1;

// Exercise the exact SDK that the UI uses (no real account and no state changes).
const {createAuthClient}=await import('@neondatabase/auth');
const auth=createAuthClient(base);
try {
 const result=await auth.signIn.email({email:'nonexistent-login-probe@invalid.example',password:'invalid-test-password'});
 const status=result.error?.status ?? 200;
 console.log('SDK signIn.email HTTP',status,'code',result.error?.code||'none');
 if(status===404||status>=500)failed=true;
} catch(e){console.log('SDK signIn.email ERROR',e?.message||String(e));failed=true;}
try {
 const result=await auth.signUp.email({email:'not-an-email',password:'x',name:''});
 const status=result.error?.status ?? 200;
 console.log('SDK signUp.email invalid-input HTTP',status,'code',result.error?.code||'none');
 if(status===404||status>=500)failed=true;
} catch(e){console.log('SDK signUp.email ERROR',e?.message||String(e));failed=true;}
if(failed)process.exitCode=1;
