/** Accept only references to supplied passages and verbatim supporting excerpts. */
export function validateEvidence(value, passages) {
  if (!value || typeof value.found !== 'boolean') throw new Error('Resposta da IA em formato inválido.');
  if (!value.found) return { found: false, answer: '', cited: [] };
  if (typeof value.answer !== 'string' || !value.answer.trim() || value.answer.length > 20000 ||
      !Array.isArray(value.citations) || !value.citations.length) throw new Error('Resposta sem evidências verificáveis.');
  const normalized = text => text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  const cited = [];
  for (const citation of value.citations) {
    const index = citation.passageId - 1;
    if (!Number.isInteger(citation.passageId) || !passages[index] || typeof citation.quote !== 'string' ||
        normalized(citation.quote).length < 12 || !normalized(passages[index].content).includes(normalized(citation.quote))) {
      throw new Error('A IA citou uma evidência que não consta no material.');
    }
    if (!value.answer.includes(`[${citation.passageId}]`)) throw new Error('Resposta sem referência à evidência.');
    if (!cited.some(c => c.passageId === citation.passageId)) cited.push({ ...passages[index], passageId: citation.passageId, quote: citation.quote });
  }
  const refs = [...value.answer.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]));
  if (refs.some(id => !cited.some(c => c.passageId === id))) throw new Error('Resposta contém uma referência inválida.');
  return { found: true, answer: value.answer.trim(), cited };
}
