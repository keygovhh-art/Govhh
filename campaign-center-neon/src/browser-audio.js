// Explicit opt-in small-room microphone pilot, NOT a scalable conference bridge.
// One browser speaker makes direct WebRTC connections to a maximum of 7 others.
// STUN may fail on NAT/firewall without an independent TURN provider.
let active=null;
const stun={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};
const roomAudio=new Map();
function dock(){
 let el=document.getElementById('small-audio-dock');
 if(el)return el;
 el=document.createElement('section');
 el.id='small-audio-dock';el.className='small-audio-dock';
 el.innerHTML='<strong>התקבצו — קליינע בראוזער־אודיא־אסיפה</strong><p class="muted">פרואווייזער P2P מייקראפאן פאר ביז 8 מענטשן; נישט קיין גרויסער שידור אדער געראנטירטער פארבינדונג.</p>';
 const button=document.createElement('button');button.textContent='אויסלעשן מייקראפאן / פארלאזן אודיא';button.type='button';
 button.addEventListener('click',()=>void stopSmallAudio());
 el.append(button);document.body.append(el);return el;
}
function peer(key,session){
 let p=session.peers.get(key);if(p)return p;
 p=new RTCPeerConnection(stun);
 session.peers.set(key,p);
 if(session.stream)for(const track of session.stream.getTracks())p.addTrack(track,session.stream);
 p.onicecandidate=e=>{
  if(e.candidate&&active===session)void session.api('/rtc/'+session.roomId+'/signal',{
   method:'POST',body:JSON.stringify({kind:'ice',to:key,payload:{candidate:e.candidate.toJSON()}})
  }).catch(()=>{});
 };
 p.ontrack=e=>{
  const root=dock();let audio=roomAudio.get(key);
  if(!audio){
   audio=document.createElement('audio');audio.controls=true;audio.autoplay=true;
   audio.setAttribute('aria-label','דרשה־אודיא');root.append(audio);roomAudio.set(key,audio);
  }
  audio.srcObject=e.streams[0];
  audio.play().catch(()=>{}); // User may still press Play if Android blocks autoplay.
 };
 return p;
}
async function send(session,to,kind,payload){
 await session.api('/rtc/'+session.roomId+'/signal',{method:'POST',
  body:JSON.stringify({to,kind,payload})});
}
async function poll(session){
 if(active!==session||session.polling)return;
 session.polling=true;
 try{
  const view=await session.api('/rtc/'+session.roomId+'/state?after='+session.after);
  if(active!==session)return;
  const live=new Set(view.peers.filter(x=>x.subject!==session.subject).map(x=>x.subject));
  for(const [who,p] of session.peers){
   if(!live.has(who)){p.close();session.peers.delete(who);const a=roomAudio.get(who);if(a){a.remove();roomAudio.delete(who);}}
  }
  if(session.mode==='speaker'&&!view.canSpeak)throw Error('רעדן־רשות איז אוועקגענומען');
  if(session.mode==='speaker'){
   for(const who of view.peers.filter(x=>x.mode==='listener'&&x.subject!==session.subject).map(x=>x.subject)){
    if(session.peers.has(who))continue;
    const p=peer(who,session),offer=await p.createOffer();
    await p.setLocalDescription(offer);
    await send(session,who,'offer',{sdp:p.localDescription.toJSON()});
   }
  }
  for(const msg of view.signals){
   session.after=Math.max(session.after,Number(msg.id));
   if(!live.has(msg.sender_subject))continue;
   const who=msg.sender_subject;
   if(msg.kind==='bye'){
    const p=session.peers.get(who);p?.close();session.peers.delete(who);continue;
   }
   const p=peer(who,session);
   if(msg.kind==='offer'&&session.mode==='listener'){
    await p.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp));
    for(const candidate of session.waitingIce.get(who)||[])await p.addIceCandidate(new RTCIceCandidate(candidate)).catch(()=>{});
    session.waitingIce.delete(who);
    const answer=await p.createAnswer();await p.setLocalDescription(answer);
    await send(session,who,'answer',{sdp:p.localDescription.toJSON()});
   } else if(msg.kind==='answer'&&session.mode==='speaker'){
    await p.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp));
    for(const candidate of session.waitingIce.get(who)||[])await p.addIceCandidate(new RTCIceCandidate(candidate)).catch(()=>{});
    session.waitingIce.delete(who);
   }else if(msg.kind==='ice'&&msg.payload.candidate){
    if(!p.remoteDescription){
     const queue=session.waitingIce.get(who)||[];
     if(queue.length<40){queue.push(msg.payload.candidate);session.waitingIce.set(who,queue);}
    }else await p.addIceCandidate(new RTCIceCandidate(msg.payload.candidate)).catch(()=>{});
   }
  }
 }catch(e){
  session.error=e.message||'אודיא־פארבינדונג איז אפגעריסן';
  if(active===session)await stopSmallAudio();
  const root=dock();const p=document.createElement('p');p.textContent=session.error;root.append(p);
 }finally{session.polling=false;}
}
export function smallAudioState(){return active?{roomId:active.roomId,mode:active.mode}:null;}
export async function stopSmallAudio(){
 const s=active;active=null;
 if(s){
  clearInterval(s.timer);
  for(const p of s.peers.values())p.close();
  s.stream?.getTracks().forEach(t=>t.stop());
  // Best effort release without storing live audio itself.
  try{await s.api('/rtc/'+s.roomId+'/leave',{method:'POST',body:'{}'});}catch{}
 }
 for(const a of roomAudio.values()){a.pause();a.srcObject=null;a.remove();}
 roomAudio.clear();document.getElementById('small-audio-dock')?.remove();
}
export async function startSmallAudio({roomId,mode,subject,api}){
 if(!['listener','speaker'].includes(mode)||!roomId||!subject)throw Error('קלייב א ריכטיגע אסיפה');
 if(!window.RTCPeerConnection||!navigator.mediaDevices)throw Error('דער בראוזער שטיצט נישט WebRTC');
 await stopSmallAudio();
 let stream=null;
 if(mode==='speaker'){
  // No camera capture. Browser itself asks for microphone permission.
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
 }
 try{
  await api('/rtc/'+roomId+'/join',{method:'POST',body:JSON.stringify({mode})});
  const s={roomId,mode,subject,api,stream,after:0,peers:new Map(),waitingIce:new Map(),polling:false,timer:null};
  active=s;dock();await poll(s);
  if(active===s)s.timer=setInterval(()=>void poll(s),1800);
 }catch(e){stream?.getTracks().forEach(t=>t.stop());throw e;}
}
