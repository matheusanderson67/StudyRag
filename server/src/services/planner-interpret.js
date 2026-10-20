import { z } from 'zod';
import { getAI } from '../ai/index.js';

const WEEKDAYS = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
const normalize = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const pad = (n) => String(n).padStart(2, '0');
const asDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;

export const previewSchema = z.object({
  title: z.string().trim().min(2).max(160),
  kind: z.enum(['study','exam','assignment','other']).default('study'),
  localDate: z.iso.date(),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  repeatType: z.enum(['none','daily','weekly','weekdays']).default('none'),
  repeatDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
});

function parseLocal(text, today) {
  const lower = normalize(text);
  const dateMatch = lower.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{4}))?\b/);
  let day = '';
  const addDays = (amount) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+amount); return asDate(d); };
  if (dateMatch) {
    const yr = dateMatch[3] ? Number(dateMatch[3]) : Number(today.slice(0,4));
    const month = Number(dateMatch[2]), date = Number(dateMatch[1]);
    const d = new Date(Date.UTC(yr,month-1,date));
    if (d.getUTCDate()===date && d.getUTCMonth()===month-1 && yr>=2020 && yr<=2100) {
      day = asDate(d);
      if (!dateMatch[3] && day < today) day = asDate(new Date(Date.UTC(yr+1,month-1,date)));
    }
  } else if (/depois de amanha/.test(lower)) day=addDays(2);
  else if (/\bamanha\b/.test(lower)) day=addDays(1);
  else if (/\bhoje\b/.test(lower)) day=today;
  else {
    const word = WEEKDAYS.find(w => new RegExp(`\\b${w}(?:-feira)?\\b`).test(lower));
    if (word) { const from = new Date(`${today}T12:00:00Z`).getUTCDay(); let diff=(WEEKDAYS.indexOf(word)-from+7)%7; if(diff===0)diff=7; day=addDays(diff); }
  }
  const hourMatch = lower.match(/\b(?:as?\s+)?([01]?\d|2[0-3])\s*(?:h|:)([0-5]\d)?\b/) ?? lower.match(/\bas?\s+([01]?\d|2[0-3])\b/);
  const localTime = hourMatch ? `${pad(Number(hourMatch[1]))}:${pad(Number(hourMatch[2]||0))}` : '';
  const kind = /\b(prova|exame|avaliacao|teste)\b/.test(lower) ? 'exam' : /\b(trabalho|entrega|atividade|prazo)\b/.test(lower) ? 'assignment' : 'study';
  const repeatDays = WEEKDAYS.flatMap((w,i) => new RegExp(`\\b${w}(?:-feira)?\\b`).test(lower) ? [i] : []);
  let repeatType = 'none';
  if (/\b(todo dia|todos os dias|diariamente|cada dia)\b/.test(lower)) repeatType='daily';
  else if (/\b(toda semana|semanalmente)\b/.test(lower)) repeatType='weekly';
  else if (/\b(toda|todo|todas|todos)\b/.test(lower) && repeatDays.length) repeatType='weekdays';
  let title = text.trim()
    .replace(/^(?:chat[,! ]*|me lembr(?:a|e)(?: de|r)?[,! ]*|vou(?: começar a)?[,! ]*)/i,'')
    .replace(/(?:^|\s)(?:hoje|amanhã|amanha|depois de amanhã|depois de amanha)(?=\s|$)/gi,' ')
    .replace(/(?:^|\s)(?:às|as|a)\s*\d{1,2}(?::\d{2}|h\d{0,2})?(?=\s|$)/gi,' ')
    .replace(/(?:^|\s)(?:dia\s+)?\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{4})?(?=\s|$)/gi,' ')
    .replace(/\b(?:por|durante)\s+\d+\s+(?:horas?|minutos?)\b/gi,' ')
    .replace(/^(?:toda|todo|todos|todas)\s+(?:(?:segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)(?:-feira)?(?:,?\s*(?:e\s+)?(?:segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)(?:-feira)?)*)?/i,'')
    .replace(/\s+/g,' ').trim().replace(/[,.! ]+$/,'');
  if (title.length<3 || /^\b(me|eu|quero|vou|de|estudar)\b$/i.test(title)) title = kind==='exam'?'Prova':kind==='assignment'?'Entrega de trabalho':'Sessão de estudo';
  return { title:title.slice(0,160),kind,localDate:day,localTime,repeatType,repeatDays };
}

export async function interpretMessage(message, today) {
  // Padrões previsíveis não dependem do Gemini, evitando atraso ou falhas para comandos comuns.
  const draft = parseLocal(message,today);
  if (draft.localDate && draft.localTime) return {draft,needs:[]};
  // A IA só propõe um rascunho; a interface exige confirmação explícita antes de salvar.
  const ai = getAI();
  if (!ai.isMock) {
    try {
      const data = await Promise.race([ai.generateJson({
        system:'Interprete lembretes acadêmicos em português. Não invente datas ou horários. Responda APENAS JSON com title, kind (study/exam/assignment/other), localDate (YYYY-MM-DD ou vazio), localTime (HH:mm ou vazio), repeatType (none/daily/weekly/weekdays) e repeatDays (0=domingo a 6=sábado). Datas relativas usam a DATA LOCAL informada. Não execute ações.',
        prompt:`DATA LOCAL: ${today}\nMENSAGEM DO ALUNO: ${message}\nRetorne apenas os campos solicitados.`,
        task:'planner',temperature:0,
      }), new Promise((_, reject) => setTimeout(() => reject(new Error('Tempo limite de interpretação.')), 10000))]);
      const merged = { ...draft, ...data };
      if (!draft.localDate && /^\d{4}-\d{2}-\d{2}$/.test(merged.localDate??'')) draft.localDate=merged.localDate;
      if (!draft.localTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(merged.localTime??'')) draft.localTime=merged.localTime;
      if (typeof data.title==='string' && data.title.trim().length>=2) draft.title=data.title.trim().slice(0,160);
      if (['study','exam','assignment','other'].includes(data.kind)) draft.kind=data.kind;
    } catch { /* Se a IA estiver indisponível, formulário manual continua funcionando. */ }
  }
  return {draft,needs:[...(!draft.localDate?['data']:[]),...(!draft.localTime?['horário']:[])]};
}
