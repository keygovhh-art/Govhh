import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {campaignPhoneSections} from '../server/campaign-phone-bridge.js';
const read=p=>readFileSync(p,'utf8');
const bridge=read('server/campaign-phone-bridge.js');
const server=read('server/index.js');
const migration=read('db/028_gavhah_4444_phone_sessions.sql');

test('Every main phone section has working data-backed submenu actions',()=>{
 assert.equal(Object.keys(campaignPhoneSections).length,9);
 assert.equal(Object.values(campaignPhoneSections).reduce((n,s)=>n+Object.keys(s.actions).length,0),27);
 for(const s of Object.values(campaignPhoneSections))assert.equal(Object.keys(s.actions).length,3);
 assert.match(bridge,/cc_campaigns/);
 assert.match(bridge,/cc_assignments/);
 assert.match(bridge,/cc_contacts/);
 assert.match(bridge,/cc_finance_events/);
 assert.match(bridge,/cc_live_rooms/);
 assert.match(bridge,/cc_conference_rooms/);
 assert.match(bridge,/cc_plan_entitlements/);
});
test('Phone bridge accepts ONLY signed, timely Gavhah /4444 messages',()=>{
 assert.match(bridge,/CC_GAVHAH_BRIDGE_SECRET/);
 assert.match(bridge,/x-cc-bridge-signature/);
 assert.match(bridge,/timingSafeEqual/);
 assert.match(bridge,/Math\.abs\(Date\.now\(\)-stamp\)>45000/);
 assert.match(bridge,/cc-session:/);
 assert.match(server,/campaignBridgeRouter/);
 assert.match(server,/\/api\/yemot\/gavhah-bridge/);
});
test('Account pairing is separate from Gavhah and bound to active Campaign Center membership',()=>{
 assert.match(bridge,/cc_phone_pairing_codes/);
 assert.match(bridge,/used_at IS NULL AND expires_at>now\(\)/);
 assert.match(bridge,/membership_status='active'/);
 assert.match(bridge,/randomInt\(10000000,100000000\)/);
 assert.match(bridge,/15 minutes/);
 assert.match(bridge,/read\(res,text,step,mode\)/);
 assert.match(server,/campaignPairingRouter/);
 assert.match(server,/\/api\/phone/);
 assert.ok(server.indexOf("app.use('/api', authenticate)") < server.indexOf("app.use('/api/phone',campaignPairingRouter"));
});
test('Finance is permission-checked and nothing charges donors or starts outgoing calls',()=>{
 assert.match(bridge,/if\(!finance\)/);
 assert.match(bridge,/No card payment is taken by phone/);
 assert.match(bridge,/Outbound dialing is not started/);
 assert.match(bridge,/require your own account/);
 assert.doesNotMatch(bridge,/UpdateExtension|DeleteFile|UploadFile|process\.env\.DATABASE_URL/);
});
test('Phone session and code schema remain separate and additive',()=>{
 assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.cc_phone_pairing_codes/);
 assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.cc_phone_bridge_states/);
 assert.match(migration,/call_hash text PRIMARY KEY/);
 assert.doesNotMatch(migration,/DROP TABLE|DELETE FROM|TRUNCATE|ALTER TABLE .*DROP/);
});
