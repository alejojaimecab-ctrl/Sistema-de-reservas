import { useEffect } from 'react'

export const SITE_NAME = 'RESER'
export const HOME_TITLE = 'RESER — Sistema de reservas online para tu negocio'
export const HOME_DESCRIPTION = 'RESER organiza los turnos de tu negocio: tus clientes reservan online desde un enlace, reciben confirmación por mail y vos ves toda la agenda en un solo lugar.'

export type PageMeta = {
  title: string
  description?: string
  // Pantallas privadas (panel, cancelar un turno, recuperar contraseña): que los buscadores no las indexen
  noindex?: boolean
}

// Los buscadores muestran ~160 caracteres de la descripción
const clamp = (text: string, max = 160) => text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`

function setNamedMeta(name: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.name = name
    document.head.appendChild(tag)
  }
  tag.content = content
}

// Cada pantalla declara su título; no hace falta restaurarlo al salir porque la pantalla siguiente declara el suyo.
// Con null no toca nada (la pantalla hija se encarga).
export function usePageMeta(meta: PageMeta | null) {
  const title = meta?.title
  const description = meta?.description
  const noindex = meta?.noindex

  useEffect(() => {
    if (title === undefined) return
    document.title = title
    setNamedMeta('description', clamp(description ?? HOME_DESCRIPTION))
    setNamedMeta('robots', noindex ? 'noindex, nofollow' : 'index, follow')
  }, [title, description, noindex])
}
