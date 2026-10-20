import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { api, closeDb, makePdf, resetDb, signup, SO_PAGES, uploadPdf, waitReady } from './helpers.js';

before(resetDb);
beforeEach(resetDb);
after(closeDb);

async function groupWithDoc(owner, opts) {
  const g = await api.post('/api/groups').set(owner.auth).send({ name: 'Turma de SO', subject: 'Sistemas Operacionais', period: '3º' });
  const groupId = g.body.group.id;
  const up = await uploadPdf(groupId, owner.auth, await makePdf(SO_PAGES), opts);
  assert.equal(up.status, 202, JSON.stringify(up.body));
  const doc = await waitReady(groupId, owner.auth, up.body.document.id);
  assert.equal(doc.status, 'ready', doc.error);
  return { groupId, docId: doc.id, inviteCode: g.body.group.invite_code };
}

describe('autenticação', () => {
  test('cadastro, login e /me; e-mail duplicado e senha errada são recusados', async () => {
    const reg = await api.post('/api/auth/register').send({ name: 'Ana', email: 'ANA@teste.com', password: 'senha-forte-123' });
    assert.equal(reg.status, 201);
    assert.ok(reg.body.token);
    assert.equal((await api.post('/api/auth/register').send({ name: 'Ana', email: 'ana@teste.com', password: 'senha-forte-123' })).status, 409);
    assert.equal((await api.post('/api/auth/login').send({ email: 'ana@teste.com', password: 'errada-errada' })).status, 401);
    const login = await api.post('/api/auth/login').send({ email: 'ana@teste.com', password: 'senha-forte-123' });
    assert.equal(login.status, 200);
    const me = await api.get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);
    assert.equal(me.body.user.name, 'Ana');
    assert.equal(me.body.user.password_hash, undefined);
  });

  test('valida entrada e exige token', async () => {
    assert.equal((await api.post('/api/auth/register').send({ name: 'A', email: 'x', password: '123' })).status, 400);
    assert.equal((await api.get('/api/groups')).status, 401);
    assert.equal((await api.get('/api/groups').set('Authorization', 'Bearer lixo')).status, 401);
  });
});

describe('grupos', () => {
  test('criar, entrar por código, listar membros e sair', async () => {
    const ana = await signup('Ana');
    const bia = await signup('Bia');
    const g = await api.post('/api/groups').set(ana.auth).send({ name: 'Turma BD' });
    assert.equal(g.status, 201);
    const code = g.body.group.invite_code;
    assert.equal((await api.post('/api/groups/join').set(bia.auth).send({ code: 'CODIGO-X' })).status, 404);
    assert.equal((await api.post('/api/groups/join').set(bia.auth).send({ code: code.toLowerCase() })).status, 200);
    const detail = await api.get(`/api/groups/${g.body.group.id}`).set(bia.auth);
    assert.equal(detail.body.members.length, 2);
    assert.equal(detail.body.group.role, 'member');
    assert.equal((await api.post(`/api/groups/${g.body.group.id}/leave`).set(bia.auth)).status, 204);
    assert.equal((await api.get(`/api/groups/${g.body.group.id}`).set(bia.auth)).status, 404);
    assert.equal((await api.post(`/api/groups/${g.body.group.id}/leave`).set(ana.auth)).status, 400, 'dono não sai');
  });

  test('quem não é membro não acessa nada do grupo (e não descobre que ele existe)', async () => {
    const ana = await signup('Ana');
    const intruso = await signup('Intruso');
    const { groupId, docId } = await groupWithDoc(ana);
    for (const [method, url] of [['get', `/api/groups/${groupId}`], ['get', `/api/groups/${groupId}/documents`], ['get', `/api/groups/${groupId}/history`], ['get', `/api/groups/${groupId}/ranking`]]) {
      assert.equal((await api[method](url).set(intruso.auth)).status, 404, url);
    }
    assert.equal((await api.post(`/api/groups/${groupId}/ask`).set(intruso.auth).send({ question: 'O que é thread?' })).status, 404);
    assert.equal((await api.delete(`/api/documents/${docId}`).set(intruso.auth)).status, 404);
  });

  test('só o dono exclui o grupo e remove membros', async () => {
    const ana = await signup('Ana');
    const bia = await signup('Bia');
    const g = (await api.post('/api/groups').set(ana.auth).send({ name: 'Turma' })).body.group;
    await api.post('/api/groups/join').set(bia.auth).send({ code: g.invite_code });
    assert.equal((await api.delete(`/api/groups/${g.id}`).set(bia.auth)).status, 403);
    assert.equal((await api.delete(`/api/groups/${g.id}/members/${ana.user.id}`).set(bia.auth)).status, 403);
    assert.equal((await api.delete(`/api/groups/${g.id}/members/${bia.user.id}`).set(ana.auth)).status, 204);
    assert.equal((await api.delete(`/api/groups/${g.id}`).set(ana.auth)).status, 204);
  });
});

