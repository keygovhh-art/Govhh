// Askan Pro: real file upload/download pilot, each path requires Neon JWT.
// Display is escaped by caller; attachments are not rendered inline in the app.
export function proFilesView(state,esc){
 if(!state.campaignId)return '';
 const data=state.proFiles||{files:[]};
 const available=state.entitlements?.usableFeatures?.includes('files');
 if(!available)return '<section class="card"><h2>קאמפיין־דאקומענטן</h2><p>די פונקציע דארף אן אקטיוון Askan Pro־פלאן.</p></section>';
 const entries=(data.files||[]).map(f=>
  '<article class="item"><div><strong>'+esc(f.original_name)+'</strong>'+
  '<small>'+esc(f.media_type)+' · '+esc(Math.ceil(Number(f.bytes_length)/1024))+' KB · '+
  esc(f.visibility==='private'?'פריוואט':f.visibility==='team'?'גרופע':'גאנצער קאמפיין')+
  '</small></div><button type="button" data-action="pro-file-download" data-id="'+esc(f.id)+'" data-name="'+esc(f.original_name)+'">אראפנעמען</button></article>'
 ).join('');
 return '<section class="card"><h2>Askan Pro — קאמפיין־דאקומענטן</h2>'+
  '<p class="muted">אמתע פיילן אין די קאמפיין־דאטאבעיס. בלויז PDF, JPG, PNG אדער TXT, ביז 1 MB א פייל, 20 פיילן פער קאמפיין. דאס איז א Pilot אן אנטי־ווירוס־סקענער: עפענען נאר פיילן פון באקאנטע מענטשן.</p>'+
  (state.proFilesError?'<p role="alert">'+esc(state.proFilesError)+'</p>':'')+
  '<form class="stack" data-form="pro-file-upload">'+
  '<label>קלייב א פייל<input name="attachment" type="file" accept=".pdf,.jpg,.png,.txt,application/pdf,image/jpeg,image/png,text/plain" required></label>'+
  '<label>ווער מעג דאס זען? <select name="visibility">'+
  '<option value="private">נאר איך</option><option value="team">מיין גרופע</option><option value="campaign">דער גאנצער קאמפיין</option></select></label>'+
  '<button type="submit">ארויפלייגן פייל</button></form>'+
  '<h3>אפגעהיטענע פיילן</h3>'+ (entries||'<p class="muted">נאך קיין ערלויבטע פיילן.</p>')+
  '</section>';
}
