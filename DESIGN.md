---
name: RESER
description: Reservas simples para negocios reales — estudio nocturno, celeste río, vidrio sobre noche.
colors:
  noche: "#080d13"
  noche-panel: "#0e1920"
  noche-card: "#101d25"
  noche-input: "#121f27"
  borde: "#233945"
  borde-fuerte: "#29414c"
  celeste-rio: "#7be5ff"
  celeste-rio-profundo: "#23a6d3"
  celeste-rio-texto: "#64d8f8"
  tinta: "#e8f1f7"
  tinta-suave: "#91a8b4"
  tinta-muda: "#6f858f"
  acierto: "#6ce6bb"
  error: "#ff9b9b"
typography:
  display:
    fontFamily: "Manrope, sans-serif"
    fontSize: "clamp(49px, 6vw, 80px)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.06em"
  display-em:
    fontFamily: "'Playfair Display', serif"
    fontWeight: 600
    lineHeight: 0.98
    letterSpacing: "-0.055em"
  title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "25px"
    fontWeight: 700
    letterSpacing: "-0.05em"
  body:
    fontFamily: "Manrope, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "'DM Mono', monospace"
    fontSize: "10px"
    fontWeight: 500
    letterSpacing: "0.12em"
rounded:
  sm: "8px"
  md: "10px"
  lg: "18px"
  pill: "30px"
spacing:
  xs: "8px"
  sm: "11px"
  md: "20px"
  lg: "34px"
  xl: "70px"
components:
  button-primary:
    backgroundColor: "{colors.celeste-rio}"
    textColor: "#061117"
    rounded: "{rounded.md}"
    padding: "0 17px"
    height: "42px"
  button-primary-hover:
    backgroundColor: "{colors.celeste-rio}"
  button-ghost:
    backgroundColor: "#13202a"
    textColor: "#d3e2e9"
    rounded: "{rounded.md}"
    padding: "0 17px"
  card:
    backgroundColor: "{colors.noche-card}"
    rounded: "{rounded.lg}"
    padding: "34px"
  input:
    backgroundColor: "{colors.noche-input}"
    textColor: "#d3e5eb"
    rounded: "{rounded.sm}"
    height: "39px"
    padding: "0 10px"
  chip-eyebrow:
    textColor: "{colors.celeste-rio-texto}"
    typography: "{typography.label}"
---

> ⚠️ **OBSOLETO.** Este documento describe la paleta anterior ("celeste río"). La fuente de verdad visual es **[`DESIGN_UX.md`](DESIGN_UX.md)** (RESER Noir). Este archivo se reescribe al terminar la migración.

# Design System: RESER

## Overview

**Creative North Star: "El Estudio Nocturno"**

Un taller calmo y profesional después de hora: fondo azul-noche profundo, superficies de vidrio oscuro con bordes finos que delimitan cada zona interactiva, y un solo acento luminoso — el Celeste Río — que marca dónde está la acción. La elegancia es profesional, nunca fría: la serif editorial (Playfair Display) aparece solo en los énfasis del titular, como la firma del dueño en la agenda.

Las partes importantes de la página llaman la atención por contraste de luz, no por ruido: botones primarios con gradiente luminoso y glow, tarjetas que se elevan al hover, y un movimiento constante pero lento (floats de 4–5 s, reveals escalonados) que mantiene la página viva sin distraer de la tarea.

**Key Characteristics:**
- Fondo noche con glows ambientales cian difusos (`blur(90px)`, opacidad ~.17)
- Un solo acento: Celeste Río; el verde `#6ce6bb` está reservado a estados de éxito/confirmación
- Bordes de 1px en `#233945`–`#29414c` delimitan cada target interactivo
- Jerarquía tipográfica extrema: display tight (-0.06em) contra labels mono en versalitas
- Movimiento con física suave: `ease [0.22, 1, 0.36, 1]`, translateY(-2px) en hover

## Colors

Paleta nocturna de un solo acento: azul-noche profundo, superficies escalonadas, y Celeste Río como única voz luminosa.

