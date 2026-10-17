// RESER · Armado de los mails (remitente, textos y HTML). Sin acceso a red ni a la base:
// solo funciones puras, así es fácil de revisar. Todo texto que viene de un usuario
// (nombre del cliente, del negocio, teléfono...) pasa por esc() antes de ir al HTML.

export type MailReservation = {
  id: string
  starts_at: string
  status: string
  cancel_token: string
  cancelled_by: string | null
  clients: { name: string; email: string | null; phone: string | null } | null
  services: { name: string } | null
  resources: { name: string } | null
  businesses: {
    name: string
    slug: string
    timezone: string
    owner_id: string
    cancel_min_hours: number
    phone: string | null
    address: string | null
  } | null
}

export type MailContext = { appUrl: string }

export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}

// Una sola línea de texto plano: sirve para asuntos y para el nombre del remitente.
export function oneLine(value: unknown, max = 80): string {
  return String(value ?? '').replace(/[\r\n\t<>",;]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

// "Peluquería Vero vía RESER <reservas@dominio.com>"
export function senderFor(businessName: string, mailFrom: string): string {
  const address = mailFrom.match(/<([^>]+)>/)?.[1] ?? mailFrom.trim()
  return `${oneLine(businessName, 50) || 'Tu negocio'} vía RESER <${address}>`
}

function when(iso: string, timezone: string): { fecha: string; hora: string } {
  const d = new Date(iso)
  const fecha = new Intl.DateTimeFormat('es-AR', {
    timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long',
  }).format(d)
  const hora = new Intl.DateTimeFormat('es-AR', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
  return { fecha: fecha.charAt(0).toUpperCase() + fecha.slice(1), hora }
}

function layout(heading: string, intro: string, rows: Array<[string, string]>, extra = ''): string {
  const detail = rows
    .filter(([, value]) => value !== '')
    .map(([label, value]) => `<p style="margin: 0 0 6px;"><strong>${esc(label)}:</strong> ${esc(value)}</p>`)
    .join('')
  return `
  <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a2b33;">
    <h2 style="margin-bottom: 4px;">${esc(heading)}</h2>
    <p style="color: #4a5f6a;">${intro}</p>
    <div style="background: #f2f8fb; border-radius: 12px; padding: 16px 20px; margin: 16px 0;">${detail}</div>
    ${extra}
    <p style="color: #8a9aa3; font-size: 12px; margin-top: 24px;">Enviado con RESER</p>
  </div>`
}

function cancelBlock(r: MailReservation, ctx: MailContext): string {
  const hours = r.businesses?.cancel_min_hours ?? 0
  const policy = hours > 0 ? `Podés cancelar hasta ${hours} hs antes del turno.` : 'Podés cancelar cuando quieras.'
  const url = `${ctx.appUrl}/cancelar/${r.cancel_token}`
  return `
    <p style="color: #4a5f6a; font-size: 14px;">Si no podés asistir, avisanos para liberar el horario. ${esc(policy)}</p>
    <p><a href="${esc(url)}" style="display: inline-block; background: #1a2b33; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-size: 14px;">Cancelar mi turno</a></p>`
}

function rowsFor(r: MailReservation): Array<[string, string]> {
  const tz = r.businesses?.timezone ?? 'America/Argentina/Buenos_Aires'
  const { fecha, hora } = when(r.starts_at, tz)
  return [
    ['Servicio', r.services?.name ?? 'Turno'],
    ['Profesional', r.resources?.name ?? ''],
    ['Día', fecha],
    ['Hora', `${hora} h`],
  ]
}

// Dónde queda el negocio y cómo llamarlo (solo en los mails al cliente)
function placeRows(r: MailReservation): Array<[string, string]> {
  return [['Dónde', r.businesses?.address ?? ''], ['Teléfono del negocio', r.businesses?.phone ?? '']]
}

const business = (r: MailReservation) => r.businesses?.name ?? 'el negocio'
const client = (r: MailReservation) => r.clients?.name ?? 'Cliente'

export type Mail = { subject: string; html: string }

// Al cliente, apenas reserva
export function clientConfirmation(r: MailReservation, ctx: MailContext): Mail {
  return {
    subject: `Tu turno en ${oneLine(business(r))} está confirmado`,
    html: layout(
      `¡Listo, ${client(r)}! Tu turno está confirmado`,
      `Reservaste en <strong>${esc(business(r))}</strong>.`,
      [...rowsFor(r), ...placeRows(r)],
      cancelBlock(r, ctx),
    ),
  }
}

// Al cliente, 1 hora antes
export function clientReminder(r: MailReservation, ctx: MailContext): Mail {
  return {
    subject: `Tu turno en ${oneLine(business(r))} es en 1 hora`,
    html: layout(
      `¡Te esperamos en 1 hora, ${client(r)}!`,
      `Recordatorio de tu turno en <strong>${esc(business(r))}</strong>.`,
      [...rowsFor(r), ...placeRows(r)],
      cancelBlock(r, ctx),
    ),
  }
}

// Al cliente, si el negocio cancela
export function clientCancelledByBusiness(r: MailReservation, ctx: MailContext): Mail {
  const bookAgain = r.businesses?.slug
    ? `<p><a href="${esc(`${ctx.appUrl}/${r.businesses.slug}`)}" style="color: #1a2b33;">Reservar otro horario</a></p>`
    : ''
  return {
    subject: `${oneLine(business(r))} canceló tu turno`,
    html: layout(
      `${client(r)}, tu turno fue cancelado`,
      `<strong>${esc(business(r))}</strong> canceló este turno. Perdón por el inconveniente.`,
      rowsFor(r),
      bookAgain,
    ),
  }
}

function clientRows(r: MailReservation): Array<[string, string]> {
  return [
    ['Cliente', client(r)],
    ['Email', r.clients?.email ?? ''],
    ['Teléfono', r.clients?.phone ?? ''],
    ...rowsFor(r),
  ]
}

// Al dueño, reserva nueva hecha por un cliente
export function ownerNewBooking(r: MailReservation): Mail {
  const tz = r.businesses?.timezone ?? 'America/Argentina/Buenos_Aires'
  const { fecha, hora } = when(r.starts_at, tz)
  return {
    subject: `Nueva reserva: ${oneLine(client(r))} · ${fecha} ${hora} h`,
    html: layout('Tenés una reserva nueva', `Reservó <strong>${esc(client(r))}</strong>.`, clientRows(r)),
  }
}

// Al dueño, cuando el cliente cancela
export function ownerClientCancelled(r: MailReservation): Mail {
  const tz = r.businesses?.timezone ?? 'America/Argentina/Buenos_Aires'
  const { fecha, hora } = when(r.starts_at, tz)
  return {
    subject: `Cancelación: ${oneLine(client(r))} · ${fecha} ${hora} h`,
    html: layout(
      'Un cliente canceló su turno',
      `<strong>${esc(client(r))}</strong> canceló. El horario quedó libre.`,
      clientRows(r),
    ),
  }
}
