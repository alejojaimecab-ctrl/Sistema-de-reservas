import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { getAgendaReservation, type Reservation } from './db'

// Avisos de reservas nuevas en el panel. Con la pestaña abierta (aunque esté en segundo plano o minimizada):
// suena un aviso, aparece la notificación del sistema (Windows) y el título de la pestaña cuenta las que llegaron.
// Solo avisan las que hace el cliente desde el enlace (source = 'public'); las cargadas en el panel no.
// El tiempo real respeta el RLS: el dueño recibe las de todo su negocio y cada profesional solo las suyas.

const PREF_KEY = 'reser-avisos-reservas'

export type AlertPermission = NotificationPermission | 'unsupported'

// La preferencia es de cada navegador: cada compu decide si suena
function readPref() {
  try { return localStorage.getItem(PREF_KEY) === 'on' } catch { return false }
}
function writePref(on: boolean) {
  try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off') } catch { /* sin almacenamiento: dura hasta recargar */ }
}
function currentPermission(): AlertPermission {
  return 'Notification' in window ? Notification.permission : 'unsupported'
}

// El navegador solo deja sonar después de un clic o una tecla en la página: el audio se destraba en ese momento
// y desde ahí suena aunque la pestaña quede en segundo plano.
let audio: AudioContext | null = null
async function unlockAudio() {
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Context) return
  audio ??= new Context()
  if (audio.state === 'suspended') await audio.resume().catch(() => undefined)
}

// Dos notas cortas y suaves, sin archivo de sonido. false si el navegador todavía no deja sonar.
function playChime(): boolean {
  const context = audio
  if (!context || context.state !== 'running') return false
  const start = context.currentTime + 0.02
  for (const [frequency, delay] of [[659.25, 0], [987.77, 0.15]]) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, start + delay)
    gain.gain.exponentialRampToValueAtTime(0.3, start + delay + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + 0.8)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(start + delay)
    oscillator.stop(start + delay + 0.85)
  }
  return true
}

// "Juan Pérez · Corte de pelo" y "lun 20 oct, 10:30 · con ale"
export function describeReservation(reservation: Reservation) {
  const date = new Date(reservation.starts_at)
  const day = date.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')
  const time = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const who = [reservation.clients?.name ?? 'Un cliente', reservation.services?.name].filter(Boolean).join(' · ')
  const when = `${day}, ${time}${reservation.resources?.name ? ` · con ${reservation.resources.name}` : ''}`
  return { who, when }
}

