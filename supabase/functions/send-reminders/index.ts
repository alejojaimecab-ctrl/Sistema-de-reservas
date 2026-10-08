// RESER · Recordatorios por email: 1 hora antes del turno.
//
// Corre cada 5 minutos vía pg_cron (migración 008). Busca reservas
// confirmadas que empiezan dentro de la ventana [now+50min, now+70min]
// y todavía no fueron recordadas (reminder_sent_at is null), les manda
// el email por Resend y las marca como recordadas.
//
// Secrets necesarios (supabase secrets set ...):
//   RESEND_API_KEY     → API key de https://resend.com
//   REMINDER_SECRET    → secreto compartido con el cron (header x-reminder-secret)
//   REMINDER_FROM      → remitente, ej: "RESER <recordatorios@tudominio.com>"
//                        (con el dominio de prueba de Resend: onboarding@resend.dev)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM = Deno.env.get('REMINDER_FROM') ?? 'RESER <onboarding@resend.dev>'
const SECRET = Deno.env.get('REMINDER_SECRET') ?? ''

type ReminderRow = {
  id: string
  starts_at: string
  clients: { name: string; email: string | null } | null
  services: { name: string } | null
  businesses: { name: string; timezone: string } | null
}

function formatLocal(iso: string, timezone: string): { fecha: string; hora: string } {
  const d = new Date(iso)
  const fecha = new Intl.DateTimeFormat('es-AR', {
    timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long',
  }).format(d)
  const hora = new Intl.DateTimeFormat('es-AR', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
  return { fecha, hora }
}

function buildHtml(row: ReminderRow): string {
  const tz = row.businesses?.timezone ?? 'America/Argentina/Buenos_Aires'
  const { fecha, hora } = formatLocal(row.starts_at, tz)
  const negocio = row.businesses?.name ?? 'el negocio'
  const servicio = row.services?.name ?? 'tu turno'
  const nombre = row.clients?.name ?? ''
  return `
  <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a2b33;">
    <h2 style="margin-bottom: 4px;">¡Te esperamos en 1 hora, ${nombre}!</h2>
    <p style="color: #4a5f6a;">Recordatorio de tu turno en <strong>${negocio}</strong></p>
    <div style="background: #f2f8fb; border-radius: 12px; padding: 16px 20px; margin: 16px 0;">
      <p style="margin: 0 0 6px;"><strong>Servicio:</strong> ${servicio}</p>
      <p style="margin: 0 0 6px;"><strong>Día:</strong> ${fecha}</p>
      <p style="margin: 0;"><strong>Hora:</strong> ${hora} h</p>
    </div>
    <p style="color: #4a5f6a; font-size: 14px;">Si no podés asistir, avisale a ${negocio} cuanto antes.</p>
  </div>`
}

Deno.serve(async (req) => {
  try {
  // Protección: solo el cron (o quien tenga el secreto) puede dispararlo.
  if (SECRET && req.headers.get('x-reminder-secret') !== SECRET) {
    return new Response('unauthorized', { status: 401 })
  }
  if (!RESEND_API_KEY) {
    return new Response('RESEND_API_KEY no configurada', { status: 500 })
  }
  const now = Date.now()
  const from = new Date(now + 50 * 60_000).toISOString()
  const to = new Date(now + 70 * 60_000).toISOString()

  const url =
    `${SUPABASE_URL}/rest/v1/reservations` +
    `?select=id,starts_at,clients(name,email),services(name),businesses(name,timezone)` +
    `&status=eq.confirmed&reminder_sent_at=is.null` +
    `&starts_at=gte.${from}&starts_at=lte.${to}`

  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  })
  if (!res.ok) {
    return new Response(`error consultando reservas: ${res.status} ${await res.text()}`, { status: 502 })
  }
  const rows = (await res.json()) as ReminderRow[]

  const resultados: { id: string; ok: boolean; detalle?: string }[] = []

  for (const row of rows) {
    const email = row.clients?.email
    if (!email) {
      // Sin email no hay a quién recordarle: se marca igual para no reintentar.
      resultados.push({ id: row.id, ok: false, detalle: 'sin email' })
    } else {
      const send = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM,
          to: email,
          subject: `Tu turno en ${row.businesses?.name ?? 'RESER'} es en 1 hora`,
          html: buildHtml(row),
        }),
      })
      resultados.push({ id: row.id, ok: send.ok, detalle: send.ok ? undefined : await send.text() })
      if (!send.ok) continue // no marcar: se reintenta en el próximo cron
    }

    await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ reminder_sent_at: new Date().toISOString() }),
    })
  }

  return Response.json({ procesadas: rows.length, resultados })
  } catch (err) {
    return new Response(`error interno: ${String(err)}`, { status: 500 })
  }
})
