import { useEffect, useRef, useState } from 'react';
import { api, getToken } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox } from '../ui.jsx';
import './chat.css';
import ChatPhoto from './ChatPhoto.jsx';

export default function Chat({ groupId }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]), [text, setText] = useState('');
  const [status, setStatus] = useState('Conectando…'), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [older, setOlder] = useState(null), [loading, setLoading] = useState(false);
  const [photo, setPhoto] = useState(null), [preview, setPreview] = useState('');
  const fileInput = useRef(null);
  useEffect(() => {if(!photo){setPreview('');return;}const url=URL.createObjectURL(photo);setPreview(url);return()=>URL.revokeObjectURL(url);},[photo]);
  const retry = useRef(null), list = useRef(null), nearBottom = useRef(true);
  const merge = incoming => setMessages(old => [...new Map([...old, ...incoming].map(m => [m.id, m])).values()]
    .sort((a, b) => a.id.length - b.id.length || a.id.localeCompare(b.id)));
  useEffect(() => {
    let stopped = false, controller, wake;
    setMessages([]); setOlder(null); setError(''); retry.current = null;
    api(`/groups/${groupId}/chat/messages`).then(data => { if (!stopped) { merge(data.messages); setOlder(data.nextBefore); } }).catch(e => { if (!stopped) setError(e.message); });
    const connect = async () => {
      controller = new AbortController();
      try {
        const response = await fetch(`/api/groups/${groupId}/chat/events`, {
          headers: { Authorization: `Bearer ${getToken()}` }, signal: controller.signal,
        });
        if ([401, 403, 404].includes(response.status)) { if (!stopped) {setMessages([]);setStatus('Acesso encerrado');setError('Entre novamente ou confira sua participação no grupo.');} return; }
        if (!response.ok || !response.body) throw new Error('Não foi possível conectar ao chat.');
        if (stopped) return;
        setStatus('Conectado');
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let buffer = '';
        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let split;
          while ((split = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, split); buffer = buffer.slice(split + 2);
            const type = frame.split('\n').find(l => l.startsWith('event: '))?.slice(7);
            const payload = frame.split('\n').find(l => l.startsWith('data: '))?.slice(6);
            if (stopped) return;
            if (type === 'messages') merge(JSON.parse(payload).messages);
            if (type === 'revoked' || type === 'expired') {
              setMessages([]); setStatus('Acesso encerrado'); setError('Sua sessão expirou ou você não participa mais do grupo.');
              await reader.cancel(); return;
            }
          }
        }
      } catch (e) { if (stopped || e.name === 'AbortError') return; }
      if (!stopped) { setStatus('Reconectando…'); wake = setTimeout(connect, 3000); }
    };
    void connect();
    return () => { stopped = true; controller?.abort(); clearTimeout(wake); };
  }, [groupId]);
  useEffect(() => { if (nearBottom.current && list.current) list.current.scrollTop = list.current.scrollHeight; }, [messages]);
  const send = async e => {
    e.preventDefault(); if (busy || (!text.trim() && !photo)) return;
    const content = text.trim();
    if (!retry.current || retry.current.content !== content || retry.current.photo !== photo) retry.current = { content, photo, clientId: crypto.randomUUID() };
    setBusy(true); setError('');
    const body = photo ? new FormData() : { content, clientId: retry.current.clientId };
    if(photo){body.append('content',content);body.append('clientId',retry.current.clientId);body.append('image',photo);}
    try { const data = await api(`/groups/${groupId}/chat/messages`, { method: 'POST', body });
      nearBottom.current = true; merge([data.message]); setText(''); setPhoto(null); if(fileInput.current)fileInput.current.value=''; retry.current = null;
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const loadOlder = async () => {
    setLoading(true); setError(''); nearBottom.current = false;
    try { const data = await api(`/groups/${groupId}/chat/messages?before=${older}`);merge(data.messages);setOlder(data.nextBefore); }
    catch (e) {setError(e.message);} finally {setLoading(false);}
  };
  return <section className="card group-chat">
    <header className="chat-header"><div><h2>Conversa da equipe</h2><p>Mensagens compartilhadas com os membros deste grupo.</p></div><span role="status" className="chat-status">{status}</span></header>
    <ErrorBox error={error}/>
    <div className="chat-messages" ref={list} role="log" aria-label="Mensagens do grupo" aria-live="polite" aria-relevant="additions" onScroll={e => {const el=e.currentTarget;nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}}>
      {older && <button type="button" className="chat-older" disabled={loading} onClick={loadOlder}>{loading?'Carregando…':'Carregar mensagens anteriores'}</button>}
      {!messages.length && <p className="chat-empty">A conversa começa aqui. Envie a primeira mensagem para a equipe.</p>}
      {messages.map(m => <article key={m.id} className={`chat-message ${m.userId===user?.id?'mine':''}`}><div className="chat-meta"><strong>{m.userId===user?.id?'Você':m.name}</strong><time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</time></div><p>{m.content}</p>{m.hasImage && <ChatPhoto groupId={groupId} messageId={m.id} onLoad={()=>{if(nearBottom.current&&list.current)list.current.scrollTop=list.current.scrollHeight;}}/>}</article>)}
    </div>
    <form onSubmit={send} className="chat-compose">
      <label className="field"><span>Foto (opcional, JPG, PNG ou WebP de até 5 MB)</span><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||status==='Acesso encerrado'} onChange={e=>{const file=e.target.files?.[0];if(file&&file.size>5*1024*1024){setError('Escolha uma foto de até 5 MB.');e.target.value='';setPhoto(null);return;}setError('');setPhoto(file||null);}}/></label>
      {preview && <div className="chat-photo-preview"><img src={preview} alt="Prévia da foto escolhida"/><button type="button" disabled={busy} onClick={()=>{setPhoto(null);if(fileInput.current)fileInput.current.value='';}}>Remover foto</button></div>}<label className="field"><span>Sua mensagem</span><textarea rows={3} value={text} maxLength={2000} onChange={e=>setText(e.target.value)} placeholder="Converse sobre os materiais e as dúvidas da equipe…" disabled={status==='Acesso encerrado'}/></label><div className="chat-compose-footer"><small>{text.length}/2000 caracteres. Enter cria uma nova linha.</small><button className="primary" disabled={busy||(!text.trim()&&!photo)||status==='Acesso encerrado'}>{busy?'Enviando…':'Enviar mensagem'}</button></div></form>
  </section>;
}