describe('documentos', () => {
  test('rejeita arquivo que não é PDF, vazio ou sem texto', async () => {
    const ana = await signup('Ana');
    const g = (await api.post('/api/groups').set(ana.auth).send({ name: 'Turma' })).body.group;
    assert.equal((await uploadPdf(g.id, ana.auth, Buffer.from('isto não é um pdf'), { name: 'x.pdf' })).status, 400);
    assert.equal((await uploadPdf(g.id, ana.auth, Buffer.alloc(0))).status, 400);
    const blank = await uploadPdf(g.id, ana.auth, await makePdf(['']));
    const doc = await waitReady(g.id, ana.auth, blank.body.document.id);
    assert.equal(doc.status, 'error');
    assert.match(doc.error, /texto extraível/);
  });

  test('processa PDF, evita duplicado e respeita a visibilidade privada', async () => {
    const ana = await signup('Ana');
    const bia = await signup('Bia');
    const { groupId, docId, inviteCode } = await groupWithDoc(ana, { visibility: 'private' });
    await api.post('/api/groups/join').set(bia.auth).send({ code: inviteCode });

    const mine = (await api.get(`/api/groups/${groupId}/documents`).set(ana.auth)).body.documents;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].pageCount, 2);
    assert.ok(mine[0].chunkCount >= 2);
    assert.equal((await api.get(`/api/groups/${groupId}/documents`).set(bia.auth)).body.documents.length, 0, 'privado não aparece para a Bia');
    assert.equal((await api.patch(`/api/documents/${docId}`).set(bia.auth).send({ visibility: 'group' })).status, 404);

    assert.equal((await uploadPdf(groupId, ana.auth, await makePdf(SO_PAGES), { visibility: 'private' })).status, 409);

    assert.equal((await api.patch(`/api/documents/${docId}`).set(ana.auth).send({ visibility: 'group' })).status, 200);
    assert.equal((await api.get(`/api/groups/${groupId}/documents`).set(bia.auth)).body.documents.length, 1);
  });

  test('autor e dono podem excluir; outro membro não', async () => {
    const ana = await signup('Ana');
    const bia = await signup('Bia');
    const { groupId, inviteCode } = await groupWithDoc(bia, {});
    await api.post('/api/groups/join').set(ana.auth).send({ code: inviteCode });
    const docs = (await api.get(`/api/groups/${groupId}/documents`).set(ana.auth)).body.documents;
    assert.equal(docs[0].canDelete, false);
    assert.equal((await api.delete(`/api/documents/${docs[0].id}`).set(ana.auth)).status, 403);
    assert.equal((await api.delete(`/api/documents/${docs[0].id}`).set(bia.auth)).status, 204);
  });
});

