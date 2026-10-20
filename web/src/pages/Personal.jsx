import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Ask from '../components/Ask.jsx';
import Tutor from '../components/Tutor.jsx';
import Dashboard from '../components/Dashboard.jsx';
import MindMap from '../components/MindMap.jsx';
import Library from '../components/Library.jsx';
import Quiz from '../components/Quiz.jsx';
import Summary from '../components/Summary.jsx';
import Icon from '../components/Icon.jsx';
import { ErrorBox, Spinner } from '../ui.jsx';

const tools = [
  ['inicio','Visão geral','home'],['biblioteca','Meus PDFs','file'],['professor','Professor IA','bot'],
  ['perguntar','Perguntas RAG','chat'],['quiz','Simulados','quiz'],['dashboard','Meu desempenho','chart'],
  ['mapa','Mapas mentais','network'],['resumo','Resumos','books'],
];

function PersonalWorkspace({ groupId }) {
  const [docs,setDocs]=useState(null);
  const [tab,setTab]=useState('inicio');
  const [error,setError]=useState('');
  const loadDocs=useCallback(()=>api(`/groups/${groupId}/documents`).then(d=>setDocs(d.documents)).catch(e=>setError(e.message)),[groupId]);
  useEffect(()=>{loadDocs();},[loadDocs]);
  useEffect(()=>{if (!docs?.some(d=>d.status==='processing')) return; const timer=setInterval(loadDocs,2500);return()=>clearInterval(timer);},[docs,loadDocs]);
  if (!docs) return <><ErrorBox error={error}/>{!error&&<Spinner label="Preparando seu espaço individual…"/>}</>;
  const ready=docs.filter(d=>d.status==='ready'&&!d.outdated);
  return <>
    <div className="group-head"><div className="group-avatar"><Icon name="books" size={28}/></div><div className="group-head-info"><span className="eyebrow">ESTUDO PARTICULAR</span><h1>Meu espaço individual</h1><p>Seus PDFs, suas dúvidas e seu progresso, em um ambiente privado.</p></div><span className="head-role">Só você</span></div>
    <div className="group-summary"><div><span className="summary-mini-icon blue"><Icon name="file"/></span><strong>{ready.length}</strong><small>Meus materiais prontos</small></div><div><span className="summary-mini-icon purple"><Icon name="bot"/></span><strong>IA</strong><small>Professor particular</small></div><div><span className="summary-mini-icon green"><Icon name="check"/></span><strong>100%</strong><small>Ambiente privado</small></div></div>
    <div className="workspace-layout"><nav className="workspace-nav" aria-label="Ferramentas individuais"><div className="workspace-nav-title">MEUS ESTUDOS</div>{tools.map(([id,label,icon])=><button key={id} className={`workspace-tab ${tab===id?'active':''}`} onClick={()=>setTab(id)} aria-current={tab===id?'page':undefined}><Icon name={icon} size={19}/><span>{label}</span></button>)}</nav>
      <section className="workspace-panel" aria-label={tools.find(t=>t[0]===tab)?.[1]}>
        {tab==='inicio'&&<><div className="panel-title"><span className="eyebrow">SEU AMBIENTE PRIVADO</span><h2>Aprenda no seu ritmo <span>✦</span></h2><p>Envie um PDF e use as mesmas ferramentas RAG dos grupos, agora só para você.</p></div><div className="feature-grid">{[['biblioteca','Meus materiais','Envie PDFs para a biblioteca privada.','file','blue'],['professor','Professor IA','Receba explicações com fontes.','bot','purple'],['quiz','Simulados','Teste seu conhecimento com seus PDFs.','quiz','orange'],['mapa','Mapa mental','Conecte conceitos dos seus arquivos.','network','green']].map(([id,name,desc,icon,cls])=><button key={id} className="feature-card" onClick={()=>setTab(id)}><span className={`feature-icon ${cls}`}><Icon name={icon} size={25}/></span><strong>{name}</strong><span>{desc}</span><div className="feature-card-bottom">Abrir ferramenta <Icon name="arrow" size={17}/></div></button>)}</div></>}
        {tab==='biblioteca'&&<Library groupId={groupId} docs={docs} reload={loadDocs} personal/>}
        {tab==='perguntar'&&<Ask groupId={groupId} docs={ready}/>}
        {tab==='professor'&&<Tutor groupId={groupId} docs={ready}/>}
        {tab==='dashboard'&&<Dashboard groupId={groupId}/>}
        {tab==='mapa'&&<MindMap groupId={groupId} docs={ready}/>}
        {tab==='resumo'&&<Summary groupId={groupId} docs={ready}/>}
        {tab==='quiz'&&<Quiz groupId={groupId} docs={ready}/>}
        <ErrorBox error={error}/>
      </section></div>
  </>;
}

export default function Personal() {
  const [id,setId]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{api('/personal/space').then(d=>setId(d.groupId)).catch(e=>setError(e.message));},[]);
  if(error) return <ErrorBox error={error}/>;
  return id?<PersonalWorkspace groupId={id}/>:<Spinner label="Criando seu ambiente privado…"/>;
}
