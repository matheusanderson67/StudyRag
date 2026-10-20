import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { ErrorBox, Spinner } from '../ui.jsx';

const kinds={study:'Estudo',exam:'Prova',assignment:'Trabalho',other:'Outro'};
const weekdays=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const localToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const dateOnly=(iso)=>{const d=new Date(iso);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const timeOnly=(iso)=>new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const fmt=(iso)=>new Date(iso).toLocaleString('pt-BR',{dateStyle:'medium',timeStyle:'short'});
const empty=()=>({title:'',details:'',kind:'study',localDate:'',localTime:'19:00',repeatType:'none',repeatDays:[],alertMinutesBefore:0});

export default function Planner() {
  const [items,setItems]=useState(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [chat,setChat]=useState([]);
  const [draft,setDraft]=useState(null);
  const [month,setMonth]=useState(localToday().slice(0,7));
  const [selected,setSelected]=useState('');
  const [manual,setManual]=useState(false);
  const [permission,setPermission]=useState(()=>('Notification' in window?Notification.permission:'unsupported'));
  const allowNotifications=async()=>{if(!('Notification' in window))return;const status=await Notification.requestPermission();setPermission(status);};
  const load=useCallback(()=>api('/planner').then(d=>setItems(d.reminders)).catch(e=>setError(e.message)),[]);
  useEffect(()=>{load();},[load]);
  const interpret=async e=>{
    e.preventDefault();if(!message.trim())return;
    setBusy(true);setError('');
    try{
      const input=message.trim();
      const d=await api('/planner/interpret',{method:'POST',body:{message:input,today:localToday()}});
      setChat(old=>[...old,{from:'me',text:input},{from:'bot',text:d.needs.length?`Entendi! Confirme o lembrete abaixo e complete: ${d.needs.join(' e ')}.`:'Preparei o lembrete. Confira os dados abaixo e clique em Salvar.'}]);
      setDraft({...empty(),...d.draft, localTime:d.draft.localTime||'19:00'});
      setManual(false);setMessage('');
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const save=async e=>{
    e.preventDefault();setError('');
    if(!draft?.localDate||!draft.localTime)return setError('Informe uma data e um horário.');
    const local=new Date(`${draft.localDate}T${draft.localTime}:00`);
    if (!Number.isFinite(local.getTime()))return setError('Data ou horário inválidos.');
    setBusy(true);
    try{
      const data={title:draft.title,details:draft.details,kind:draft.kind,scheduledAt:local.toISOString(),repeatType:draft.repeatType,repeatDays:draft.repeatDays,alertMinutesBefore:Number(draft.alertMinutesBefore),timezoneOffsetMinutes:local.getTimezoneOffset()};
      await api('/planner',{method:'POST',body:data});
      setChat(old=>[...old,{from:'bot',text:`✅ Lembrete "${draft.title}" salvo para ${fmt(local.toISOString())}!`}]);
      setDraft(null);setManual(false);await load();
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const act=async(id,method,body)=>{
    setError('');try{await api(`/planner/${id}`,{method,body});await load();}catch(e){setError(e.message);}
  };
  const upcoming=(items||[]).filter(r=>!r.completedAt);
  const dates=useMemo(()=>{
    const [year,mo]=month.split('-').map(Number);const first=new Date(year,mo-1,1);const last=new Date(year,mo,0).getDate();
    return [...Array(first.getDay()).fill(null),...Array.from({length:last},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`)];
  },[month]);
  const byDate=useMemo(()=>{const map={};for(const item of upcoming){const day=dateOnly(item.scheduledAt);(map[day]??=[]).push(item);}return map;},[items]);
  const changeMonth=(step)=>{const [y,m]=month.split('-').map(Number);const d=new Date(y,m-1+step,1);setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);setSelected('');};
  return <div className="planner-page">
    <div className="welcome-row"><div><span className="eyebrow">STUDYRAG PLANNER</span><h1>Seu assistente de estudos <span className="wave">✦</span></h1><p>Converse para criar lembretes, acompanhe suas provas e organize sua rotina.</p></div><span className="welcome-date"><Icon name="calendar" size={17}/> Organizado com você</span></div>
    <div className="planner-grid">
      <section className="card planner-chat" aria-label="Chat de lembretes"><div className="planner-section-head"><span className="feature-icon purple"><Icon name="bot" size={22}/></span><div><h2>Chat lembrete</h2><p className="muted">Escreva como você falaria com um assistente.</p></div></div>
        <div className="planner-messages" aria-live="polite"><div className="planner-bubble bot">Olá! Me diga quando deseja estudar ou a data de uma prova. Vou preparar o lembrete para sua confirmação. 📚</div>{chat.map((c,i)=><div key={i} className={`planner-bubble ${c.from==='me'?'mine':'bot'}`}>{c.text}</div>)}{busy&&<div className="planner-bubble bot">Preparando…</div>}</div>
        <form onSubmit={interpret} className="planner-send"><input aria-label="Mensagem para o Planner" value={message} onChange={e=>setMessage(e.target.value)} placeholder="Amanhã às 19h estudar Banco de Dados" maxLength={400} minLength={3} required/><button className="primary" disabled={busy}><Icon name="arrow" size={17}/> Enviar</button></form>
        <div className="planner-examples"><span>Experimente:</span>{['Amanhã às 19h estudar Java','Prova de Redes dia 28/10 às 08h','Toda segunda às 20h estudar SQL'].map(t=><button key={t} type="button" onClick={()=>setMessage(t)}>{t}</button>)}</div>
        <button className="link" onClick={()=>{setDraft(empty());setManual(true);setError('');}}>+ Criar manualmente</button>
      </section>
      <section className="card planner-calendar"><div className="planner-section-head"><span className="feature-icon blue"><Icon name="calendar" size={22}/></span><div><h2>Calendário acadêmico</h2><p className="muted">Seus compromissos em um só lugar.</p></div></div><div className="planner-month"><button aria-label="Mês anterior" onClick={()=>changeMonth(-1)}>‹</button><strong>{new Date(`${month}-01T12:00:00`).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</strong><button aria-label="Próximo mês" onClick={()=>changeMonth(1)}>›</button></div><div className="planner-days">{weekdays.map(w=><strong key={w}>{w}</strong>)}{dates.map((day,i)=>day?<button type="button" key={day} className={`planner-day ${day===selected?'chosen':''} ${day===localToday()?'today':''}`} onClick={()=>setSelected(old=>old===day?'':day)}><span>{Number(day.slice(-2))}</span>{byDate[day]?.length>0&&<i aria-label={`${byDate[day].length} evento(s)`}/>}</button>:<span key={`empty-${i}`}/> )}</div>{selected&&<div className="planner-selected"><strong>{new Date(`${selected}T12:00:00`).toLocaleDateString('pt-BR',{dateStyle:'full'})}</strong>{byDate[selected]?.length?byDate[selected].map(r=><p key={r.id}>• {timeOnly(r.scheduledAt)} — {r.title}</p>):<p className="muted">Nenhum lembrete neste dia.</p>}</div>}</section>
    </div>
    <div className="planner-notify-tip">
      <Icon name="clock" size={15}/> Os avisos aparecem no StudyRAG enquanto ele estiver aberto. Se você sair, os lembretes pendentes serão mostrados quando voltar.
      {permission==='default'&&<button type="button" onClick={allowNotifications}>Ativar notificações do navegador</button>}
      {permission==='granted'&&<span> Notificações do navegador permitidas.</span>}
      {permission==='denied'&&<span> Seu navegador bloqueou notificações; os avisos dentro do StudyRAG continuarão disponíveis.</span>}
    </div>
    <ErrorBox error={error}/>
    {draft&&<form className="card planner-draft" onSubmit={save}><div className="planner-section-head"><span className="feature-icon green"><Icon name="check" size={22}/></span><div><h2>{manual?'Novo lembrete':'Confirme o lembrete'}</h2><p className="muted">Nada é agendado antes de você clicar em Salvar lembrete.</p></div></div>
      <div className="planner-fields"><label className="field planner-wide"><span>O que lembrar? *</span><input value={draft.title} required minLength={2} maxLength={160} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label className="field"><span>Tipo</span><select value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value})}>{Object.entries(kinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="field"><span>Data *</span><input type="date" value={draft.localDate} required onChange={e=>setDraft({...draft,localDate:e.target.value})}/></label><label className="field"><span>Horário *</span><input type="time" required value={draft.localTime} onChange={e=>setDraft({...draft,localTime:e.target.value})}/></label><label className="field"><span>Repetir</span><select value={draft.repeatType} onChange={e=>setDraft({...draft,repeatType:e.target.value})}><option value="none">Não repetir</option><option value="daily">Todos os dias</option><option value="weekly">Toda semana</option><option value="weekdays">Dias específicos</option></select></label><label className="field"><span>Avisar antes</span><select value={draft.alertMinutesBefore} onChange={e=>setDraft({...draft,alertMinutesBefore:Number(e.target.value)})}><option value="0">Na hora</option><option value="30">30 minutos</option><option value="60">1 hora</option><option value="1440">1 dia</option><option value="4320">3 dias</option><option value="10080">7 dias</option></select></label>{draft.repeatType==='weekdays'&&<div className="planner-wide planner-weekdays"><span>Repetir nos dias:</span>{weekdays.map((name,day)=><label key={day}><input type="checkbox" checked={draft.repeatDays.includes(day)} onChange={e=>setDraft({...draft,repeatDays:e.target.checked?[...draft.repeatDays,day]:draft.repeatDays.filter(x=>x!==day)})}/>{name}</label>)}</div>}<label className="field planner-wide"><span>Observação (opcional)</span><input maxLength={500} value={draft.details} onChange={e=>setDraft({...draft,details:e.target.value})} placeholder="Ex.: revisar os exercícios do PDF"/></label></div><div className="row wrap"><button className="primary" disabled={busy||!draft.title.trim()}>Salvar lembrete</button><button type="button" onClick={()=>setDraft(null)}>Cancelar</button></div></form>}
    <section className="card planner-list"><div className="planner-section-head"><span className="feature-icon orange"><Icon name="clock" size={22}/></span><div><h2>Meus lembretes</h2><p className="muted">{upcoming.length} atividade(s) pendente(s)</p></div></div>{items===null?<Spinner/>:items.length===0?<p className="muted">Você ainda não cadastrou lembretes. Comece pelo chat acima.</p>:<div className="planner-items">{items.map(item=><div className={`planner-item ${item.completedAt?'finished':''}`} key={item.id}><span className="planner-kind">{item.kind==='exam'?'📝':item.kind==='assignment'?'📌':'📚'}</span><div className="planner-item-main"><strong>{item.title}</strong><small>{kinds[item.kind]} · {fmt(item.scheduledAt)}{item.repeatType!=='none'?` · ${item.repeatType==='daily'?'Diário':item.repeatType==='weekly'?'Semanal':'Dias selecionados'}`:''}{item.completedAt?' · Concluído':''}</small>{item.details&&<small>{item.details}</small>}</div><div className="planner-actions"><button type="button" onClick={()=>act(item.id,'PATCH',{completed:!item.completedAt})}>{item.completedAt?'Reabrir':'Concluir'}</button><button type="button" className="danger" onClick={()=>window.confirm(`Excluir "${item.title}"?`)&&act(item.id,'DELETE')}>Excluir</button></div></div>)}</div>}</section>
  </div>;
}
