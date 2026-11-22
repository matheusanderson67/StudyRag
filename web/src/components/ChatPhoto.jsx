import { useEffect, useState } from 'react';
import { getToken } from '../api.js';
export default function ChatPhoto({ groupId, messageId, onLoad }) {
  const [url, setUrl] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); let objectUrl;
    fetch(`/api/groups/${groupId}/chat/messages/${messageId}/image`, { headers: { Authorization: `Bearer ${getToken()}` }, signal: controller.signal })
      .then(async res => { if (!res.ok) throw new Error('Não foi possível carregar a foto.'); const blob = await res.blob(); if(controller.signal.aborted)return; objectUrl = URL.createObjectURL(blob);setUrl(objectUrl); })
      .catch(e => {if(e.name !== 'AbortError')setError(e.message);});
    return () => {controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  }, [groupId, messageId]);
  return error ? <p role="status">{error}</p> : url ? <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Abrir foto em tamanho maior"><img src={url} onLoad={onLoad} className="chat-photo" alt="Foto compartilhada no grupo"/></a> : <p>Carregando foto…</p>;
}
