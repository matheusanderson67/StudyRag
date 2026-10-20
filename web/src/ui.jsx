import { useState } from 'react';

export const Spinner = ({ label = 'Carregando…' }) => <div className="spinner" role="status"><span className="dot" />{label}</div>;

export const ErrorBox = ({ error }) => (error ? <div className="alert error" role="alert">{error}</div> : null);

export const Empty = ({ children }) => <p className="empty">{children}</p>;

export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

/** Renderização mínima de texto da IA: parágrafos e listas com "-", "*" ou "•". Sem HTML cru (evita XSS). */
export function RichText({ text }) {
  const blocks = [];
  let list = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const item = line.match(/^[-*•]\s+(.*)/);
    if (item) {
      if (!list) { list = []; blocks.push({ list }); }
      list.push(item[1]);
    } else {
      list = null;
      if (line) blocks.push({ p: line });
    }
  }
  const bold = (s) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
  return (
    <div className="richtext">
      {blocks.map((b, i) => (b.list ? <ul key={i}>{b.list.map((li, j) => <li key={j}>{bold(li)}</li>)}</ul> : <p key={i}>{bold(b.p)}</p>))}
    </div>
  );
}

export function Sources({ sources }) {
  if (!sources?.length) return null;
  return (
    <div className="sources">
      <h4>Fontes utilizadas</h4>
      {sources.map((s, i) => (
        <details key={i}>
          <summary>
            <strong>{s.filename}</strong> — página {s.page}
            {s.uploader && <span className="muted"> · enviado por {s.uploader}</span>}
            {s.similarity != null && <span className="muted"> · similaridade {s.similarity}</span>}
          </summary>
          <blockquote>{s.snippet}</blockquote>
        </details>
      ))}
    </div>
  );
}

export function DocSelect({ docs, value, onChange, label = 'Material' }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Todos os documentos disponíveis</option>
        {docs.map((d) => <option key={d.id} value={d.id}>{d.filename}</option>)}
      </select>
    </label>
  );
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn) => {
    setBusy(true);
    setError('');
    try { return await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return { busy, error, run, setError };
}
