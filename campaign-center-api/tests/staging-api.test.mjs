import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import pg from "pg";
import {createApp} from "../src/app.mjs";

test("real Postgres Campaign Center: orgs, invitations, two members, scoped assignments, durable audit",async()=>{
  if(!process.env.TEST_DATABASE_URL)throw Error("TEST_DATABASE_URL must point at disposable Postgres");
  const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
  await pool.query(readFileSync(new URL("../../neon/20261014_campaign_center_gavhah_connect_foundation.sql",import.meta.url),"utf8"));
  await pool.query(readFileSync(new URL("../../neon/20261015_campaign_center_api_hardening.sql",import.meta.url),"utf8"));
  const verifyBearer=async h=>{
    if(!["Bearer owner-one","Bearer member-two","Bearer stranger-three"].includes(h)){
      const e=Error("Authentication required");e.status=401;throw e;
    }
    return {sub:h.slice(7)};
  };
  const server=createApp({pool,verifyBearer,publicOrigin:"http://127.0.0.1:8124"}).listen(0);
  await new Promise((resolve,reject)=>{
    if(server.listening){resolve();return;}
    server.once("listening",resolve);server.once("error",reject);
  });
  const port=server.address().port,base="http://127.0.0.1:"+port;
  const request=async(account,path,method="GET",body=null,key=null)=>{
    const headers={};
    if(account)headers.Authorization="Bearer "+account;
    if(body!==null)headers["Content-Type"]="application/json";
    if(key)headers["Idempotency-Key"]=key;
    const res=await fetch(base+path,{method,headers,body:body===null?undefined:JSON.stringify(body)});
    return {status:res.status,body:await res.json()};
  };
  try{
    let r=await request(null,"/api/me");
    assert.equal(r.status,401);
    r=await request("owner-one","/api/organizations","POST",{name:"QA Campaign Network"});
    assert.equal(r.status,201,r.body.error);
    const org=r.body.id;
    r=await request("stranger-three","/api/organizations/"+org+"/campaigns");
    assert.equal(r.status,404,"An unrelated account saw private org");
    r=await request("owner-one","/api/organizations/"+org+"/campaigns","POST",
      {title:"עולם החסד גראנד קאמפיין",goalAmount:"500000"});
    assert.equal(r.status,201,r.body.error);
    const campaign=r.body.id;
    assert.equal(r.body.status,"draft");
    r=await request("owner-one","/api/campaigns/"+campaign,"PATCH",{status:"active"});
    assert.equal(r.status,200);
    r=await request("member-two","/api/campaigns/"+campaign);
    assert.equal(r.status,404,"Inactive user saw campaign");
    r=await request("owner-one","/api/organizations/"+org+"/members","POST",
      {subject:"member-two",role:"askan"});
    assert.equal(r.status,201);
    r=await request("owner-one","/api/campaigns/"+campaign+"/members","POST",
      {subject:"member-two",teamName:"נאכפאלג־גרופע"});
    assert.equal(r.status,201,r.body.error);
    r=await request("member-two","/api/campaigns/"+campaign);
    assert.equal(r.status,404,"An invited-only member has live campaign access");
    r=await request("stranger-three","/api/organizations/"+org+"/invitations/accept","POST",{});
    assert.equal(r.status,404,"Other user accepted another member's invite");
    r=await request("member-two","/api/organizations/"+org+"/invitations/accept","POST",{});
    assert.equal(r.status,200,r.body.error);
    r=await request("member-two","/api/campaigns/"+campaign);
    assert.equal(r.status,200,"Active member could not open assigned campaign");
    r=await request("member-two","/api/campaigns/"+campaign,"PATCH",{goalAmount:"1"});
    assert.equal(r.status,403,"Ordinary askan changed the goal");
    r=await request("member-two","/api/campaigns/"+campaign+"/assignments","POST",
      {title:"No permission",assigneeSubject:"member-two"},"secret-req-key-123");
    assert.equal(r.status,403,"Askan created a manager's assignment");

    const assignment={title:"רופן די היינטיגע נדבנים",assigneeSubject:"member-two",
      kind:"call_lead",priority:"high",dueAt:"2026-10-20T17:30:00.000Z"};
    const key="qa-call-assignment-key-001";
    r=await request("owner-one","/api/campaigns/"+campaign+"/assignments",
      "POST",assignment,key);
    assert.equal(r.status,201,r.body.error);
    const taskId=r.body.id;
    r=await request("owner-one","/api/campaigns/"+campaign+"/assignments",
      "POST",assignment,key);
    assert.equal(r.status,200,"Retry must not create duplicate");
    assert.equal(r.body.id,taskId);
    assert.equal(r.body.duplicate,true);
    r=await request("owner-one","/api/campaigns/"+campaign+"/assignments",
      "POST",{...assignment,title:"Other task"} ,key);
    assert.equal(r.status,409,"Request key cannot hide conflicting payload");
    r=await request("stranger-three","/api/campaigns/"+campaign+"/assignments");
    assert.equal(r.status,404);
    r=await request("member-two","/api/campaigns/"+campaign+"/assignments");
    assert.equal(r.status,200);
    assert.equal(r.body.length,1);
    r=await request("member-two","/api/campaigns/"+campaign+"/assignments/"+taskId,
      "PATCH",{status:"done"});
    assert.equal(r.status,200,"Member cannot finish own task");
    r=await request("member-two","/api/campaigns/"+campaign+"/assignments/"+taskId,
      "PATCH",{status:"open"});
    assert.equal(r.status,403,"Member should not secretly undo task status");
    r=await request("member-two","/api/campaigns/"+campaign+"/history");
    assert.equal(r.status,403,"Member cannot read full managerial audit");
    r=await request("owner-one","/api/campaigns/"+campaign+"/history");
    assert.equal(r.status,200);
    assert.ok(r.body.items.some(x=>x.eventType==="assignment_status_changed"),"Completed task vanished from history");
    assert.equal(r.body.items.filter(x=>x.eventType==="assignment_created").length,1,
      "Duplicate assignment event was recorded");
    r=await request("owner-one","/api/organizations/"+org+"/campaigns");
    assert.equal(r.body.length,1);
    r=await request("owner-one","/api/organizations/"+org+"/campaigns","GET");
    assert.equal(r.status,200);
    const blocked=await fetch(base+"/api/me",{
      headers:{Authorization:"Bearer owner-one",Origin:"https://attacker.example"}});
    assert.equal(blocked.status,403,"Cross-origin browser access was accepted");
    const noDelete=await request("owner-one","/api/campaigns/"+campaign,"DELETE");
    assert.equal(noDelete.status,404,"Campaign deletion must not be an ordinary action");
  }finally{
    await new Promise(resolve=>server.close(resolve));
    await pool.end();
  }
});
