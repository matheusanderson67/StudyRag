import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import Ask from '../components/Ask.jsx';
import Tutor from '../components/Tutor.jsx';
import Dashboard from '../components/Dashboard.jsx';
import MindMap from '../components/MindMap.jsx';
import Library from '../components/Library.jsx';
import Members from '../components/Members.jsx';
import Quiz from '../components/Quiz.jsx';
import Summary from '../components/Summary.jsx';
import Icon from '../components/Icon.jsx';
import { ErrorBox, Spinner } from '../ui.jsx';

const TABS = [
  { id:'inicio', label:'Visão geral', icon:'home' },
  { id:'biblioteca', label:'Biblioteca', icon:'file' },
  { id:'professor', label:'Professor IA', icon:'bot', badge:'NOVO' },
  { id:'perguntar', label:'Perguntas RAG', icon:'chat' },
  { id:'quiz', label:'Simulados', icon:'quiz' },
  { id:'dashboard', label:'Desempenho', icon:'chart' },
  { id:'mapa', label:'Mapas mentais', icon:'network' },
  { id:'resumo', label:'Resumos', icon:'books' },
  { id:'membros', label:'Equipe e ranking', icon:'users' },
];

export default function Group() {
  const { groupId } = useParams();
  const [data, setData] = useState(null);
  const [docs, setDocs] = useState(null);
  const [tab, setTab] = useState('inicio');
  const [error, setError] = useState('');
  const loadGroup = useCallback(() => api(`/groups/${groupId}`).then(setData).catch((e)=>setError(e.message)), [groupId]);
  const loadDocs = useCallback(() => api(`/groups/${groupId}/documents`).then((d)=>setDocs(d.documents)).catch((e)=>setError(e.message)), [groupId]);
  useEffect(()=>{loadGroup();loadDocs();},[loadGroup,loadDocs]);
  useEffect(()=>{if(!docs?.some(d=>d.status==='processing'))return;const t=setInterval(loadDocs,2500);return()=>clearInterval(t)},[docs,loadDocs]);
  if (error && !data) return <><ErrorBox error={error}/><Link to="/">← Voltar aos grupos</Link></>;
  if (!data || !docs) return <Spinner label="Carregando grupo de estudos…"/>;
  const { group, members } = data;
  const readyDocs = docs.filter(d=>d.status==='ready' && !d.outdated);
  const active = TABS.find(t=>t.id===tab);
  const features=[
    {id:'professor',name:'Professor particular',desc:'Entenda os assuntos no seu ritmo, com a ajuda da IA.',icon:'bot',cls:'purple'},
    {id:'quiz',name:'Simulado inteligente',desc:'Treine com questões extraídas dos materiais.',icon:'quiz',cls:'blue'},
    {id:'mapa',name:'Mapa mental',desc:'Conecte conceitos de um jeito visual.',icon:'network',cls:'orange'},
    {id:'dashboard',name:'Meu desempenho',desc:'Acompanhe sua evolução a cada simulado.',icon:'chart',cls:'green'},
  ];
  return <>
    <Link to="/" className="back-link"><Icon name="back" size={16}/> Todos os grupos</Link>
    <div className="group-head"><div className="group-avatar"><Icon name="books" size={28}/></div><div className="group-head-info"><span className="eyebrow">AMBIENTE DE APRENDIZAGEM</span><h1>{group.name}</h1><p>{[group.subject,group.period].filter(Boolean).join(' · ') || 'Seu espaço de estudos'}{group.description && ` · ${group.description}`}</p></div><span className="head-role">{group.role==='owner'?'Administrador':'Membro'}</span></div>
    <div className="group-summary">
      <div><span className="summary-mini-icon blue"><Icon name="file"/></span><strong>{readyDocs.length}</strong><small>Materiais prontos</small></div>
      <div><span className="summary-mini-icon purple"><Icon name="users"/></span><strong>{members.length}</strong><small>Participantes</small></div>
      <div><span className="summary-mini-icon green"><Icon name="spark"/></span><strong>4</strong><small>Ferramentas IA</small></div>
    </div>
    <div className="workspace-layout"><nav className="workspace-nav" aria-label="Ferramentas de estudo"><div className="workspace-nav-title">SEU ESPAÇO</div>{TABS.map(item=><button key={item.id} className={`workspace-tab ${tab===item.id?'active':''}`} onClick={()=>setTab(item.id)} aria-current={tab===item.id?'page':undefined}><Icon name={item.icon} size={19}/><span>{item.label}</span>{item.badge&&<small className="new-badge">{item.badge}</small>}</button>)}</nav>
      <section className="workspace-panel" aria-label={active.label}>
        {tab==='inicio' && <><div className="panel-title"><span className="eyebrow">VAMOS COMEÇAR?</span><h2>Seu aprendizado começa aqui <span>✦</span></h2><p>Escolha uma ferramenta e transforme seus documentos em conhecimento.</p></div><div className="feature-grid">{features.map(f=><button className="feature-card" key={f.id} onClick={()=>setTab(f.id)}><span className={`feature-icon ${f.cls}`}><Icon name={f.icon} size={25}/></span><strong>{f.name}</strong><span>{f.desc}</span><div className="feature-card-bottom">Explorar ferramenta <Icon name="arrow" size={17}/></div></button>)}</div><div className="notice-panel"><Icon name="file" size={24}/><div><strong>Comece enviando seus arquivos</strong><p>Envie seus PDFs na biblioteca para que a IA possa estudar com você usando o conteúdo certo.</p></div><button onClick={()=>setTab('biblioteca')}>Abrir biblioteca <Icon name="arrow" size={16}/></button></div></>}
        {tab==='biblioteca'&&<Library groupId={groupId} docs={docs} reload={loadDocs}/>}
        {tab==='perguntar'&&<Ask groupId={groupId} docs={readyDocs}/>}
        {tab==='professor'&&<Tutor groupId={groupId} docs={readyDocs}/>}
        {tab==='dashboard'&&<Dashboard groupId={groupId}/>}
        {tab==='mapa'&&<MindMap groupId={groupId} docs={readyDocs}/>}
        {tab==='resumo'&&<Summary groupId={groupId} docs={readyDocs}/>}
        {tab==='quiz'&&<Quiz groupId={groupId} docs={readyDocs.filter(d=>d.visibility==='group')}/>}
        {tab==='membros'&&<Members group={group} members={members} reload={loadGroup}/>}
      </section></div>
  </>;
}