### Primary
- **Celeste Río** (#7be5ff → #23a6d3 en gradiente 135°): botones primarios, marca, íconos de feature, slots seleccionados. El gradiente va del hielo al río profundo.
- **Celeste Río Texto** (#64d8f8): el acento aplicado a texto (eyebrows, `<em>` serif, links, valores destacados).

### Neutral
- **Noche** (#080d13): fondo global; los glows ambientales viven sobre ella.
- **Noche Panel** (#0e1920): tarjetas principales (booking-card).
- **Noche Card** (#101d25): métricas y cards de dashboard.
- **Noche Input** (#121f27): campos y opciones seleccionables.
- **Borde** (#233945) / **Borde Fuerte** (#29414c): líneas de 1px que recortan cada superficie.
- **Tinta** (#e8f1f7), **Tinta Suave** (#91a8b4), **Tinta Muda** (#6f858f): texto principal, secundario y terciario.

### Acierto
- **Acierto** (#6ce6bb): solo estados confirmados ("Confirmada", checks de onboarding). Nunca decorativo.

### Named Rules
**La Regla de la Voz Única.** El Celeste Río es el único acento de acción en pantalla. Su rareza es el punto: si todo brilla, nada llama la atención.
**La Regla del Verde Ganado.** El verde solo aparece cuando algo ya salió bien (reserva confirmada, asistencia). Nunca como color de marca ni de botón.

## Typography

**Display Font:** Manrope (con sans-serif)
**Énfasis editorial:** Playfair Display itálica (solo `<em>` dentro de titulares)
**Label/Mono Font:** DM Mono (eyebrows, horarios, numeración)

**Character:** Manrope apretada y geométrica hace el trabajo pesado; Playfair itálica entra como un subrayado humano en la frase clave; DM Mono da a los datos (horas, pasos, números) aire de instrumento calibrado.

### Hierarchy
- **Display** (700, clamp(49px, 6vw, 80px), 0.98, -0.06em): titulares de hero y secciones.
- **Display Em** (Playfair 600 itálica): la palabra que lleva el acento dentro del display, en Celeste Río Texto.
- **Title** (700, 25px, -0.05em): encabezados de tarjeta y pasos.
- **Body** (400, 16px, 1.75): párrafos; en tarjetas baja a 11–13px con la misma legibilidad.
- **Label** (DM Mono 500, 10px, +0.12em, mayúsculas): eyebrows, horarios, contadores.

### Named Rules
**La Regla de la Firma.** Playfair itálica aparece una sola vez por titular, sobre la palabra que lleva el significado ("Hacelo *rendir*"). Dos énfasis en la misma frase es ruido.

## Layout

Contenedor de 1180px centrado (1124px en trust-strip, 980px en reserva, 510px en onboarding). El hero es una grilla asimétrica 1.03fr/.97fr; las secciones respiran con 128px de padding vertical. La reserva pública divide intro (.75fr) y tarjeta (1.15fr) con 90px de aire. Breakpoint único a 800px: todo colapsa a una columna, la sidebar del dashboard desaparece, la tipografía display baja a 54px (47px bajo 500px).

## Elevation & Depth

Sistema de vidrio sobre noche: la profundidad no viene de sombras duras sino de tres capas — glow ambiental difuso detrás, superficie semitranslúcida con borde de 1px, y sombra profunda y suave solo en tarjetas elevadas (`0 30px 70px #020609aa`). El `backdrop-filter: blur(10px)` aparece en las tarjetas flotantes del hero.

### Shadow Vocabulary
- **Glow ambiental** (`filter: blur(90px); opacity: .17`): atmósfera, nunca sobre elementos interactivos.
- **Tarjeta elevada** (`0 25px 60px #0206098a`): booking-card, showcase-window.
- **Botón primario** (`0 10px 25px #17a7d52e` → `0 15px 34px #22b7e44a` en hover): la sombra es celeste, no negra; la luz del botón se proyecta.

### Named Rules
**La Regla del Vidrio Quietо.** Las superficies están planas en reposo; la elevación (translateY(-2px a -5px) + sombra celeste) solo aparece como respuesta al hover o foco.

## Shapes

Radios escalonados por jerarquía: 8px en inputs y chips de horario, 10px en botones y opciones, 18–19px en tarjetas grandes, 30px pill solo en el badge del hero. Los avatares y el stepper son círculos perfectos. Los bordes de 1px son obligatorios en todo target interactivo: es lo que "recorta" la superficie sobre la noche.

## Components

### Buttons
- **Shape:** radio 10px (9px small, 12px large).
- **Primary:** gradiente Celeste Río 135° sobre tinta oscura `#061117`; min-height 42px; sombra celeste proyectada.
- **Hover / Focus:** translateY(-2px) + sombra ampliada; foco con outline `#60d7ff` a 3px de offset.
- **Ghost / Secondary:** vidrio oscuro `#13202a` con borde `#253945`; hover aclara a `#1a2c37`.
- **Text / Back:** sin fondo, tinta suave que vira a celeste al hover.

### Cards / Containers
- **Corner Style:** 18px (booking-card, onboarding-card, success).
- **Background:** Noche Card/Panel con borde 1px.
- **Shadow Strategy:** tarjeta elevada (ver Elevation); en hover, las feature-cards suben 5px y el borde vira a `#3b7184`.
- **Internal Padding:** 23–40px según jerarquía.

### Inputs / Fields
- **Style:** Noche Input, borde 1px, radio 8px, altura 39px, ícono a la izquierda en tinta muda.
- **Focus:** outline celeste global; el borde del campo no cambia de color, cambia el halo.

### Navigation
- Barra de 92px con marca a la izquierda; links en tinta suave 13px que blanquean al hover; CTA primario small a la derecha. En mobile (<800px) los links desaparecen y queda solo el CTA.

### Stepper (signature)
- Círculos de 32px con DM Mono, conectados por una línea de 1px; el paso activo se invierte: fondo Celeste Río, número en noche.

### Success Orbit (signature)
- Check en círculo de gradiente celeste con halo (`box-shadow: 0 0 0 10px`), envuelto por una órbita punteada que gira en 8s. Es la firma de cierre de la reserva.

## Do's and Don'ts

### Do:
- **Do** reservar el gradiente Celeste Río a una sola acción por pantalla (La Regla de la Voz Única).
- **Do** delimitar todo target interactivo con borde de 1px `#233945`–`#29414c`.
- **Do** usar Playfair itálica una vez por titular, en la palabra con significado.
- **Do** animar con física suave (`ease [0.22, 1, 0.36, 1]`, translateY de -2 a -5px).
- **Do** respetar `prefers-reduced-motion`: el sistema ya lo reduce a 0.01ms.

### Don't:
- **Don't** usar el verde `#6ce6bb` fuera de estados de éxito/confirmación.
- **Don't** poner sombras negras duras; la sombra de un elemento luminoso es celeste.
- **Don't** agregar un segundo color de acento: ni violeta ni naranja compiten con el Celeste Río (los avatares los usan solo como relleno mudo).
- **Don't** introducir esquinas rectas: el radio mínimo del sistema es 8px.
