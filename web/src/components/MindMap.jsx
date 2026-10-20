import { useState } from 'react';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { DocSelect, ErrorBox, Spinner, Sources } from '../ui.jsx';

function Network({map,selected,setSelected}) {
  const W=820,H=540,cx=W/2,cy=H/2;
  const nodes=map.nodes.slice(0,24);
  const positions=Object.fromEntries(nodes.map((n,i)=>{
    if(i===0)return[n.id,{x:cx,y:cy}];
    const ring=i<=8?1:2;
    const idx=i<=8?i-1:i-9;
    const nInRing=ring===1?Math.min(8,nodes.length-1):Math.max(1,nodes.length-9);
    const angle=-Math.PI/2+2*Math.PI*idx/nInRing;
    const radius=ring===1?172:250;
    return[n.id,{x:cx+Math.cos(angle)*radius,y:cy+Math.sin(angle)*radius*.82}];
  }));
  return <div className="network-canvas"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Mapa mental interativo: ${map.title}`}>
    <defs><linearGradient id="nodeGradient" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#6657ff"/><stop offset="1" stopColor="#8a60eb"/></linearGradient></defs>
    <circle cx={cx} cy={cy} r="214" fill="none" stroke="#e7e5fc" strokeDasharray="5 10"/><circle cx={cx} cy={cy} r="110" fill="none" stroke="#eff0fa"/>
    {map.edges.filter(e=>positions[e.from]&&positions[e.to]).map((e,i)=><line key={i} x1={positions[e.from].x} y1={positions[e.from].y} x2={positions[e.to].x} y2={positions[e.to].y} stroke={selected===e.from||selected===e.to?'#9f8aff':'#d5d9eb'} strokeWidth={selected===e.from||selected===e.to?2.5:1.5}/>) }
    {nodes.map((n,i)=>{const pos=positions[n.id];const isMain=i===0,active=selected===n.id;return <g key={n.id} role="button" tabIndex={0} aria-label={`Abrir conceito ${n.label}`} onClick={()=>setSelected(n.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(n.id)}}} style={{cursor:'pointer'}}><circle cx={pos.x} cy={pos.y} r={isMain?54:active?38:34} fill={isMain?'url(#nodeGradient)':active?'#e7e2ff':'#fff'} stroke={isMain?'#fff':active?'#7059ea':'#dfe3f0'} strokeWidth={isMain?4:2}/><text x={pos.x} y={pos.y-5} fontSize={isMain?11:10} fontWeight="700" fill={isMain?'#fff':'#2c3554'} textAnchor="middle">{n.label.length>17?n.label.slice(0,16)+'…':n.label}</text>{!isMain&&<circle cx={pos.x} cy={pos.y+12} r={4} fill={active?'#6d50f7':'#b6b0e9'}/>}</g>})}
  </svg></div>;
}

export default function MindMap({groupId,docs}) {
  const [documentId,setDocumentId]=useState(null),[map,setMap]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState(null);
  async function generate(){setBusy(true);setError('');setMap(null);try{const out=await api(`/groups/${groupId}/mindmap`,{method:'POST',body:{documentId}});setMap(out);setSelected(out.nodes[0]?.id);}catch(e){setError(e.message)}finally{setBusy(false)}}
  const current=map?.nodes?.find(n=>n.id===selected)??map?.nodes?.[0];
  const relations=map?.edges.filter(e=>e.from===current?.id||e.to===current?.id)??[];
  return <div className="stack mindmap-tool"><div className="tool-heading"><div className="tool-heading-icon orange"><Icon name="network" size={26}/></div><div><span className="eyebrow">VISUALIZE SUAS IDEIAS</span><h2>Mapa mental com IA</h2><p>Transforme textos complexos em conceitos conectados.</p></div></div><div className="card mindmap-controls"><div className="grow"><DocSelect docs={docs} value={documentId} onChange={setDocumentId} label="Material para o mapa mental"/></div><button className="primary" onClick={generate} disabled={busy||!docs.length}><Icon name="spark" size={17}/>{busy?'Gerando…':'Criar mapa mental'}</button></div><ErrorBox error={error}/>{busy&&<Spinner label="Conectando os conceitos dos seus materiais…"/>}{map&&!busy&&<div className="card mindmap-view"><div className="mindmap-view-head"><div><span className="eyebrow">MAPA GERADO</span><h3>{map.title}</h3><p>Clique em qualquer conceito para ver mais detalhes.</p></div><span className="map-count">{map.nodes.length} conceitos</span></div><Network map={map} selected={selected} setSelected={setSelected}/>{current&&<div className="concept-detail"><span className="concept-detail-icon"><Icon name="network" size={22}/></span><div><span className="eyebrow">CONCEITO SELECIONADO</span><h4>{current.label}</h4><p>{current.description||'Conceito presente no material.'}</p>{relations.length>0&&<small>Conexões: {relations.map(e=>{const other=e.from===current.id?e.to:e.from;return map.nodes.find(n=>n.id===other)?.label;}).filter(Boolean).join(' · ')}</small>}</div></div>}<Sources sources={map.sources}/></div>}</div>;
}
