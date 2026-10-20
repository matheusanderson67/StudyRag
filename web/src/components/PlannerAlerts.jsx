import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Icon from './Icon.jsx';

// Avisos em tela quando a plataforma está aberta. Não solicita permissão sem clique.
export default function PlannerAlerts() {
  const {user}=useAuth();
  const [alerts,setAlerts]=useState([]);
  useEffect(()=>{
    if (!user) {setAlerts([]);return;}
    let active=true;
    async function check(){
      try{
        const {alerts:newAlerts}=await api('/planner/alerts/pending');
        if(!active||!newAlerts?.length)return;
        setAlerts(old=>[...old,...newAlerts].slice(-10));
        if ('Notification' in window && Notification.permission==='granted') {
          newAlerts.forEach(a=>new Notification('StudyRAG • '+a.title,{body:'Seu lembrete de '+(a.kind==='exam'?'prova':a.kind==='assignment'?'trabalho':'estudo')+' chegou!'}));
        }
      }catch{/* Se a rede estiver indisponível, avisos permanecem pendentes no servidor. */}
    }
    check();const timer=setInterval(check,45000);
    return()=>{active=false;clearInterval(timer);};
  },[user?.id]);
  if(!alerts.length)return null;
  return <div className="planner-alerts" role="status" aria-live="polite">{alerts.map((a,i)=><div className="planner-alert" key={`${a.id}-${i}`}><Icon name="calendar" size={22}/><div><strong>Lembrete: {a.title}</strong><p>{a.kind==='exam'?'Data de prova':a.kind==='assignment'?'Entrega de trabalho':'Hora de estudar'} — {new Date(a.scheduledAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</p></div><button aria-label="Fechar lembrete" onClick={()=>setAlerts(old=>old.filter((_,j)=>j!==i))}>×</button></div>)}</div>;
}
