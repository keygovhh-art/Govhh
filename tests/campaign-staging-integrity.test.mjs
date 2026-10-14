import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const text=p=>fs.readFileSync(p,'utf8');
test('exactly one primary app and auth script plus contacts script',()=>{
  const page=text('campaign-center-v2/index.html');
  for(const name of ['app.js','auth-focus.js','contacts.js']){
    assert.equal((page.match(new RegExp('<script src="'+name.replace('.','\\.')+'\\?v=[0-9]+"></script>','g'))||[]).length,1);
  }
  assert.equal((page.match(/<\/html>/g)||[]).length,1);
  assert.equal((page.match(/<\/body>/g)||[]).length,1);
  assert.ok(!page.includes('src="contacts.js?v=1"></script>src='));
});
test('campaign network cannot recurse or load via eval',()=>{
  const code=text('campaign-center-v2/campaign-network.js');
  const loader=text('campaign-center-v2/campaign-network-loader.js');
  assert.ok(!code.includes('renderAll=function(){old();renderAll()}'));
  assert.ok(!loader.includes('eval('));
  assert.ok(loader.includes('document.createElement(\'script\')'));
});
test('staged campaign scripts parse without syntax exceptions',()=>{
  for(const script of ['app.js','auth-focus.js','contacts.js','campaign-network.js','campaign-network-loader.js']){
    const code=text('campaign-center-v2/'+script);
    assert.doesNotThrow(()=>new vm.Script(code,{filename:script}));
  }
});
test('master system plan retains team and personal MAX boundaries',()=>{
  const plan=text('GAVHAH-CONNECT-CAMPAIGN-CENTER-MASTER-PLAN.md');
  for(const keyword of ['private','Campaign Center','Gavhah MAX','sponsored','כח הרבים']){
    assert.ok(plan.includes(keyword));
  }
});
