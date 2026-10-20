import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { ErrorBox, Spinner, useAction } from '../ui.jsx';

export default function Groups() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState(null);
  const [form, setForm] = useState({ name: '', subject: '', period: '', description: '' });
  const [code, setCode] = useState('');
  const create = useAction();
  const join = useAction();
  const [loadError,setLoadError] = useState('');
  useEffect(()=>{api('/groups').then(d=>setGroups(d.groups)).catch(e=>setLoadError(e.message));},[]);
  const set=(k)=>(e)=>setForm(old=>({...old,[k]:e.target.value}));
  const createGroup=(e)=>{e.preventDefault();create.run(async()=>navigate(`/grupos/${(await api('/groups',{method:'POST',body:form})).group.id}`));};
  const joinGroup=(e)=>{e.preventDefault();join.run(async()=>navigate(`/grupos/${(await api('/groups/join',{method:'POST',body:{code}})).group.id}`));};
  const docs=(groups??[]).reduce((sum,g)=>sum+Number(g.document_count||0),0);
  return <>
    <div className="welcome-row"><div><span className="eyebrow">SEU PAINEL DE ESTUDOS</span><h1>Bem-vindo ao StudyRAG <span className="wave">✦</span></h1><p>Organize suas matérias, converse com seus PDFs e aprenda com inteligência artificial.</p></div><span className="welcome-date">✦ Seu espaço de conhecimento</span></div>
    <div className="hero-card"><div className="hero-glow"/><div className="hero-content"><span className="hero-tag"><Icon name="spark" size={15}/> POTENCIALIZE SEUS ESTUDOS</span><h2>Aprender fica melhor<br/>quando a IA estuda com você.</h2><p>Envie seus materiais, tire dúvidas, pratique com simulados e visualize seu progresso. Tudo em um só lugar.</p><button className="hero-action" onClick={()=>document.getElementById('criar-grupo')?.scrollIntoView({behavior:'smooth'})}>Criar meu grupo <Icon name="arrow" size={18}/></button></div><div className="hero-art" aria-hidden="true"><span className="hero-orbit orbit-one"/><span className="hero-orbit orbit-two"/><span className="hero-art-book"><Icon name="books" size={68}/></span><span className="hero-float float-a"><Icon name="spark" size={24}/></span><span className="hero-float float-b"><Icon name="chart" size={25}/></span><span className="hero-float float-c"><Icon name="quiz" size={25}/></span></div></div>
    <div className="overview-stats"><div className="stat-card"><span className="stat-icon blue"><Icon name="folder" size={23}/></span><div><strong>{groups?.length??'—'}</strong><small>Meus grupos</small></div></div><div className="stat-card"><span className="stat-icon purple"><Icon name="file" size={23}/></span><div><strong>{groups?docs:'—'}</strong><small>Materiais disponíveis</small></div></div><div className="stat-card"><span className="stat-icon orange"><Icon name="bot" size={23}/></span><div><strong>4</strong><small>Recursos com IA</small></div></div></div>
    <div className="section-heading"><div><span className="eyebrow">SUAS MATÉRIAS</span><h2>Meus grupos de estudo</h2></div><span className="section-count">{groups?.length??0} grupos</span></div>
    <ErrorBox error={loadError}/>
    {groups===null&&!loadError?<Spinner/>:groups?.length===0?<div className="empty-state"><span className="empty-state-icon"><Icon name="folder" size={38}/></span><h3>Seu primeiro grupo começa aqui</h3><p>Crie um grupo abaixo ou entre em uma turma usando um código de convite.</p></div>:<div className="groups-grid">{groups?.map((g,index)=><Link to={`/grupos/${g.id}`} key={g.id} className="study-group-card"><div className="group-top"><span className={`group-tile tile-${index%4}`}><Icon name="books" size={26}/></span><span className="group-more"><Icon name="arrow" size={18}/></span></div><strong>{g.name}</strong><p>{[g.subject,g.period].filter(Boolean).join(' · ')||'Seu espaço de estudos'}</p><div className="group-card-meta"><span><Icon name="users" size={15}/>{g.member_count} membros</span><span><Icon name="file" size={15}/>{g.document_count} PDFs</span></div></Link>)}</div>}
    <div className="section-heading form-section-heading"><div><span className="eyebrow">ESTUDE EM CONJUNTO</span><h2>Comece algo novo</h2></div></div>
    <div className="two-col form-panels"><form id="criar-grupo" className="card stack setup-card" onSubmit={createGroup}><span className="setup-icon purple"><Icon name="plus" size={24}/></span><h3>Criar um grupo</h3><p>Organize materiais e conteúdos com seus colegas.</p><label className="field"><span>Nome do grupo *</span><input value={form.name} onChange={set('name')} required minLength={2} placeholder="Ex.: Estudos de Banco de Dados"/></label><div className="row wrap"><label className="field grow"><span>Matéria</span><input value={form.subject} onChange={set('subject')} placeholder="Banco de Dados"/></label><label className="field grow"><span>Período</span><input value={form.period} onChange={set('period')} placeholder="3º período"/></label></div><label className="field"><span>Descrição (opcional)</span><input value={form.description} onChange={set('description')} placeholder="Sobre o que vamos estudar?"/></label><ErrorBox error={create.error}/><button className="primary submit-button" disabled={create.busy}>{create.busy?'Criando…':'Criar grupo'} <Icon name="arrow" size={18}/></button></form>
      <form className="card stack setup-card join-card" onSubmit={joinGroup}><span className="setup-icon blue"><Icon name="users" size={24}/></span><h3>Entrar em um grupo</h3><p>Já tem um código? Junte-se ao espaço dos seus colegas.</p><div className="join-art"><Icon name="books" size={52}/><span>Aprender junto é melhor.</span></div><label className="field"><span>Código de convite</span><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} required placeholder="EX.: ABCD2345" maxLength={20}/></label><ErrorBox error={join.error}/><button className="submit-button" disabled={join.busy}>{join.busy?'Entrando…':'Entrar no grupo'} <Icon name="arrow" size={18}/></button></form></div>
  </>;
}
