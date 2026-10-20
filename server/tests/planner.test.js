import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { api, closeDb, resetDb, signup, makePdf, uploadPdf, waitReady, SO_PAGES } from './helpers.js';

before(resetDb);
beforeEach(resetDb);
after(closeDb);

test('estudo individual é isolado e não entra na lista de grupos', async()=>{
  const ana=await signup('Ana');
  const bia=await signup('Bia');
  const one=await api.get('/api/personal/space').set(ana.auth);
  const same=await api.get('/api/personal/space').set(ana.auth);
  const other=await api.get('/api/personal/space').set(bia.auth);
  assert.equal(one.status,200);
  assert.equal(one.body.groupId,same.body.groupId);
  assert.notEqual(one.body.groupId,other.body.groupId);
  const list=await api.get('/api/groups').set(ana.auth);
  assert.equal(list.body.groups.length,0);
  assert.equal((await api.get(`/api/groups/${one.body.groupId}`).set(bia.auth)).status,404);
  const code=(await api.get(`/api/groups/${one.body.groupId}`).set(ana.auth)).body.group.invite_code;
  assert.equal((await api.post('/api/groups/join').set(bia.auth).send({code})).status,404);
  assert.equal((await api.delete(`/api/groups/${one.body.groupId}`).set(ana.auth)).status,403);
});

test('arquivos pessoais servem ao RAG, mas não ficam acessíveis a outro usuário',async()=>{
  const ana=await signup('Ana');
  const bia=await signup('Bia');
  const groupId=(await api.get('/api/personal/space').set(ana.auth)).body.groupId;
  const doc=await uploadPdf(groupId,ana.auth,await makePdf(SO_PAGES));
  assert.equal(doc.status,202,JSON.stringify(doc.body));
  const ready=await waitReady(groupId,ana.auth,doc.body.document.id);
  assert.equal(ready.status,'ready',ready.error);
  assert.equal((await api.get(`/api/groups/${groupId}/documents`).set(bia.auth)).status,404);
  assert.equal((await api.post(`/api/groups/${groupId}/ask`).set(bia.auth).send({question:'O que é thread?'})).status,404);
  assert.equal((await api.get(`/api/groups/${groupId}/documents`).set(ana.auth)).body.documents.length,1);
});

test('interpreta linguagem natural e pede confirmação sem criar lembretes',async()=>{
  const ana=await signup();
  const local=new Date();
  const today=`${local.getFullYear()}-${String(local.getMonth()+1).padStart(2,'0')}-${String(local.getDate()).padStart(2,'0')}`;
  const preview=await api.post('/api/planner/interpret').set(ana.auth).send({message:'Amanhã às 19h estudar SQL',today});
  assert.equal(preview.status,200,JSON.stringify(preview.body));
  assert.equal(preview.body.draft.localTime,'19:00');
  assert.equal(preview.body.draft.repeatType,'none');
  assert.deepEqual(preview.body.needs,[]);
  assert.equal((await api.get('/api/planner').set(ana.auth)).body.reminders.length,0);
});

test('CRUD de lembretes e isolamento por usuário',async()=>{
  const ana=await signup('Ana');
  const bia=await signup('Bia');
  const at=new Date(Date.now()+24*60*60*1000).toISOString();
  const create=await api.post('/api/planner').set(ana.auth).send({title:'Prova de Banco de Dados',kind:'exam',scheduledAt:at});
  assert.equal(create.status,201,JSON.stringify(create.body));
  const id=create.body.reminder.id;
  assert.equal((await api.get('/api/planner').set(bia.auth)).body.reminders.length,0);
  assert.equal((await api.patch(`/api/planner/${id}`).set(bia.auth).send({completed:true})).status,404);
  assert.equal((await api.patch(`/api/planner/${id}`).set(ana.auth).send({completed:true})).status,200);
  assert.ok((await api.get('/api/planner').set(ana.auth)).body.reminders[0].completedAt);
  assert.equal((await api.delete(`/api/planner/${id}`).set(ana.auth)).status,204);
  assert.equal((await api.get('/api/planner').set(ana.auth)).body.reminders.length,0);
  assert.equal((await api.post('/api/planner').set(ana.auth).send({title:'Passado',scheduledAt:new Date(Date.now()-86400000).toISOString()})).status,400);
});

test('avisos são consumidos uma vez quando o aluno abre o site',async()=>{
  const ana=await signup();
  const at=new Date(Date.now()+20*60*1000).toISOString();
  const created=await api.post('/api/planner').set(ana.auth).send({title:'Revisar matemática',kind:'study',scheduledAt:at,alertMinutesBefore:30});
  assert.equal(created.status,201);
  const first=await api.get('/api/planner/alerts/pending').set(ana.auth);
  assert.equal(first.body.alerts.length,1);
  const second=await api.get('/api/planner/alerts/pending').set(ana.auth);
  assert.equal(second.body.alerts.length,0);
});
