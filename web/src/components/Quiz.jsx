import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, DocSelect, Empty, ErrorBox, Spinner, useAction } from '../ui.jsx';
import Icon from './Icon.jsx';

function Play({ quizId, onDone }) {
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [graded, setGraded] = useState(null);
  const [remaining,setRemaining]=useState(null);
  const { busy, error, run } = useAction();

  useEffect(() => {
    api(`/quizzes/${quizId}`).then((d) => { setQuiz(d.quiz); setRemaining(d.quiz.minutes*60); setAnswers(Array(d.quiz.questions.length).fill(null)); });
  }, [quizId]);

  useEffect(()=>{if(remaining===null||graded||remaining<=0)return;const t=setTimeout(()=>setRemaining(n=>Math.max(0,n-1)),1000);return()=>clearTimeout(t)},[remaining,graded]);
  if (!quiz) return <Spinner />;
  const answered = answers.filter(a => a !== null).length;
  const submit = () => run(async () => { setGraded(await api(`/quizzes/${quizId}/attempts`, { method: 'POST', body: { answers } })); });

  return (
    <div className="stack">
      <div className="quiz-playing-top"><div><span className="eyebrow">SIMULADO EM ANDAMENTO</span><h2>{quiz.title}</h2><small>{answered} de {quiz.questions.length} questões respondidas</small></div><span className={`quiz-clock ${remaining<=60?'warning':''}`}><Icon name="clock" size={17}/> {Math.floor((remaining??0)/60)}:{String((remaining??0)%60).padStart(2,'0')}</span></div><div className="quiz-progress"><div style={{width:`${Math.round(answered/quiz.questions.length*100)}%`}}/></div>{remaining===0&&!graded&&<p className="alert">Tempo esgotado! Envie suas respostas.</p>}
      {graded && <div className="alert ok"><strong>Você acertou {graded.score} de {graded.total}.</strong> {graded.score === graded.total ? 'Perfeito!' : 'Veja os comentários abaixo.'}</div>}
      {quiz.questions.map((q, i) => (
        <fieldset key={i} className="card question" disabled={Boolean(graded)}>
          <legend>{i + 1}. {q.question}</legend>
          {q.options.map((opt, j) => {
            const r = graded?.results[i];
            const cls = r ? (j === r.correctIndex ? 'right' : j === r.chosen ? 'wrong' : '') : '';
            return (
              <label key={j} className={`option ${cls}`}>
                <input type="radio" name={`q${i}`} checked={answers[i] === j} onChange={() => setAnswers(answers.map((a, k) => (k === i ? j : a)))} />
                <span>{opt}</span>
              </label>
            );
          })}
          {graded && <small className="muted">{graded.results[i].explanation}{graded.results[i].page ? ` (página ${graded.results[i].page})` : ''}</small>}
        </fieldset>
      ))}
      <ErrorBox error={error} />
      <div className="row">
        {!graded && <button className="primary" onClick={submit} disabled={busy}>Enviar respostas</button>}
        <button onClick={onDone}>{graded ? 'Voltar aos quizzes' : 'Cancelar'}</button>
      </div>
    </div>
  );
}

export default function Quiz({ groupId, docs }) {
  const [quizzes, setQuizzes] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [documentId, setDocumentId] = useState(null);
  const [count, setCount] = useState(10);
  const [difficulty,setDifficulty]=useState('medio');
  const [minutes,setMinutes]=useState(30);
  const { busy, error, run } = useAction();

  const load = () => api(`/groups/${groupId}/quizzes`).then((d) => setQuizzes(d.quizzes)).catch(() => setQuizzes([]));
  useEffect(() => { load(); }, [groupId]);

  const create = () => run(async () => {
    const { quiz } = await api(`/groups/${groupId}/quizzes`, { method: 'POST', body: { documentId, count, difficulty, minutes } });
    await load();
    setPlaying(quiz.id);
  });

  if (playing) return <Play quizId={playing} onDone={() => { setPlaying(null); load(); }} />;

  return (
    <div className="stack">
      <div className="tool-heading"><div className="tool-heading-icon blue"><Icon name="quiz" size={26}/></div><div><span className="eyebrow">APRENDA PRATICANDO</span><h2>Simulados inteligentes</h2><p>Treine o conteúdo dos seus PDFs com questões personalizadas.</p></div></div>
      <div className="card stack">
        <h3>Prepare um novo simulado</h3>
        {docs.length === 0 ? <Empty>Quizzes usam documentos compartilhados com o grupo. Envie um PDF com visibilidade "Todo o grupo".</Empty> : (
          <>
            <div className="row wrap">
              <div className="grow"><DocSelect docs={docs} value={documentId} onChange={setDocumentId} label="Material" /></div>
              <label className="field"><span>Questões</span>
                <select value={count} onChange={(e) => setCount(Number(e.target.value))}>{[10, 15, 20, 30].map((n) => <option key={n}>{n}</option>)}</select>
              </label>
            </div>
            <div className="row wrap"><label className="field"><span>Dificuldade</span><select value={difficulty} onChange={e=>setDifficulty(e.target.value)}><option value="facil">Fácil</option><option value="medio">Médio</option><option value="dificil">Difícil</option></select></label><label className="field"><span>Tempo (minutos)</span><select value={minutes} onChange={e=>setMinutes(Number(e.target.value))}>{[15,30,45,60,90].map(n=><option key={n}>{n}</option>)}</select></label></div>
            <ErrorBox error={error} />
            <button className="primary" onClick={create} disabled={busy}>{busy ? 'Gerando questões…' : 'Gerar quiz'}</button>
          </>
        )}
      </div>

      <h2>Quizzes do grupo</h2>
      {!quizzes ? <Spinner /> : quizzes.length === 0 ? <Empty>Nenhum quiz ainda.</Empty> : (
        <ul className="doclist">
          {quizzes.map((q) => (
            <li key={q.id} className="card doc">
              <div className="doc-main">
                <strong>{q.title}</strong>
                <span className="muted">criado por {q.createdByName}</span>
                {q.myBestScore != null && <Badge tone="ok">seu melhor: {q.myBestScore}/{q.questionCount}</Badge>}
              </div>
              <button className="primary" onClick={() => setPlaying(q.id)}>{q.myBestScore != null ? 'Tentar de novo' : 'Responder'}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
