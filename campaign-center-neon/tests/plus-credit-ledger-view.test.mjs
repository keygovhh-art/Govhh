import test from 'node:test';
import assert from 'node:assert/strict';
import {askanPlusView} from '../src/askan-plus-view.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>'$'+esc(x);
const data={
 plusCredits:[{subject:'<script>x</script>',team_name:'',currency:'USD',
  pledged:'100',receipts:'40',refunds:'10',corrections:'5',manual_net:'30',
  member_status:'revoked',current_campaign_member:false}],
 plusCreditMeta:{totalCreditRows:504,shown:100,page:1,pageCount:6,
  currencyTotals:[{currency:'USD',pledged:'100',receipts:'40',refunds:'10',corrections:'5',
   manual_net:'30',unattributed_events:1,ledger_event_count:4},
   {currency:'EUR',pledged:'0',receipts:'90',refunds:'0',corrections:'0',
   manual_net:'90',unattributed_events:0,ledger_event_count:1}]},
 overview:{campaign:{role:'owner'}},plusAlerts:null,
 plusDesk:null,plusDays:7,plusReport:null
};
test('Credit report visibly distinguishes historical people, currency, correction and all-page counts',()=>{
 const html=askanPlusView(data,esc,money);
 assert.match(html,/קרעדיט פער עסקן — גאנצע היסטאריע/);
 assert.match(html,/קרעדיט־רעקארדס: 504/);
 assert.match(html,/data-action="plus-credit-page" data-page="2"/);
 assert.match(html,/USD 30/);
 assert.match(html,/EUR 90/);
 assert.match(html,/נישט צוגעטיילט פאר אן עסקן: 1/);
 assert.match(html,/היסטארישער קרעדיט/);
 assert.match(html,/קארעקטורן/);
 assert.match(html,/נישט באשטעטיגט דורך א באנק/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;x&lt;\/script&gt;/);
});
test('Personal report and failing endpoints do not claim campaign-wide or bank-confirmed money',()=>{
 let html=askanPlusView({...data,overview:{campaign:{role:'askan'}},
  plusCreditMeta:{...data.plusCreditMeta,totalCreditRows:1,pageCount:1}},esc,money);
 assert.doesNotMatch(html,/נישט צוגעטיילט פאר אן עסקן: 1/);
 assert.doesNotMatch(html,/data-action="plus-credit-page"/);
 html=askanPlusView({...data,plusCreditMeta:null,plusCreditError:'not available <private>'},esc,money);
 assert.match(html,/not available &lt;private&gt;/);
 assert.doesNotMatch(html,/<private>/);
});
