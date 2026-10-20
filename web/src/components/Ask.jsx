import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { DocSelect, Empty, ErrorBox, RichText, Sources, Spinner, useAction } from '../ui.jsx';

export default function Ask({ groupId, docs }) {
  const [question, setQuestion] = useState('');
  const [documentId, setDocumentId] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [debug, setDebug] = useState(false);
  const { busy, error, run } = useAction();

  const loadHistory = () => api(`/groups/${groupId}/history`).then((d) => setHistory(d.history)).catch(() => {});
  useEffect(() => { loadHistory(); }, [groupId]);

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      setResult(await api(`/groups/${groupId}/ask`, { method: 'POST', body: { question, documentId } }));
      setQuestion('');
      loadHistory();
    });
  };

  if (docs.length === 0) return <Empty>Nenhum documento pronto. Envie um PDF na aba Biblioteca e aguarde o processamento.</Empty>;

  return (
    <>
      <form className="card stack" onSubmit={submit}>
        <DocSelect docs={docs} value={documentId} onChange={setDocumentId} />
        <label className="field"><span>Sua pergunta</span>
          <textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ex.: Qual é a diferença entre processo e thread?" required minLength={3} maxLength={1000} />
        </label>
        <ErrorBox error={error} />
        <div className="row">
          <button className="primary" disabled={busy || question.trim().length < 3}>{busy ? 'Buscando…' : 'Perguntar'}</button>
          <label className="check"><input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} /> modo diagnóstico</label>
        </div>
      </form>

      {busy && <Spinner label="Buscando nos documentos e gerando a resposta…" />}
      {result && !busy && (
        <div className={`card answer ${result.found ? '' : 'notfound'}`}>
          <h3>{result.question}</h3>
          <RichText text={result.answer} />
          <Sources sources={result.sources} />
          {debug && <pre className="debug">{JSON.stringify(result.diagnostics, null, 2)}</pre>}
        </div>
      )}

      {history.length > 0 && (
        <>
          <h2>Seu histórico neste grupo</h2>
          {history.map((h) => (
            <details key={h.id} className="card history">
              <summary>{h.question}</summary>
              <RichText text={h.answer} />
              <Sources sources={h.sources} />
            </details>
          ))}
        </>
      )}
    </>
  );
}
