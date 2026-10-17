// RESER · Envío de mails por Resend. Una sola función con tres tipos de aviso:
//
//   { type: 'reminders' }  (o body vacío) → lo dispara pg_cron cada 5 minutos: recuerda
//        1 hora antes los turnos confirmados que todavía no fueron recordados.
//   { type: 'booked', reservation_id, by_owner }    → reserva nueva (trigger en la base):
//        confirmación al cliente + aviso al dueño (salvo que la haya cargado el dueño).
//   { type: 'cancelled', reservation_id }           → cancelación (trigger en la base):
//        si canceló el cliente avisa al dueño; si canceló el negocio avisa al cliente.
//
// Secrets necesarios (supabase secrets set ...):
//   RESEND_API_KEY   → API key de https://resend.com
//   REMINDER_SECRET  → secreto compartido con la base (header x-reminder-secret)
//   REMINDER_FROM    → remitente base, ej: "RESER <reservas@tudominio.com>". El nombre se
//                      reemplaza por "<Negocio> vía RESER"; solo importa la dirección.
//   APP_URL          → URL pública de la app, ej: https://reser.com (para los enlaces de
//                      cancelar). Sin definir usa http://localhost:5175 (solo desarrollo).

import {
  clientCancelledByBusiness,
  clientConfirmation,
  clientReminder,
  ownerClientCancelled,
  ownerNewBooking,
  senderFor,
  type Mail,
  type MailContext,
  type MailReservation,
} from './mail.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const MAIL_FROM = Deno.env.get('REMINDER_FROM') ?? 'RESER <onboarding@resend.dev>'
const SECRET = Deno.env.get('REMINDER_SECRET') ?? ''
const APP_URL = (Deno.env.get('APP_URL') ?? 'http://localhost:5175').replace(/\/+$/, '')

const ctx: MailContext = { appUrl: APP_URL }
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

const SELECT =
  'id,starts_at,status,cancel_token,cancelled_by,' +
  'clients(name,email,phone),services(name),resources(name),' +
  'businesses(name,slug,timezone,owner_id,cancel_min_hours)'

const serviceHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }

type Result = { to: string; ok: boolean; detalle?: string }

async function sendMail(
  to: string,
  mail: Mail,
  r: MailReservation,
  kind: string,
  replyTo?: string | null,
): Promise<Result> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      // Si la base reintenta, Resend no manda dos veces el mismo aviso.
      'Idempotency-Key': `${kind}-${r.id}-${to}`,
    },
    body: JSON.stringify({
      from: senderFor(r.businesses?.name ?? '', MAIL_FROM),
      to,
      subject: mail.subject,
      html: mail.html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  })
  return { to, ok: res.ok, detalle: res.ok ? undefined : await res.text() }
}

async function fetchReservations(filter: string): Promise<MailReservation[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/reservations?select=${SELECT}&${filter}`, { headers: serviceHeaders })
  if (!res.ok) throw new Error(`error consultando reservas: ${res.status} ${await res.text()}`)
  return (await res.json()) as MailReservation[]
}

async function ownerEmail(ownerId: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${ownerId}`, { headers: serviceHeaders })
  if (!res.ok) return null
  return ((await res.json()) as { email?: string }).email ?? null
}

async function sendEvent(type: 'booked' | 'cancelled', id: string, byOwner: boolean) {
  const [r] = await fetchReservations(`id=eq.${id}`)
  if (!r) return { ok: false, detalle: 'reserva inexistente', resultados: [] }

  const resultados: Result[] = []
  const clientEmail = r.clients?.email ?? null
  const owner = r.businesses ? await ownerEmail(r.businesses.owner_id) : null

  if (type === 'booked' && r.status === 'confirmed') {
    if (clientEmail) resultados.push(await sendMail(clientEmail, clientConfirmation(r, ctx), r, 'booked-client', owner))
    if (!byOwner && owner) resultados.push(await sendMail(owner, ownerNewBooking(r), r, 'booked-owner', clientEmail))
  }

  if (type === 'cancelled' && r.status === 'cancelled') {
    if (r.cancelled_by === 'client' && owner) {
      resultados.push(await sendMail(owner, ownerClientCancelled(r), r, 'cancelled-owner', clientEmail))
    }
    if (r.cancelled_by === 'owner' && clientEmail) {
      resultados.push(await sendMail(clientEmail, clientCancelledByBusiness(r, ctx), r, 'cancelled-client', owner))
    }
  }

  return { ok: true, resultados }
}

async function sendReminders() {
  const now = Date.now()
  const from = new Date(now + 50 * 60_000).toISOString()
  const to = new Date(now + 70 * 60_000).toISOString()
  const rows = await fetchReservations(
    `status=eq.confirmed&reminder_sent_at=is.null&starts_at=gte.${from}&starts_at=lte.${to}`,
  )

  const resultados: Array<Result & { id: string }> = []
  for (const r of rows) {
    const email = r.clients?.email
    if (email) {
      const owner = r.businesses ? await ownerEmail(r.businesses.owner_id) : null
      const result = await sendMail(email, clientReminder(r, ctx), r, 'reminder', owner)
      resultados.push({ id: r.id, ...result })
      if (!result.ok) continue // no marcar: se reintenta en la próxima corrida
    } else {
      // Sin email no hay a quién recordarle: se marca igual para no reintentar.
      resultados.push({ id: r.id, to: '', ok: false, detalle: 'sin email' })
    }

    await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${r.id}`, {
      method: 'PATCH',
      headers: { ...serviceHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ reminder_sent_at: new Date().toISOString() }),
    })
  }
  return { procesadas: rows.length, resultados }
}

Deno.serve(async (req) => {
  try {
    if (!SECRET) return new Response('REMINDER_SECRET no configurada', { status: 500 })
    if (req.headers.get('x-reminder-secret') !== SECRET) return new Response('unauthorized', { status: 401 })
    if (!RESEND_API_KEY) return new Response('RESEND_API_KEY no configurada', { status: 500 })

    const body = (await req.json().catch(() => ({}))) as {
      type?: string
      reservation_id?: string
      by_owner?: boolean
    }
    const type = body.type ?? 'reminders'

    if (type === 'reminders') return Response.json(await sendReminders())

    if (type === 'booked' || type === 'cancelled') {
      if (!body.reservation_id || !UUID.test(body.reservation_id)) {
        return new Response('reservation_id inválido', { status: 400 })
      }
      return Response.json(await sendEvent(type, body.reservation_id, body.by_owner === true))
    }

    return new Response('tipo desconocido', { status: 400 })
  } catch (err) {
    return new Response(`error interno: ${String(err)}`, { status: 500 })
  }
})
