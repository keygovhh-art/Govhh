import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationPortfolioView} from '../src/organization-portfolio-view.js';
const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
 .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
test('Organization shows real urgent cross-campaign focus with one-tap navigation',()=>{
 const id='0d604f64-47ed-46b5-b36e-c97a2ec19f11';
 const data={totalCampaigns:53,returned:50,truncated:true,attentionQueue:[
  {id,title:'Urgent campaign',status:'active',overdue_tasks:4,critical_tasks:2,
   due_soon_tasks:1,oldest_open_due:'2026-10-15T08:00:00Z'}],
  campaigns:[],currencies:[]};
 const html=organizationPortfolioView({organizationPortfolio:data,organizationDecisions:[],organizationError:''},esc,x=>String(x));
 assert.match(html,/וואו דארף מען יעצט העלפן/);
 assert.match(html,/Urgent campaign/);
 assert.match(html,/פארשפעטיגט: 4/);
 assert.match(html,/קריטיש: 2/);
 assert.match(html,new RegExp('data-action="organization-campaign" data-id="'+id+'"'));
 assert.match(html,/ערשטע 25/);
 assert.match(html,/53 קאמפיינס/);
});
test('Urgency list never renders untrusted campaign HTML',()=>{
 const html=organizationPortfolioView({
  organizationPortfolio:{totalCampaigns:1,returned:1,truncated:false,
    attentionQueue:[{id:'z',title:'<script>bad</script>',status:'active',
      overdue_tasks:1,critical_tasks:0,due_soon_tasks:0}],currencies:[],campaigns:[]},
  organizationDecisions:[],organizationError:''},esc,x=>String(x));
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
});