export function useReservationAlerts(businessId: string | null, handlers: {
  // Llegó o cambió una reserva (también las manuales): trae esa sola, ya leída (null si no se ve).
  // Sin datos: se reconectó o no se pudo leer la reserva, hay que volver a traer las listas.
  onChange: (change?: { id: string; reservation: Reservation | null }) => void
  onOpen: () => void // clic en la notificación del sistema
}) {
  const [enabled, setEnabled] = useState(readPref)
  const [permission, setPermission] = useState<AlertPermission>(currentPermission)
  const [latest, setLatest] = useState<Reservation | null>(null)
  const handlersRef = useRef(handlers)
  const enabledRef = useRef(enabled)
  useEffect(() => {
    handlersRef.current = handlers
    enabledRef.current = enabled
  })

  // Si se activan o desactivan en otra pestaña, esta se entera
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === PREF_KEY) setEnabled(readPref()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Con los avisos activos, el primer clic o tecla en la página destraba el sonido
  useEffect(() => {
    if (!enabled) return
    const unlock = () => { void unlockAudio() }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [enabled])

  // Título de la pestaña: "(2) Nuevas reservas" mientras no se mira; vuelve al de siempre al volver a la pestaña
  const unseenRef = useRef(0)
  const savedTitleRef = useRef<string | null>(null)
  useEffect(() => {
    const restore = () => {
      if (document.visibilityState !== 'visible' || savedTitleRef.current === null) return
      document.title = savedTitleRef.current
      savedTitleRef.current = null
      unseenRef.current = 0
    }
    document.addEventListener('visibilitychange', restore)
    window.addEventListener('focus', restore)
    return () => {
      document.removeEventListener('visibilitychange', restore)
      window.removeEventListener('focus', restore)
      if (savedTitleRef.current !== null) document.title = savedTitleRef.current
    }
  }, [])

  // Con el panel abierto en varias pestañas avisa una sola (la que tiene el candado); todas actualizan sus listas
  const leaderRef = useRef(!('locks' in navigator))
  useEffect(() => {
    if (!('locks' in navigator)) return
    const controller = new AbortController()
    let release: (() => void) | undefined
    navigator.locks.request('reser-avisos-reservas', { signal: controller.signal }, () => {
      leaderRef.current = true
      return new Promise<void>(resolve => { release = resolve })
    }).catch(() => undefined) // se canceló al salir del panel
    return () => {
      controller.abort()
      release?.()
      leaderRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!businessId) return
    function alertNewReservation(reservation: Reservation) {
      const sounded = playChime()
      if (document.visibilityState === 'visible' && document.hasFocus()) return
      unseenRef.current += 1
      savedTitleRef.current ??= document.title
      document.title = unseenRef.current === 1 ? '(1) Nueva reserva · RESER' : `(${unseenRef.current}) Nuevas reservas · RESER`
      if (currentPermission() !== 'granted') return
      const { who, when } = describeReservation(reservation)
      try {
        // Si ya sonó el aviso propio, la notificación va en silencio para no sonar dos veces
        const notification = new Notification(`Nueva reserva: ${who}`, { body: when, tag: `reserva-${reservation.id}`, icon: '/icon-192.png', silent: sounded })
        notification.onclick = () => {
          window.focus()
          notification.close()
          handlersRef.current.onOpen()
        }
      } catch { /* algunos navegadores (Chrome en Android) solo notifican desde un service worker */ }
    }

    // Se lee solo la reserva que cambió; si falla, se piden las listas de nuevo para no perderla
    const readChanged = (id: string) => getAgendaReservation(id).then(({ reservation, error }) => {
      handlersRef.current.onChange(error ? undefined : { id, reservation })
      return reservation
    })

    let subscribedBefore = false
    const channel = supabase
      .channel(`reservas-nuevas-${businessId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reservations', filter: `business_id=eq.${businessId}` }, payload => {
        const row = payload.new as { id?: string; source?: string }
        if (!row.id) return
        void readChanged(row.id).then(reservation => {
          if (!reservation || row.source !== 'public') return
          setLatest(reservation)
          if (enabledRef.current && leaderRef.current) alertNewReservation(reservation)
        })
      })
      // Un turno que cambia (por ejemplo, lo cancela el cliente) también se ve al instante, sin sonido
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reservations', filter: `business_id=eq.${businessId}` }, payload => {
        const id = (payload.new as { id?: string }).id
        if (id) void readChanged(id)
      })
      .subscribe(status => {
        if (status !== 'SUBSCRIBED') return
        // Al reconectarse (por ejemplo, después de que la compu estuvo suspendida) se trae todo de nuevo
        if (subscribedBefore) handlersRef.current.onChange()
        subscribedBefore = true
      })
    return () => { void supabase.removeChannel(channel) }
  }, [businessId])

  // Se llama desde el clic en "Activar avisos": ahí el navegador deja pedir el permiso y destrabar el sonido
  async function enable() {
    const request = currentPermission() === 'default'
      ? Notification.requestPermission().catch(() => currentPermission())
      : null
    writePref(true)
    setEnabled(true)
    await unlockAudio()
    if (request) await request
    setPermission(currentPermission())
    playChime() // para escuchar cómo suena
  }

  function disable() {
    writePref(false)
    setEnabled(false)
  }

  return { enabled, permission, latest, dismissLatest: () => setLatest(null), enable, disable }
}
