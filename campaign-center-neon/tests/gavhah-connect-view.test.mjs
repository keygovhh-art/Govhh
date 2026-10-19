import test from 'node:test';
import assert from 'node:assert/strict';
import {gavhahConnectView} from '../src/gavhah-connect-view.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const base=()=>({connectStatus:{linked:false,connections:[]},connectError:'',
  connectCode:'',connectCodeDeadline:0,gavhahPublicUrl:'https://gavhah.onrender.com'});
test('Member sees real two-account steps, code button and safe outbound route',()=>{
 const html=gavhahConnectView(base(),esc);
 assert.match(html,/data-action="connect-generate"/);
 assert.match(html,/data-action="connect-refresh"/);
 assert.match(html,/https:\/\/gavhah.onrender.com\/communications/);
 assert.match(html,/rel="noopener noreferrer"/);
 assert.match(html,/נאך נישט פארבונדן/);
 assert.doesNotMatch(html,/data-action="connect-unlink"/);
});
test('Temporary code is visible only until expiry and never stored in a form',()=>{
 const s=base();s.connectCode='abc_DEF123abc_DEF123abc_DEF123ab';
 s.connectCodeDeadline=Date.now()+60000;
 let html=gavhahConnectView(s,esc);
 assert.match(html,/data-action="connect-copy"/);
 assert.ok(html.includes(s.connectCode));
 s.connectCodeDeadline=Date.now()-1000;
 html=gavhahConnectView(s,esc);
 assert.ok(!html.includes(s.connectCode));
 assert.doesNotMatch(html,/data-action="connect-copy"/);
});
test('Linked status is not presented as a verified live two-server connection',()=>{
 const s=base();s.connectStatus={linked:true,connections:[{external_system:'gavhah_max'}]};
 s.connectCode='clear-me-secret-should-be-hidden';
 const html=gavhahConnectView(s,esc);
 assert.match(html,/data-action="connect-unlink"/);
 assert.match(html,/נישט אז די צוויי לייוו/);
 assert.doesNotMatch(html,/clear-me-secret-should-be-hidden/);
 assert.doesNotMatch(html,/data-action="connect-generate"/);
});
test('Error output and external URLs are escaped and invalid destinations rejected',()=>{
 const s=base();s.connectError='<script>alert(1)</script>';
 s.gavhahPublicUrl='javascript:alert(1)';
 let html=gavhahConnectView(s,esc);
 assert.doesNotMatch(html,/<script>|href="javascript:/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/לינק דארף נאך קאנפיגורירט/);
 s.gavhahPublicUrl='https://gavhah.onrender.com:443@evil.example/';
 html=gavhahConnectView(s,esc);
 assert.doesNotMatch(html,/<a href=/);
});