describe('perguntas (RAG)', () => {
  test('responde com fonte (arquivo e página) e recusa pergunta fora do material', async () => {
    const ana = await signup('Ana');
    const { groupId } = await groupWithDoc(ana);
    const ok = await api.post(`/api/groups/${groupId}/ask`).set(ana.auth).send({ question: 'O que é uma thread?' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.found, true);
    assert.equal(ok.body.sources[0].filename, 'aula.pdf');
    assert.equal(ok.body.sources[0].page, 1);
    assert.match(ok.body.sources[0].snippet, /thread/i);

    const rr = await api.post(`/api/groups/${groupId}/ask`).set(ana.auth).send({ question: 'Como funciona o algoritmo Round Robin?' });
    assert.equal(rr.body.found, true);
    assert.equal(rr.body.sources[0].page, 2);

    const out = await api.post(`/api/groups/${groupId}/ask`).set(ana.auth).send({ question: 'Qual é a capital da França?' });
    assert.equal(out.body.found, false);
    assert.deepEqual(out.body.sources, []);
    assert.match(out.body.answer, /Não encontrei/);

    const hist = await api.get(`/api/groups/${groupId}/history`).set(ana.auth);
    assert.equal(hist.body.history.length, 3);
  });

  test('sem documentos prontos, avisa em vez de chamar a IA', async () => {
    const ana = await signup('Ana');
    const g = (await api.post('/api/groups').set(ana.auth).send({ name: 'Vazio' })).body.group;
    const res = await api.post(`/api/groups/${g.id}/ask`).set(ana.auth).send({ question: 'O que é thread?' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Nenhum documento/);
  });

  test('a busca respeita a visibilidade: documento privado de outro membro não vira fonte', async () => {
    const ana = await signup('Ana');
    const bia = await signup('Bia');
    const { groupId, inviteCode } = await groupWithDoc(ana, { visibility: 'private' });
    await api.post('/api/groups/join').set(bia.auth).send({ code: inviteCode });
    const bPdf = await uploadPdf(groupId, bia.auth, await makePdf(['Normalização de bancos de dados organiza tabelas para reduzir redundância e anomalias de atualização.']), { name: 'bd.pdf' });
    await waitReady(groupId, bia.auth, bPdf.body.document.id);

    const res = await api.post(`/api/groups/${groupId}/ask`).set(bia.auth).send({ question: 'O que é uma thread?' });
    assert.equal(res.body.found, false, 'Bia não pode ver o conteúdo privado da Ana');
    const ana2 = await api.post(`/api/groups/${groupId}/ask`).set(ana.auth).send({ question: 'O que é uma thread?' });
    assert.equal(ana2.body.found, true);
  });

  test('filtra por documento e valida a pergunta', async () => {
    const ana = await signup('Ana');
    const { groupId, docId } = await groupWithDoc(ana);
    const ok = await api.post(`/api/groups/${groupId}/ask`).set(ana.auth).send({ question: 'O que é uma thread?', documentId: docId });
    assert.equal(ok.body.found, true);
    assert.equal((await api.post(`/api/groups/${groupId}/ask`).set(ana.auth).send({ question: 'ok', documentId: docId })).status, 400);
    assert.equal((await api.post(`/api/groups/${groupId}/ask`).set(ana.auth).send({ question: 'O que é thread?', documentId: '00000000-0000-4000-8000-000000000000' })).status, 404);
  });

  test('documento indexado com outro modelo de IA não entra na busca até reindexar', async () => {
    const ana = await signup('Ana');
    const { groupId, docId } = await groupWithDoc(ana);
    const { query } = await import('../src/db/pool.js');
    await query(`UPDATE documents SET embedding_model = 'outro:modelo:768' WHERE id = $1`, [docId]);
    const docs = (await api.get(`/api/groups/${groupId}/documents`).set(ana.auth)).body.documents;
    assert.equal(docs[0].outdated, true);
    assert.equal((await api.post(`/api/groups/${groupId}/ask`).set(ana.auth).send({ question: 'O que é thread?' })).status, 400);
    assert.equal((await api.post(`/api/documents/${docId}/reindex`).set(ana.auth)).status, 202);
    const fresh = await waitReady(groupId, ana.auth, docId);
    assert.equal(fresh.outdated, false);
    assert.equal((await api.post(`/api/groups/${groupId}/ask`).set(ana.auth).send({ question: 'O que é thread?' })).body.found, true);
  });
});

describe('resumo e quiz', () => {
  test('gera resumo com páginas consideradas', async () => {
    const ana = await signup('Ana');
    const { groupId } = await groupWithDoc(ana);
    const res = await api.post(`/api/groups/${groupId}/summary`).set(ana.auth).send({});
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.content.length > 20);
    assert.ok(res.body.sources.length >= 1);
  });

  test('quiz: não vaza gabarito, corrige a tentativa e monta o ranking do grupo', async () => {
    const ana = await signup('Ana');
    const bia = await signup('Bia');
    const { groupId, inviteCode } = await groupWithDoc(ana);
    await api.post('/api/groups/join').set(bia.auth).send({ code: inviteCode });

    const created = await api.post(`/api/groups/${groupId}/quizzes`).set(ana.auth).send({ count: 3 });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const quizId = created.body.quiz.id;
    const n = created.body.quiz.questionCount;

    const taking = await api.get(`/api/quizzes/${quizId}`).set(bia.auth);
    assert.equal(taking.body.quiz.questions.length, n);
    assert.equal(taking.body.quiz.questions[0].correctIndex, undefined, 'gabarito não pode vir antes da resposta');

    const wrong = await api.post(`/api/quizzes/${quizId}/attempts`).set(bia.auth).send({ answers: Array(n).fill(null) });
    assert.equal(wrong.body.score, 0);
    // descobre o gabarito pela correção e refaz com tudo certo
    const perfect = await api.post(`/api/quizzes/${quizId}/attempts`).set(ana.auth).send({ answers: wrong.body.results.map((r) => r.correctIndex) });
    assert.equal(perfect.body.score, n);

    const rank = (await api.get(`/api/groups/${groupId}/ranking`).set(ana.auth)).body.ranking;
    assert.deepEqual(rank.map((r) => [r.name, r.points]), [['Ana', n], ['Bia', 0]]);
    assert.equal((await api.post(`/api/quizzes/${quizId}/attempts`).set(ana.auth).send({ answers: [0] })).status, 400);
  });

  test('quiz usa só documentos compartilhados (nunca os privados)', async () => {
    const ana = await signup('Ana');
    const { groupId } = await groupWithDoc(ana, { visibility: 'private' });
    const res = await api.post(`/api/groups/${groupId}/quizzes`).set(ana.auth).send({ count: 3 });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /compartilhado/);
  });
});
