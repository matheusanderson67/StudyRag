const TOKEN_KEY = 'studyrag.token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export async function openDocument(documentId, page = 1) {
  // Open synchronously to preserve the click gesture for popup blockers.
  const tab = window.open('about:blank', '_blank');
  if (!tab) throw new Error('Permita abrir uma nova aba para visualizar o PDF.');
  tab.opener = null;
  tab.document.title = 'Carregando PDF…';
  try {
    const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/file`, {
      headers: { Authorization: `Bearer ${getToken()}` }, signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Não foi possível abrir o PDF.');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    const number = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
    tab.location.replace(`${url}#page=${number}`);
    setTimeout(() => URL.revokeObjectURL(url), 300000);
  } catch (error) { tab.close(); throw error; }
}

/** Chamada à API. `body` pode ser objeto (JSON) ou FormData. Lança Error com a mensagem do servidor. */
export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  // Limite de 15s só para operações de geração: uploads e outras rotas não são afetados.
  const aiAction = method === 'POST' && (/^\/groups\/[^/]+\/(?:ask|summary|tutor|mindmap|quizzes)$/.test(path) || path === '/planner/interpret');
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload,
      ...(aiAction ? { signal: AbortSignal.timeout(15_000) } : {}) });
  } catch (error) {
    if (aiAction && (error?.name === 'TimeoutError' || error?.name === 'AbortError')) {
      throw new Error('A IA ultrapassou 15 segundos. Tente novamente com uma pergunta ou material menor.');
    }
    throw new Error('Não consegui falar com o servidor. Ele está rodando?');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event('studyrag:logout'));
    }
    throw new Error(data.error || 'Algo deu errado. Tente novamente.');
  }
  return data;
}
