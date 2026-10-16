import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const here=dirname(fileURLToPath(import.meta.url));
const root=join(here,'..');
const doc=JSON.parse(readFileSync(join(root,'docs/phone-parity-controls.json'),'utf8'));
assert.equal(doc.version,1,'Review the versioned parity contract first');
const found=new Set();
for(const source of doc.source_files){
 assert.ok(source.startsWith('campaign-center-neon/src/'),'Only audited source files');
 const file=join(root,source.replace('campaign-center-neon/',''));
 const content=readFileSync(file,'utf8');
 for(const m of content.matchAll(/data-(action|form)\s*=\s*["']([a-z][a-z0-9-]*)["']/gi))
   found.add(m[1]+':'+m[2]);
}
const expected=new Map();
for(const item of doc.controls){
 assert.ok(!expected.has(item.id),'Duplicate parity item '+item.id);
 assert.match(item.id,/^(action|form):[a-z0-9-]+$/);
 assert.ok(item.source_files.length,'Missing source for '+item.id);
 assert.ok(item.phone_equivalent && item.security_gate,'Missing phone scope for '+item.id);
 assert.ok(['not_implemented','staged','provider_tested','live_verified'].includes(item.phone_status));
 expected.set(item.id,item);
}
const missing=[...found].filter(x=>!expected.has(x)).sort();
const stale=[...expected.keys()].filter(x=>!found.has(x)).sort();
if(missing.length||stale.length){
 console.error('New web controls missing telephone parity entries:',missing);
 console.error('Removed web controls still mapped:',stale);
 process.exit(1);
}
assert.equal(doc.record_count,expected.size,'Update audited total');
assert.equal(doc.production_telephony_complete,false,'Do not mark end-to-end complete without acceptance proof');
console.log('PASS: '+expected.size+' exact web UI actions/forms recorded in the phone parity contract.');
console.log('NOTE: The registry validates scope ONLY, not a working phone implementation.');
