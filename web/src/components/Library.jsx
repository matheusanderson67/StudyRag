import { useRef, useState } from 'react';
import { api } from '../api.js';
import { Badge, Empty, ErrorBox, useAction } from '../ui.jsx';

const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function StatusBadge({ doc }) {
  if (doc.status === 'processing') return <Badge tone="warn">processando…</Badge>;
  if (doc.status === 'error') return <Badge tone="danger">erro</Badge>;
  if (doc.outdated) return <Badge tone="warn">reindexar</Badge>;
  return <Badge tone="ok">pronto</Badge>;
}

export default function Library({ groupId, docs, reload, personal = false }) {
  const fileRef = useRef(null);
  const [visibility, setVisibility] = useState('group');
  const upload = useAction();
  const act = useAction();

  const send = (e) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return upload.run(async () => { throw new Error('Escolha um arquivo PDF.'); });
    upload.run(async () => {
      const body = new FormData();
      body.append('visibility', personal ? 'group' : visibility);
      body.append('file', file);
      await api(`/groups/${groupId}/documents`, { method: 'POST', body });
      fileRef.current.value = '';
      await reload();
    });
  };

  const doAction = (fn) => act.run(async () => { await fn(); await reload(); });
  const toggle = (d) => doAction(() => api(`/documents/${d.id}`, { method: 'PATCH', body: { visibility: d.visibility === 'group' ? 'private' : 'group' } }));
  const reindex = (d) => doAction(() => api(`/documents/${d.id}/reindex`, { method: 'POST' }));
  const remove = (d) => window.confirm(`Excluir "${d.filename}"?`) && doAction(() => api(`/documents/${d.id}`, { method: 'DELETE' }));

  return (
    <>
      <form className="card stack" onSubmit={send}>
        <h2>Enviar PDF</h2>
        <div className="row wrap">
          <label className="field grow"><span>Arquivo (PDF com texto)</span><input ref={fileRef} type="file" accept="application/pdf,.pdf" /></label>
          {!personal && <label className="field"><span>Quem pode usar</span>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="group">Todo o grupo</option>
              <option value="private">Só eu</option>
            </select>
          </label>}
        </div>
        {personal ? <small className="muted">Biblioteca individual: seus arquivos só podem ser acessados por você.</small> : <small className="muted">Documentos "só eu" servem para suas perguntas e resumos, mas não aparecem para o grupo nem entram nos quizzes.</small>}
        <ErrorBox error={upload.error} />
        <button className="primary" disabled={upload.busy}>{upload.busy ? 'Enviando…' : 'Enviar'}</button>
      </form>

      <h2>Documentos</h2>
      <ErrorBox error={act.error} />
      {docs.length === 0 ? <Empty>Nenhum documento ainda. Envie o primeiro PDF acima.</Empty> : (
        <ul className="doclist">
          {docs.map((d) => (
            <li key={d.id} className="card doc">
              <div className="doc-main">
                <strong>{d.filename}</strong>
                <div className="row wrap">
                  <StatusBadge doc={d} />
                  <Badge tone={d.visibility === 'group' ? 'accent' : 'neutral'}>{personal ? 'individual' : d.visibility === 'group' ? 'grupo' : 'privado'}</Badge>
                  <span className="muted">{fmtSize(d.sizeBytes)}{d.pageCount ? ` · ${d.pageCount} páginas · ${d.chunkCount} trechos` : ''} · enviado por {d.mine ? 'você' : d.uploaderName}</span>
                </div>
                {d.status === 'error' && <small className="danger-text">{d.error}</small>}
                {d.outdated && <small className="muted">Este PDF foi indexado com outro modelo de IA. Reindexe para voltar a usá-lo nas respostas.</small>}
              </div>
              <div className="doc-actions">
                {!personal && d.mine && d.status === 'ready' && <button className="link" onClick={() => toggle(d)}>{d.visibility === 'group' ? 'Tornar privado' : 'Compartilhar'}</button>}
                {d.canDelete && (d.outdated || d.status === 'error') && <button className="link" onClick={() => reindex(d)}>Reindexar</button>}
                {d.canDelete && <button className="link danger-text" onClick={() => remove(d)}>Excluir</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
