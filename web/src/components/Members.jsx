import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Empty, ErrorBox, useAction } from '../ui.jsx';

export default function Members({ group, members, reload }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ranking, setRanking] = useState([]);
  const [copied, setCopied] = useState(false);
  const act = useAction();
  const isOwner = group.role === 'owner';

  useEffect(() => { api(`/groups/${group.id}/ranking`).then((d) => setRanking(d.ranking)).catch(() => {}); }, [group.id]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(group.invite_code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignora */ }
  };
  const rotate = () => act.run(async () => { await api(`/groups/${group.id}/invite/rotate`, { method: 'POST' }); await reload(); });
  const remove = (m) => window.confirm(`Remover ${m.name} do grupo?`) && act.run(async () => { await api(`/groups/${group.id}/members/${m.id}`, { method: 'DELETE' }); await reload(); });
  const leave = () => window.confirm('Sair deste grupo? Seus documentos privados serão apagados.') && act.run(async () => { await api(`/groups/${group.id}/leave`, { method: 'POST' }); navigate('/'); });
  const destroy = () => window.confirm('Excluir o grupo e TODOS os documentos dele? Isso não pode ser desfeito.') && act.run(async () => { await api(`/groups/${group.id}`, { method: 'DELETE' }); navigate('/'); });

  return (
    <>
      <div className="card stack">
        <h2>Convidar amigos</h2>
        <p className="muted">Quem tiver o código entra no grupo e passa a ver os documentos compartilhados.</p>
        <div className="row">
          <code className="invite">{group.invite_code}</code>
          <button onClick={copy}>{copied ? 'Copiado!' : 'Copiar'}</button>
          {isOwner && <button className="link" onClick={rotate}>Gerar novo código</button>}
        </div>
      </div>

      <h2>Ranking dos quizzes</h2>
      {ranking.length === 0 ? <Empty>Ninguém respondeu um quiz ainda.</Empty> : (
        <table className="table">
          <thead><tr><th>#</th><th>Aluno</th><th>Pontos</th><th>Quizzes</th></tr></thead>
          <tbody>{ranking.map((r, i) => <tr key={r.id}><td>{i + 1}</td><td>{r.name}{r.id === user.id && ' (você)'}</td><td>{r.points}/{r.possible}</td><td>{r.quizzes}</td></tr>)}</tbody>
        </table>
      )}

      <h2>Membros</h2>
      <ErrorBox error={act.error} />
      <ul className="doclist">
        {members.map((m) => (
          <li key={m.id} className="card doc">
            <div className="doc-main"><strong>{m.name}</strong> {m.role === 'owner' && <Badge tone="accent">dono</Badge>}</div>
            {isOwner && m.id !== user.id && <button className="link danger-text" onClick={() => remove(m)}>Remover</button>}
          </li>
        ))}
      </ul>

      <div className="row end">
        {isOwner ? <button className="danger" onClick={destroy}>Excluir grupo</button> : <button className="danger" onClick={leave}>Sair do grupo</button>}
      </div>
    </>
  );
}
