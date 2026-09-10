import { useState } from 'react'
import { motion } from 'motion/react'
import { Bell, CalendarDays, CheckCircle2, Clock3, Ellipsis, LayoutDashboard, LogOut, Plus, Settings2, Sparkles, UsersRound } from 'lucide-react'
import { Brand } from './Brand'
import { formatPrice } from '../data/demo'

type OwnerDashboardProps = { onExit: () => void }

const reservations = [
  { time: '09:30', client: 'Lucía Fernández', service: 'Servicio 1', price: 8500, initials: 'LF', color: 'blue' },
  { time: '10:30', client: 'Bruno Acosta', service: 'Servicio 2', price: 14000, initials: 'BA', color: 'violet' },
  { time: '14:00', client: 'Malena Ruiz', service: 'Servicio 3', price: 19000, initials: 'MR', color: 'orange' },
]

export function OwnerDashboard({ onExit }: OwnerDashboardProps) {
  const [active, setActive] = useState('Resumen')
  return <div className="dashboard">
    <aside className="dashboard-sidebar"><Brand /><div className="business-switch"><span className="mini-logo">TN</span><span><strong>Tu Negocio</strong><small>Córdoba</small></span><Ellipsis size={18} /></div>
      <nav>{['Resumen', 'Agenda', 'Reservas', 'Servicios', 'Configuración'].map((item, index) => { const Icon = [LayoutDashboard, CalendarDays, UsersRound, Sparkles, Settings2][index]; return <button className={active === item ? 'is-active' : ''} key={item} onClick={() => setActive(item)}><Icon size={18} />{item}</button> })}</nav>
      <button className="sidebar-exit" onClick={onExit}><LogOut size={17} /> Salir de la demo</button>
    </aside>
    <main className="dashboard-main"><header className="dashboard-header"><div><p className="eyebrow">Martes, 15 de abril</p><h1>Buen día, Nicolás <span>✦</span></h1></div><div className="header-actions"><button className="icon-button" aria-label="Notificaciones"><Bell size={19} /><i /></button><button className="button button--primary"><Plus size={17} /> Nueva reserva</button></div></header>
      <section className="dashboard-stats"><Metric icon={<CalendarDays size={19} />} label="Turnos para hoy" value="8" detail="3 pendientes"/><Metric icon={<UsersRound size={19} />} label="Clientes este mes" value="124" detail="+18% vs. marzo"/><Metric icon={<CheckCircle2 size={19} />} label="Tasa de asistencia" value="96%" detail="En los últimos 30 días"/></section>
      <section className="dashboard-grid"><div className="agenda-card"><div className="card-heading"><div><p className="eyebrow">Tu agenda</p><h2>Próximas reservas</h2></div><button className="link-button" onClick={() => setActive('Agenda')}>Ver agenda completa</button></div><div className="agenda-list">{reservations.map((reservation, index) => <motion.div className="reservation-row" key={reservation.client} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.1 }}><time>{reservation.time}</time><span className={`avatar avatar--${reservation.color}`}>{reservation.initials}</span><span className="reservation-info"><strong>{reservation.client}</strong><small>{reservation.service}</small></span><b>{formatPrice(reservation.price)}</b><button aria-label={`Acciones para ${reservation.client}`}><Ellipsis size={19} /></button></motion.div>)}</div></div>
        <div className="insight-card"><span className="insight-icon"><Clock3 size={22} /></span><p className="eyebrow">Próximo turno</p><h2>En 34 minutos</h2><p>Lucía Fernández · Servicio 1</p><div className="insight-line"><span /><i /></div><button className="button button--secondary">Ver detalle</button></div>
      </section>
      <section className="activity-card"><div><p className="eyebrow">Actividad</p><h2>RESER trabaja por vos</h2></div><div className="activity-event"><span><CheckCircle2 size={17} /></span><p><strong>Recordatorio enviado</strong><small>Lucía recibirá su aviso una hora antes del turno.</small></p><time>Ahora</time></div></section>
    </main>
  </div>
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <div className="metric"><span className="metric-icon">{icon}</span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>
}
