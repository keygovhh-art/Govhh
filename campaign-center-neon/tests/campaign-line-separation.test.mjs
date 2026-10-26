import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const router=read('../server/campaign-line.js');
const server=read('../server/index.js');
const ui=read('../src/main.js');
const schema=read('../db/027_campaign_center_dedicated_line.sql');

test('Campaign Center never fetches Gavhah phone credentials or status',()=>{
 assert.doesNotMatch(server,/fetch\([^)]*GAVHAH_API_BASE_URL/);
 assert.doesNotMatch(server,/YEMOT_CENTRAL_SHARED_SECRET/);
 assert.match(server,/campaignLineRouter/);
 assert.match(server,/central-status'[,]/);
 assert.match(ui,/\/yemot\/campaign-line/);
 assert.doesNotMatch(ui,/\/yemot\/central-status/);
});
test('separate API credentials are platform-admin only and encrypted',()=>{
 assert.match(server,/CC_YEMOT_ADMIN_SUBJECT/);
 assert.match(server,/req\.userId/);
 assert.match(router,/platformAdmin\(req\.userId\)/);
 assert.match(router,/CC_YEMOT_ENCRYPTION_KEY/);
 assert.match(router,/aes-256-gcm/);
 assert.match(router,/setAAD/);
 assert.match(router,/token:'NEVER_RETURNED'/);
 assert.match(router,/GAVHAH_EXISTING_LINE_NUMBER/);
 assert.match(router,/safeDifferentNumber/);
 assert.match(schema,/ENABLE ROW LEVEL SECURITY/g);
});
test('saving and testing cannot activate or reroute either hotline',()=>{
 assert.match(router,/active:false/);
 assert.match(router,/GetSession/);
 assert.match(router,/username/);
 assert.match(router,/numberOwnershipVerified:true/);
 assert.match(router,/install_state/);
 assert.match(router,/UpdateExtension/);
 assert.match(router,/callback_hash/);
 assert.match(router,/install_state='pending'/);
 assert.match(router,/install_state='live'/);
 assert.doesNotMatch(router,/UploadFile|DeleteFile|StartCall|originate|dialOut/);
 assert.doesNotMatch(router,/GAVHAH_API_BASE_URL|YEMOT_CENTRAL_SHARED_SECRET/);
 assert.match(router,/last_test_attempt_at/);
 assert.match(router,/last_verified_at/);
});

test('provider-verified Campaign Center IVR is standalone, session-hashed and privacy-locked',()=>{
 const callback=read('../server/campaign-ivr.js');
 assert.match(callback,/entryKey/);
 assert.match(callback,/timingSafeEqual/);
 assert.match(callback,/cc_platform_yemot_call_states/);
 assert.match(callback,/Campaign Center/);
 assert.doesNotMatch(callback,/Gavhah.*api\//);
 assert.match(schema,/cc_platform_yemot_call_states/);
});
