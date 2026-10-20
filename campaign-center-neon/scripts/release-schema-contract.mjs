// Read-only, deterministic release requirements for staged Campaign Center 027–034.
// This function NEVER touches a database. The caller supplies only catalog metadata.
export const REQUIRED_RELEASE_TABLES=Object.freeze([
 'cc_organizations','cc_memberships','cc_campaigns','cc_campaign_members',
 'cc_plan_entitlements','cc_pro_guidance_requests',
 'cc_quick_daily_reviews','cc_plus_alert_acknowledgements','cc_pro_campaign_files',
 'cc_pro_automation_rules','cc_pro_automation_task_links','cc_pro_automation_runs',
 'cc_pro_next_action_choices','cc_pro_next_action_history',
 'cc_gabbai_handoffs','cc_gabbai_handoff_events',
 'cc_management_plan_items','cc_management_plan_history',
 'cc_custom_workflow_templates','cc_custom_workflow_runs','cc_custom_workflow_events'
]);
export const REQUIRED_RELEASE_COLUMNS=Object.freeze({
 cc_pro_guidance_requests:['assigned_to','response_due_at','triaged_at'],
 cc_gabbai_handoffs:['status','completed_at','assigned_to','campaign_id'],
 cc_gabbai_handoff_events:['status_to','body','actor_subject'],
 cc_management_plan_items:['status','progress','next_action','issue_reason','assigned_to','version'],
 cc_management_plan_history:['before_state','after_state','actor_subject'],
 cc_custom_workflow_templates:['step_titles','created_by'],
 cc_custom_workflow_runs:['status','next_step','assigned_to','version'],
 cc_custom_workflow_events:['actor_subject','step_index','event_kind']
});

const checkName=(row)=>String(row?.conname??row?.name??'');
const checkBody=(row)=>String(row?.definition??row?.constraint_definition??row?.checktext??'').toLowerCase();

export function assessReleaseSchema({tables=[],columns=[],constraints=[]}={}){
 const errors=[];
 const byName=new Map(tables.map(t=>[String(t.name??t.relname),t]));
 for(const name of REQUIRED_RELEASE_TABLES){
  const row=byName.get(name);
  if(!row)errors.push('Missing required table: '+name);
  else if(row.rls!==true&&row.relrowsecurity!==true)
   errors.push('RLS disabled on required table: '+name);
 }
 for(const row of tables){
  const name=String(row.name??row.relname??'');
  if(name.startsWith('cc_')&&row.rls!==true&&row.relrowsecurity!==true)
   errors.push('RLS disabled on Campaign Center table: '+name);
 }
 const columnsByTable=new Map();
 for(const row of columns){
  const name=String(row.table_name??'');
  if(!columnsByTable.has(name))columnsByTable.set(name,new Set());
  columnsByTable.get(name).add(String(row.column_name??''));
 }
 for(const [name,required] of Object.entries(REQUIRED_RELEASE_COLUMNS)){
  for(const field of required)if(!columnsByTable.get(name)?.has(field))
   errors.push('Missing required column: '+name+'.'+field);
 }
 // A live 033 schema without 034 rejects the "blocked" status required
 // by the new server. Verify the actual CHECK body, not just table existence.
 for(const [table,name] of [
  ['cc_gabbai_handoffs','cc_gabbai_handoffs_status_check'],
  ['cc_gabbai_handoff_events','cc_gabbai_handoff_events_status_to_check']
 ]){
  const match=constraints.find(row=>
   String(row.table_name??'')===table&&checkName(row)===name);
  if(!match||!checkBody(match).includes('blocked'))
   errors.push('Missing blocked-state CHECK constraint: '+table+'.'+name);
 }
 return {ready:errors.length===0,errors};
}
