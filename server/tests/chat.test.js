import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
process.env.NODE_ENV='test';process.env.AI_PROVIDER='mock';process.env.VECTOR_STORE='mysql';process.env.JWT_SECRET='segredo-somente-para-teste-chat';
const {pool}=await import('../src/db/pool.js');
const {signToken}=await import('../src/middleware/auth.js');
const {createChatRouter}=await import('../src/routes/chat.js');
const {errorHandler}=await import('../src/middleware/error.js');
const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',group='33333333-3333-4333-8333-333333333333';
let member=true,personal=false;
const records=[];
pool.execute=async(sql,params)=>{
  if(sql.includes('SELECT role FROM group_members'))return [[...(params[1]===user&&member?[{role:'member'}]:[])]];
  throw Error('Unexpected SQL '+sql);
};
const runQuery=async(sql,params)=>{
 if(sql.includes('FROM personal_spaces'))return {rows:[],rowCount:personal?1:0};
 if(sql.includes('SELECT 1 FROM group_members'))return {rows:[],rowCount:member?1:0};
 if(sql.includes('INSERT INTO group_messages')){if(!records.some(m=>m.client_id===params[2]))records.push({id:records.length+1,user_id:params[1],client_id:params[2],content:params[3],created_at:new Date(),name:'Aluno'});return {rowCount:1,rows:[]};}
 if(sql.includes('FROM group_messages')){
  assert.match(sql,/JOIN group_members/);
  let rows=records.filter(()=>member);
  if(sql.includes('m.client_id = $3'))rows=rows.filter(m=>m.client_id===params[2]);
  if(sql.includes('m.id < $3'))rows=rows.filter(m=>m.id<Number(params[2]));
  return {rows:[...rows].reverse().slice(0,sql.includes('LIMIT 51')?51:50),rowCount:rows.length};
 }throw Error('Unexpected query '+sql);
};
const app=express();app.use(express.json());app.use('/api/groups/:groupId/chat',createChatRouter({runQuery,intervalMs:25}));app.use(errorHandler);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}/api/groups/${group}/chat`;
after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await pool.end()});
test('chat restricts access, validates messages and makes retries idempotent',async()=>{
 assert.equal((await request(app).get(`/api/groups/${group}/chat/messages`)).status,401);
 assert.equal((await request(app).get(`/api/groups/${group}/chat/messages`).auth(signToken(other),{type:'bearer'})).status,404);
 personal=true;assert.equal((await request(app).get(`/api/groups/${group}/chat/messages`).auth(signToken(user),{type:'bearer'})).status,403);personal=false;
 const path=`/api/groups/${group}/chat/messages`,auth=signToken(user),body={content:'Olá, equipe! <script>alert(1)</script>',clientId:'44444444-4444-4444-8444-444444444444'};
 assert.equal((await request(app).post(path).auth(auth,{type:'bearer'}).send({...body,content:' '})).status,400);
 assert.equal((await request(app).post(path).auth(auth,{type:'bearer'}).send({...body,content:'a'.repeat(2001)})).status,400);
 const a=await request(app).post(path).auth(auth,{type:'bearer'}).send(body);
 const b=await request(app).post(path).auth(auth,{type:'bearer'}).send(body);
 assert.equal(a.status,201);assert.equal(a.body.message.id,b.body.message.id);assert.equal(records.length,1);
 const history=await request(app).get(path).auth(auth,{type:'bearer'});assert.equal(history.body.messages[0].content,body.content);
 assert.equal((await request(app).get(path+'?before=invalid').auth(auth,{type:'bearer'})).status,400);
});
test('two open streams receive a message and close on membership revocation',async()=>{
 const controllers=[new AbortController(),new AbortController()];
 const readers=await Promise.all(controllers.map(async c=>{
  const res=await fetch(base+'/events',{headers:{Authorization:'Bearer '+signToken(user)},signal:c.signal});assert.equal(res.status,200);return res.body.getReader();
 }));
 const frame=async reader=>{let data='';while(!data.includes('\n\n')){const part=await reader.read();if(part.done)break;data+=new TextDecoder().decode(part.value)}return data};
 for(const r of readers)assert.match(await frame(r),/event: messages/);
 const body={content:'Mensagem em tempo real',clientId:'55555555-5555-4555-8555-555555555555'};
 await request(app).post(`/api/groups/${group}/chat/messages`).auth(signToken(user),{type:'bearer'}).send(body);
 for(const r of readers)assert.match(await frame(r),/Mensagem em tempo real/);
 member=false;
 for(const r of readers)assert.match(await frame(r),/event: revoked/);
 controllers.forEach(c=>c.abort());member=true;
});
test('history paginates older messages and rate limits sending',async()=>{
 while(records.length<55)records.push({id:records.length+1,user_id:user,client_id:'seed-'+records.length,content:'Histórico',created_at:new Date(),name:'Aluno'});
 const path=`/api/groups/${group}/chat/messages`,token=signToken(user);
 const first=await request(app).get(path).auth(token,{type:'bearer'});assert.equal(first.body.messages.length,50);assert.equal(first.body.nextBefore,'6');
 const second=await request(app).get(path+'?before=6').auth(token,{type:'bearer'});assert.equal(second.body.messages.length,5);assert.equal(second.body.nextBefore,null);
 let response;for(let i=0;i<31;i++)response=await request(app).post(path).auth(token,{type:'bearer'}).send({content:'Teste',clientId:'66666666-6666-4666-8666-666666666666'});
 assert.equal(response.status,429);
});
