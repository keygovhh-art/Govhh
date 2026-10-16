import { Router } from 'express';

// Private workspace: no organization, campaign or MAX bridge access at all.
// All queries are bound to the JWT subject set by the global auth middleware.
export default function personalRouter({pool,bad,trim,uuid}) {
 const router=Router();
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 const kinds=new Set(['task','note','followup']);
 const priorities=new Set(['normal','high','critical']);
 const statuses=new Set(['open','done','archived']);
 function date(value) {
   if(value===undefined||value===null||value==='')return null;
   if(typeof value!=='string'||value.length>40)throw bad(400,'Invalid date');
   const parsed=new Date(value);
   if(Number.isNaN(parsed.getTime()))throw bad(400,'Invalid date');
   return parsed.toISOString();
 }
 router.get('/items',wrap(async(req,res)=>{
   const result=await pool.query(
     "SELECT id,item_kind,title,details,priority,status,due_at,created_at,updated_at "+
     "FROM cc_personal_items WHERE owner_subject=$1 AND status<>'archived' "+
     "ORDER BY (status='done') ASC, due_at ASC NULLS LAST, created_at DESC LIMIT 500",[req.userId]);
   res.json({items:result.rows});
 }));
 router.post('/items',wrap(async(req,res)=>{
   const title=trim(req.body?.title,240), details=trim(req.body?.details,2000);
   const itemKind=req.body?.kind||'task',priority=req.body?.priority||'normal';
   if(!title||!kinds.has(itemKind)||!priorities.has(priority))throw bad(400,'Invalid personal item');
   const dueAt=date(req.body?.dueAt);
   const client=await pool.connect();
   try {
     await client.query('BEGIN');
     // Serialize per-user writes so limits cannot be bypassed by concurrent requests.
     await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[req.userId]);
     const count=await client.query(
       "SELECT count(*)::int AS total FROM cc_personal_items WHERE owner_subject=$1 AND status<>'archived'",[req.userId]);
     if(count.rows[0].total>=500)throw bad(409,'Personal workspace reached 500 active items; archive old items');
     const result=await client.query(
       'INSERT INTO cc_personal_items(owner_subject,item_kind,title,details,priority,due_at) '+
       'VALUES($1,$2,$3,$4,$5,$6) RETURNING id,item_kind,title,details,priority,status,due_at,created_at,updated_at',
       [req.userId,itemKind,title,details,priority,dueAt]);
     await client.query('COMMIT');
     res.status(201).json(result.rows[0]);
   } catch(error) { await client.query('ROLLBACK'); throw error; }
   finally {client.release();}
 }));
 router.patch('/items/:id',wrap(async(req,res)=>{
   if(!uuid(req.params.id))throw bad(400,'Invalid personal item');
   const payload=req.body||{};
   const fields=[],values=[];
   const field=(name,value)=>{fields.push(name+'=$'+(values.length+1));values.push(value);};
   if(Object.hasOwn(payload,'title')){
     const title=trim(payload.title,240);if(!title)throw bad(400,'A title is required');
     field('title',title);
   }
   if(Object.hasOwn(payload,'details'))field('details',trim(payload.details,2000));
   if(Object.hasOwn(payload,'status')){
     if(!statuses.has(payload.status))throw bad(400,'Invalid personal status');
     field('status',payload.status);
   }
   if(Object.hasOwn(payload,'priority')){
     if(!priorities.has(payload.priority))throw bad(400,'Invalid personal priority');
     field('priority',payload.priority);
   }
   if(Object.hasOwn(payload,'dueAt'))field('due_at',date(payload.dueAt));
   if(!fields.length)throw bad(400,'Nothing to update');
   const ownerParam=values.length+1, idParam=values.length+2;
   const result=await pool.query(
     'UPDATE cc_personal_items SET '+fields.join(',')+',updated_at=now() '+
     'WHERE owner_subject=$'+ownerParam+' AND id=$'+idParam+' AND status<>\'archived\' '+
     'RETURNING id,item_kind,title,details,priority,status,due_at,created_at,updated_at',
     [...values,req.userId,req.params.id]);
   if(!result.rowCount)throw bad(404,'Personal item not found');
   res.json(result.rows[0]);
 }));
 return router;
}
