// The media element lives OUTSIDE the main app root so a chat message,
// task update or 7-second dashboard refresh cannot restart a playing video.
// It is created ONLY on the participant's explicit "watch" button.
let player=null,hls=null,dock=null,watchContext=null;
function ensureDock(){
 if(dock)return dock;
 dock=document.createElement('section');
 dock.id='optional-video-dock';
 dock.className='optional-video-dock';
 dock.hidden=true;
 dock.setAttribute('aria-label','פרייוויליגער לייוו־ווידעא־שידור');
 const head=document.createElement('div');head.className='optional-video-head';
 const label=document.createElement('strong');label.textContent='לייוו־ווידעא (פרייוויליג)';
 const btn=document.createElement('button');btn.type='button';btn.textContent='פארמאכן ווידעא';
 btn.addEventListener('click',()=>stopOptionalVideo());
 head.append(label,btn);
 player=document.createElement('video');
 player.controls=true;player.playsInline=true;player.autoplay=false;
 player.preload='none';player.setAttribute('aria-label','לייוו־שידור');
 const hint=document.createElement('p');hint.className='muted';
 hint.textContent='דו קענסט ווייטער ארבעטן אן ווידעא. דער שידור קומט פון אן אויסערליכן HTTPS־קוואל.';
 dock.append(head,player,hint);document.body.append(dock);
 return dock;
}
export function stopOptionalVideo(){
 if(hls){hls.destroy();hls=null;}
 if(player){player.pause();player.removeAttribute('src');player.load();}
 if(dock)dock.hidden=true;
 watchContext=null;
}
export function playingOptionalVideo(){
 return Boolean(dock&&!dock.hidden&&watchContext);
}
export function watchedContext(){return watchContext;}
export async function watchOptionalVideo(url,kind,roomId){
 if(typeof url!=='string'||!url.startsWith('https://'))throw Error('א באשטעטיגטער HTTPS־שידור פעלט');
 ensureDock();stopOptionalVideo();
 dock.hidden=false;watchContext={kind,roomId};
 const streamUrl=new URL(url);
 const isHls=streamUrl.pathname.toLowerCase().endsWith('.m3u8');
 if(isHls){
  // Download the HLS decoder only after an explicit video opt-in.
  // Ordinary campaign workers never need this heavy mobile bundle.
  const {default:Hls}=await import('hls.js');
  if(watchContext?.kind!==kind||watchContext?.roomId!==roomId)return;
  if(Hls.isSupported()){
   hls=new Hls({enableWorker:true,lowLatencyMode:true});
   hls.loadSource(streamUrl.href);hls.attachMedia(player);
  }else if(player.canPlayType('application/vnd.apple.mpegurl')){
   player.src=streamUrl.href;
  }else{
   stopOptionalVideo();
   throw Error('דער בראוזער שטיצט נישט דעם HLS שידור. פרוביר א MP4 אדער אן אנדערע וועב־קוואל.');
  }
 }else player.src=streamUrl.href;
 player.scrollIntoView({block:'nearest',behavior:'smooth'});
 // Never call play(): the viewer controls playback on their own device.
}
export function videoPanel(status,kind,roomId,grants,esc){
 if(!roomId)return '';
 const eligible=status?.allowed===true;
 const isManager=status?.isManager===true;
 const broad=kind==='conference'?'admitted':'checked_in';
 const broadLabel=kind==='conference'?'אלע אריינגעלאזטע צוהערער':'אלע איינגעטשעקטע עסקנים';
 const managerPanel=isManager?'<form data-form="video-config" class="stack">'+
  '<input type="hidden" name="kind" value="'+kind+'">'+
  '<label>לייוו־ווידעא מצב<select name="enabled">'+
   '<option value="false" '+(!status?.enabled?'selected':'')+'>אויסגעלאשן</option>'+
   '<option value="true" '+(status?.enabled?'selected':'')+'>ערלויבן פרייוויליג צוקוקן</option></select></label>'+
  '<label>ווער מעג צוקוקן?<select name="accessMode">'+
   '<option value="approved_only" '+(status?.accessMode==='approved_only'?'selected':'')+'>נאר אויסגעקליבענע מיטגלידער</option>'+
   '<option value="'+broad+'" '+(status?.accessMode===broad?'selected':'')+'>'+broadLabel+'</option>'+
   '</select></label>'+
  '<label>באשטעטיגטער HTTPS־ווידעא־שידור (.m3u8 אדער MP4)<input type="url" name="sourceUrl" maxlength="1000" placeholder="https://..." value="'+esc(status?.configuredUrl||'')+'"></label>'+
  '<p class="muted">מען דארף א לעבעדיגן ווידעא־שידור־קוואל. דער סיסטעם מאכט נאכנישט אליין א קאמערא־שידור. דער אויסערליכער פראוויידער דארף באשיצן זיינע לינקס.</p>'+
  '<button type="submit">אפהיטן ווידעא־איינשטעלונגען</button></form>'+
  '<form data-form="video-grant" class="stack"><input type="hidden" name="kind" value="'+kind+'">'+
   '<label>ערלויבטער מיטגליד־קאוד<input name="subject" required maxlength="128" placeholder="מיטגליד־קאוד"></label>'+
   '<label>אויסוואל<select name="allowed"><option value="true">ערלויבן צוקוקן</option><option value="false">אוועקנעמען ערלויבעניש</option></select></label>'+
   '<button type="submit">אפהיטן פערזענליכע רשות</button></form>'+
  (grants||[]).filter(g=>g.granted).map(g=>'<p class="muted">ערלויבט: '+esc(g.subject)+'</p>').join(''):'';
 return '<section class="card video-choice"><h3>פרייוויליגער לייוו־ווידעא</h3>'+
   '<p class="muted">ווידעא איז קיינמאל נישט קיין חיוב. נאר ווער עס וויל, מיט גענוג אינטערנעט און מיט דער מנהל־רשות, קען באזונדער אנצינדן דעם שידור.</p>'+
   (status?.enabled?
     (eligible?'<button type="button" data-action="video-watch" data-kind="'+kind+'" data-id="'+esc(roomId)+'">איך וויל איצט צוקוקן לייוו</button>':
     '<p class="muted">דער ווידעא־שידור איז נישט ערלויבט פאר דיין אקאונט. דו קענסט ווייטער מיטהאלטן דעם גאנצן פראגראם אן ווידעא.</p>'):
    '<p class="muted">דער מנהל האט ווידעא נישט אנגעצונדן.</p>')+
   managerPanel+'</section>';
}
