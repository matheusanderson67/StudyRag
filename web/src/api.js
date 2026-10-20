const TOKEN_KEY = 'studyrag.token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

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
