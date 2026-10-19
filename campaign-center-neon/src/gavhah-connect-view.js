// Campaign Center account-linking UI. A link is explicit, not SSO.
export function gavhahConnectView(state,esc){
 const link=state.connectStatus;
 const linked=link?.linked===true;
 const url=String(state.gavhahPublicUrl||'');
 const safeUrl=(()=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.origin===url.replace(/\/$/,'')?u.origin:'';}catch{return '';}})();
 const code=state.connectCode||'';
 const unexpired=code&&Number(state.connectCodeDeadline||0)>Date.now();
 const error=state.connectError?'<p role="alert">'+esc(state.connectError)+'</p>':'';
 const linkedNames=(link?.connections||[]).filter(x=>x.external_system==='gavhah_max');
 return '<section class="card" dir="rtl"><h2>גבהה קאנעקט — פארבינד דעם קאמפיין סענטער</h2>'+
  '<p>דיין קאמפיין־אקאונט און דיין פערזענליכער גבהה־אקאונט בלייבן צוויי באזונדערע אקאונטס. פארבינד זיי נאר מיט דיין קלארע באשטעטיגונג.</p>'+
  '<p class="muted">איינמאליגער קאוד מיט א גילטיקייט פון 10 מינוט. קיין צונויפשטעלן לויט נאמען, טעלעפאן אדער אימעיל. דיין פריוואטע נדבן־קארטל ווערט נישט אריבערגעשיקט.</p>'+
  error+
  (linked?
   '<p role="status"><strong>דיין אקאונט־לינק איז אקטיוו.</strong> דאס באשטעטיגט דעם לינק אינעם קאמפיין סענטער, נישט אז די צוויי לייוו־סערווערס זענען שוין געהעריג קאנפיגורירט.</p>'+
   '<small>פארבינדונגען: '+esc(String(linkedNames.length))+'</small>'+
   '<div class="inline"><button type="button" data-action="connect-refresh">איבערקוקן לינק</button>'+
   '<button type="button" data-action="connect-unlink">אויפלעזן די פארבינדונג</button></div>'
   :'<p role="status"><strong>נאך נישט פארבונדן.</strong></p>'+
   '<div class="inline"><button type="button" data-action="connect-generate">שאפן א נייעם איינמאליגן קאנעקט־קאוד</button>'+
   '<button type="button" data-action="connect-refresh">איבערקוקן לינק</button></div>'+
   (unexpired?'<p>דיין קאנעקט־קאוד (נאר פאר דעם אייגענעם גבהה־אקאונט):</p>'+
     '<p><strong dir="ltr" style="user-select:all;word-break:break-all">'+esc(code)+'</strong></p>'+
     '<button type="button" data-action="connect-copy">קאפירן קאוד</button>'+
     '<p class="muted">נוצ עס אין גבהה → מיין עסקנות → גבהה קאנעקט פאר 10 מינוט. דער קאוד ווערט נישט אפגעהיטן אינעם בראוזער.</p>'
     :''))+
  (safeUrl?'<p><a href="'+esc(safeUrl)+'/communications" target="_blank" rel="noopener noreferrer">עפענען גבהה — מיין עסקנות</a></p>':
   '<p class="muted">דער הויפט גבהה־לינק דארף נאך קאנפיגורירט ווערן דורך דער הנהלה.</p>')+
  '<p class="muted">דער געלט־פארוואלטער באשטעטיגט באצאלונגען נאר אין זיין סיסטעם. דאס פארבינדן פון אקאונטס איז נישט קיין רשות צו קאפירן פריוואטע נאטיצן, אנצוהייבן רופן אדער אריבערפירן געלט.</p></section>';
}
