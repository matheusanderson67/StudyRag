import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { badRequest, notFound } from '../lib/errors.js';
import { idParam, requireAuth } from '../middleware/auth.js';
import { aiDeadline } from '../middleware/ai-deadline.js';
import { interpretMessage } from '../services/planner-interpret.js';

const router=Router();
router.use(requireAuth);
const schema=z.object({
  title:z.string().trim().min(2).max(160),
  details:z.string().trim().max(500).default(''),
  kind:z.enum(['study','exam','assignment','other']).default('study'),
  scheduledAt:z.iso.datetime({offset:true}),
  repeatType:z.enum(['none','daily','weekly','weekdays']).default('none'),
  repeatDays:z.array(z.number().int().min(0).max(6)).max(7).default([]),
  alertMinutesBefore:z.number().int().min(0).max(10080).default(0),
  timezoneOffsetMinutes:z.number().int().min(-840).max(840).default(0),
}).refine(r => r.repeatType!=='weekdays'||r.repeatDays.length>0,{message:'Escolha os dias da semana.'});
const fmt = r => ({ id:r.id,title:r.title,details:r.details,kind:r.kind,scheduledAt:new Date(r.scheduled_at).toISOString(),repeatType:r.repeat_type,repeatDays:typeof r.repeat_days==='string'?JSON.parse(r.repeat_days):r.repeat_days||[],alertMinutesBefore:r.alert_minutes_before,notifiedAt:r.notified_at,completedAt:r.completed_at });
const fetchItems = async userId => (await query('SELECT * FROM study_reminders WHERE user_id=$1 ORDER BY completed_at IS NOT NULL, scheduled_at ASC LIMIT 300',[userId])).rows;

router.get('/', async (req,res)=>res.json({reminders:(await fetchItems(req.userId)).map(fmt)}));
router.post('/interpret',aiDeadline,async(req,res)=>{
  const { message, today }=z.object({message:z.string().trim().min(3).max(400),today:z.iso.date()}).parse(req.body);
  // Datas relativas dependem da data local enviada pelo navegador do aluno.
  if (Math.abs(Date.parse(`${today}T12:00:00Z`)-Date.now()) > 48*60*60*1000) throw badRequest('A data do dispositivo parece incorreta. Confira o relógio.');
  res.json(await interpretMessage(message,today));
});
router.post('/',async(req,res)=>{
  const data=schema.parse(req.body);
  const at=new Date(data.scheduledAt);
  if (!Number.isFinite(at.getTime()) || at.getTime() <= Date.now()) throw badRequest('Escolha uma data e horário futuros.');
  if (at.getTime()>Date.now()+5*365*86400000) throw badRequest('Escolha uma data até 5 anos à frente.');
  const id=crypto.randomUUID();
  await query(`INSERT INTO study_reminders (id,user_id,title,details,kind,scheduled_at,repeat_type,repeat_days,alert_minutes_before,timezone_offset_minutes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,req.userId,data.title,data.details,data.kind,at,data.repeatType,JSON.stringify(data.repeatDays),data.alertMinutesBefore,data.timezoneOffsetMinutes]);
  res.status(201).json({reminder:fmt((await query('SELECT * FROM study_reminders WHERE id=$1',[id])).rows[0])});
});
router.patch('/:reminderId', idParam('reminderId'),async(req,res)=>{
  const {completed}=z.object({completed:z.boolean()}).parse(req.body);
  const result=await query('UPDATE study_reminders SET completed_at=$3 WHERE id=$1 AND user_id=$2',[req.params.reminderId,req.userId,completed?new Date():null]);
  if(!result.rowCount) throw notFound('Lembrete não encontrado.');
  res.json({ok:true});
});
router.delete('/:reminderId', idParam('reminderId'),async(req,res)=>{
  const result=await query('DELETE FROM study_reminders WHERE id=$1 AND user_id=$2',[req.params.reminderId,req.userId]);
  if(!result.rowCount) throw notFound('Lembrete não encontrado.');
  res.status(204).end();
});

// Busca avisos vencidos e registra entrega apenas quando a interface efetivamente consulta.
// Com a página fechada, nada é perdido: o aviso pendente aparece no próximo acesso.
router.get('/alerts/pending',async(req,res)=>{
  const rows=(await query(`SELECT * FROM study_reminders WHERE user_id=$1 AND completed_at IS NULL AND notified_at IS NULL
    AND DATE_SUB(scheduled_at, INTERVAL alert_minutes_before MINUTE) <= UTC_TIMESTAMP(3)
    ORDER BY scheduled_at ASC LIMIT 15`,[req.userId])).rows;
  const alerts=[];
  for(const row of rows) {
    const claimed=await query('UPDATE study_reminders SET notified_at=UTC_TIMESTAMP(3) WHERE id=$1 AND user_id=$2 AND notified_at IS NULL AND completed_at IS NULL',[row.id,req.userId]);
    if (!claimed.rowCount) continue;
    alerts.push(fmt(row));
    if(row.repeat_type!=='none') {
      const next=new Date(row.scheduled_at);
      const now=Date.now();
      const days=typeof row.repeat_days==='string'?JSON.parse(row.repeat_days):row.repeat_days||[];
      let guard=0;
      do {
        if(row.repeat_type==='weekly')next.setUTCDate(next.getUTCDate()+7);
        else next.setUTCDate(next.getUTCDate()+1);
        guard++;
      } while (next.getTime()-Number(row.alert_minutes_before)*60000<=now && guard<2000 || row.repeat_type==='weekdays' && !days.includes(new Date(next.getTime()-Number(row.timezone_offset_minutes)*60000).getUTCDay()) && guard<2000);
      if(guard<2000) await query('UPDATE study_reminders SET scheduled_at=$2,notified_at=NULL WHERE id=$1 AND user_id=$3',[row.id,next,req.userId]);
    }
  }
  res.json({alerts});
});

export default router;
