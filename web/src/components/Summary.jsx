import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { DocSelect, Empty, ErrorBox, RichText, Spinner, useAction } from '../ui.jsx';

export default function Summary({ groupId, docs }) {
  const [documentId, setDocumentId] = useState(null);
  const [items, setItems] = useState([]);
  const { busy, error, run } = useAction();

  const load = () => api(`/groups/${groupId}/summaries`).then((d) => setItems(d.summaries)).catch(() => {});
  useEffect(() => { load(); }, [groupId]);

  const generate = () => run(async () => {
    await api(`/groups/${groupId}/summary`, { method: 'POST', body: { documentId } });
    await load();
  });

  if (docs.length === 0) return <Empty>Nenhum documento pronto para resumir.</Empty>;

  return (
    <>
      <div className="card stack">
        <DocSelect docs={docs} value={documentId} onChange={setDocumentId} />
        <ErrorBox error={error} />
        <button className="primary" onClick={generate} disabled={busy}>{busy ? 'Gerando…' : 'Gerar resumo'}</button>
      </div>
      {busy && <Spinner label="Gerando o resumo…" />}
      {items.map((s) => (
        <div key={s.id} className="card">
          <RichText text={s.content} />
          <p className="muted small">Páginas consideradas: {s.sources.map((x) => `${x.filename} p.${x.page}`).join(', ')}</p>
        </div>
      ))}
    </>
  );
}
