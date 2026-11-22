import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox } from '../ui.jsx';

export default function ReviewSchedule({ quiz, graded }) {
  const missed = graded.results.map((r, i) => ({ ...r, index: i })).filter(r => !r.correct);
  const [open, setOpen] = useState(false), [date, setDate] = useState('');
  const [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState('');
  if (!missed.length) return null;
  const schedule = async e => {
    e.preventDefault(); setError('');
    const at = new Date(date);
    if (!Number.isFinite(at.getTime()) || at <= new Date()) { setError('Escolha uma data e horário futuros.'); return; }
    setBusy(true);
    try {
      const details = 'Revisar questões ' + missed.map(r => r.index + 1).join(', ') + '.\n' + missed.map(r => `${r.index + 1}. ${quiz.questions[r.index].question}`).join('\n');
      await api('/planner', { method: 'POST', body: {
        title: `Revisar: ${quiz.title}`.slice(0, 160), details: details.slice(0, 500), kind: 'study',
        scheduledAt: at.toISOString(), repeatType: 'none', repeatDays: [], alertMinutesBefore: 10,
        timezoneOffsetMinutes: at.getTimezoneOffset(),
      } });
      setSaved(true);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <section className="card stack" aria-label="Revisão do simulado">
    <h3>Revisar as questões que faltaram</h3>
    {saved ? <p role="status">Revisão agendada no seu Planner. <Link to="/planner">Abrir Planner</Link></p> : <>
      <p>{missed.length} questão(ões) incorreta(s) ou em branco. Crie um compromisso pessoal para retomar esses pontos.</p>
      {!open ? <button type="button" onClick={() => setOpen(true)}>Agendar revisão dos erros</button> : <form className="stack" onSubmit={schedule}>
        <p>Questões: {missed.map(r => r.index + 1).join(', ')}.</p>
        <label className="field"><span>Data e horário da revisão</span><input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} required disabled={busy}/></label>
        <small className="muted">O aviso aparece no aplicativo, 10 minutos antes. A revisão será salva somente após sua confirmação.</small>
        <ErrorBox error={error}/><button className="primary" disabled={busy}>{busy ? 'Salvando…' : 'Confirmar revisão'}</button>
      </form>}
    </>}
  </section>;
}
