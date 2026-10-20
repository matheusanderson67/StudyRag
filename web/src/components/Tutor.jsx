import { useState } from 'react';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { DocSelect, ErrorBox, Spinner, RichText, Sources } from '../ui.jsx';

const levels=[{id:'basico',name:'Básico',desc:'Linguagem simples'},{id:'intermediario',name:'Intermediário',desc:'Mais contexto'},{id:'avancado',name:'Avançado',desc:'Aprofundado'}];
const styles=[{id:'explicacao',name:'Explicação',icon:'books'},{id:'exemplos',name:'Exemplos',icon:'spark'},{id:'passo',name:'Passo a passo',icon:'target'},{id:'exercicios',name:'Exercícios',icon:'quiz'}];
const prompts=['Explique o conceito principal do material','Faça uma analogia para eu entender melhor','Me ajude a revisar para a prova'];

export default function Tutor({groupId,docs}) {
  const [question,setQuestion]=useState('');
  const [documentId,setDocumentId]=useState(null);
  const [level,setLevel]=useState('basico');
  const [style,setStyle]=useState('explicacao');
  const [result,setResult]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function submit(e){e.preventDefault();setBusy(true);setError('');try{setResult(await api(`/groups/${groupId}/tutor`,{method:'POST',body:{question,documentId,level,style}}));}catch(e){setError(e.message)}finally{setBusy(false)}}
  return <div className="stack ai-tool"><div className="tool-heading"><div className="tool-heading-icon purple"><Icon name="bot" size={26}/></div><div><span className="eyebrow">SEU MENTOR DE ESTUDOS</span><h2>Professor particular com IA</h2><p>Tire dúvidas, peça exemplos e aprenda direto dos seus PDFs.</p></div></div><form className="card tutor-form stack" onSubmit={submit}><DocSelect docs={docs} value={documentId} onChange={setDocumentId} label="Escolha o material de estudo"/><div className="form-divider"/><div><label className="field-label">Qual nível de explicação você prefere?</label><div className="choice-grid">{levels.map(l=><button type="button" key={l.id} className={`choice-card ${level===l.id?'chosen':''}`} onClick={()=>setLevel(l.id)}><strong>{l.name}</strong><small>{l.desc}</small></button>)}</div></div><div><label className="field-label">Como você quer aprender?</label><div className="style-choices">{styles.map(s=><button type="button" key={s.id} className={`style-chip ${style===s.id?'chosen':''}`} onClick={()=>setStyle(s.id)}><Icon name={s.icon} size={17}/>{s.name}</button>)}</div></div><label className="field"><span>Sua pergunta</span><textarea rows={4} value={question} onChange={e=>setQuestion(e.target.value)} required minLength={3} maxLength={1000} placeholder="Digite o conteúdo que você gostaria de entender melhor…"/></label><div className="prompt-suggestions"><small>EXPERIMENTE PERGUNTAR</small><div>{prompts.map(text=><button type="button" key={text} onClick={()=>setQuestion(text)}>{text} <Icon name="arrow" size={14}/></button>)}</div></div><ErrorBox error={error}/><button className="primary generate-button" disabled={busy||question.trim().length<3||!docs.length}><Icon name="spark" size={19}/>{busy?'Preparando explicação…':'Gerar explicação'}<Icon name="arrow" size={19}/></button>{!docs.length&&<p className="muted small">Envie pelo menos um PDF pronto na Biblioteca para começar.</p>}</form>{busy&&<Spinner label="O professor está estudando seus materiais…"/>}{result&&!busy&&<div className="card tutor-response"><div className="response-heading"><span className="response-avatar"><Icon name="bot" size={22}/></span><div><strong>Seu professor respondeu</strong><small>Explicação baseada no material selecionado</small></div><span className="response-verified"><Icon name="check" size={14}/> Com fontes</span></div><RichText text={result.answer}/><Sources sources={result.sources}/></div>}</div>;
}
