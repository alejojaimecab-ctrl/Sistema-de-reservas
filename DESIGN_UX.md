# RESER Noir · Sistema de diseño y UX

> **Fuente de verdad visual del sistema.** Reemplaza la paleta "celeste río" documentada en `DESIGN.md`.
> Se derivó de la captura de referencia del panel de reservas (barbería, "Reservá tu turno online") y se aplica a **todo** el sistema: landing, reserva pública, acceso, onboarding y panel del dueño/profesional.
> Los HEX se estimaron de la captura; los marcados con ⚑ se ajustaron para cumplir contraste AA.

---

## 0. Reglas de la migración

1. **Cero cambios de lógica.** La migración es solo visual y de UX.
   - **Se permite** tocar CSS, `className`, el marcado y los envoltorios, los íconos y los textos estáticos, y pasar estilos inline a clases.
   - **No se toca** nada de esto: estado, handlers, props, condiciones, valores por defecto, orden de pasos, validaciones, datos, auth, rutas, base de datos ni Edge Functions.
2. **Si algo se rompe, se arregla hasta que funcione igual que antes.** Si no se puede, se revierte el cambio.
3. **Todo color sale de un token** (`var(--…)`). No se escriben HEX sueltos en componentes nuevos ni migrados.
4. **Sin azul ni celeste.** El único acento es el blanco. Los colores con significado (ok, error y aviso) son apagados y se usan solo para estados.

---

## 1. Paleta

### Tokens

```css
:root {
  /* Fondos */
  --bg:            #0A0A0B;  /* lienzo de página */
  --surface:       #121214;  /* tarjeta principal, paneles */
  --surface-2:     #18181B;  /* ítems de lista, inputs, filas */
  --surface-sel:   #1F1F23;  /* ítem seleccionado / hover fuerte */
  --surface-hover: #1C1C20;  /* hover suave */

  /* Bordes */
  --border:        #26262B;  /* contorno sutil, separadores */
  --border-hover:  #3A3A41;  /* hover de ítems */
  --border-strong: #E4E4E7;  /* ítem seleccionado */

  /* Texto */
  --text:          #FAFAFA;  /* títulos, nombres, valores */
  --text-2:        #A1A1AA;  /* descripciones, párrafos */
  --text-3:        #82828B;  /* ⚑ metadatos: duración, eyebrow, ayudas (era #71717A) */
  --disabled:      #3F3F46;  /* radios vacíos, pasos inactivos, controles deshabilitados */

  /* Acento */
  --accent:        #FFFFFF;  /* CTA, check de selección, paso completado */
  --accent-hover:  #E4E4E7;
  --on-accent:     #0A0A0B;  /* texto/ícono sobre acento */

  /* Semánticos (apagados) */
  --ok:            #86C5A0;  --ok-bg:     #13201A;  --ok-border:     #2A4536;
  --danger:        #E5737F;  --danger-bg: #241416;  --danger-border: #4A2A2F;
  --warn:          #D4A85A;  --warn-bg:   #231C10;  --warn-border:   #4A3B1E;

  /* Foco */
  --focus:         #FFFFFF;

  /* Radios */
  --r-card: 16px;   /* tarjetas, paneles, diálogos */
  --r-item: 12px;   /* ítems de lista, inputs, chips grandes */
  --r-btn:  10px;   /* botones */
  --r-sm:   8px;    /* chips chicos, badges */
  --r-full: 999px;  /* íconos circulares, radios, avatares */

  /* Relieve "Noir con luz": una sola luz que viene de arriba (ver §4) */
  --surface-inset: #0E0E10;                     /* campos y zonas hundidas */
  --hl:        inset 0 1px 0 rgb(255 255 255 / .05);   /* borde de luz arriba */
  --hl-strong: inset 0 1px 0 rgb(255 255 255 / .09);   /* idem, en hover o elegido */
  --edge:      linear-gradient(180deg, rgb(255 255 255 / .12), … .015);  /* borde de tarjeta, más claro arriba */
  --sheen:     linear-gradient(180deg, rgb(255 255 255 / .028), transparent 55%);  /* brillo en la cara */
  --grain:     ruido SVG (feTurbulence) al ~3 %;      /* material del negro */
  --elev-1:    sombra corta (controles);  --elev-2: sombra en capas (tarjetas);
  --inset:     inset 0 1px 2px rgb(0 0 0 / .45);       /* hundido */
  --ease-out:  cubic-bezier(.16, 1, .3, 1);
  --shadow-card: var(--elev-2);
  --shadow-pop:  0 2px 4px rgb(0 0 0 / .5), 0 24px 48px -16px rgb(0 0 0 / .9);  /* diálogos, menús flotantes */
}
```

### Uso de cada color

| Rol | Token | Uso permitido |
|---|---|---|
| Fondo | `--bg` | Solo el lienzo. Se puede usar un velo de luz blanca muy tenue (opacidad ≤ 4 %) a un costado, como en la captura. |
| Superficie | `--surface` | Tarjetas y paneles. |
| Superficie 2 | `--surface-2` | Cosas dentro de una tarjeta: ítems, inputs y filas. |
| Seleccionado | `--surface-sel` + `--border-strong` | Opción elegida. Siempre va acompañada de un check o un radio lleno. |
| Texto | `--text` / `--text-2` / `--text-3` | La jerarquía se marca con gris, **nunca con color**. |
| Acento | `--accent` | Un único CTA principal por pantalla, el check de selección y el progreso completado. |
| Semánticos | `--ok` / `--danger` / `--warn` | Solo estados: atendido, confirmado, no vino, error, pendiente o aviso. Nunca como decoración. |

### Contraste (AA)

- `--text` sobre `--surface` da más de 18:1.
- `--text-2` sobre `--surface` da unos 7:1.
- `--text-3` sobre `--surface` da unos 4,8:1, así que vale como mínimo para texto chico.
- **No usar** `--disabled` para texto legible. Es solo para controles inactivos y decoración.

---

## 2. Tipografía

- **Familia principal:** `Inter`, sans-serif neo-grotesca. Se carga desde Google Fonts con los pesos 400, 500, 600 y 700.
- **Serif editorial (excepción, diseño del dueño, 2026-10-19):** `Source Serif 4` 400 (token `--font-serif`). Va **solo** en los títulos de los paneles de funciones de la portada (`.feature-panel h3`) y en la inicial del remitente del mail de ejemplo. No se usa en el panel ni en la reserva.
- `font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;`
- **No se usan** serif, cursivas decorativas ni monoespaciadas.
- **Números** (precios, horas, fechas y contadores): `font-variant-numeric: tabular-nums;`

| Estilo | Tamaño | Peso | Interlineado | Tracking | Uso |
|---|---|---|---|---|---|
| Display | `clamp(40px, 5vw, 56px)` | 700 | 1.02 | -0.03em | Título del hero ("Reservá tu turno online") |
| H1 de panel | 28px | 600 | 1.15 | -0.02em | Título de sección del panel |
| H2 de tarjeta | 20px | 600 | 1.25 | -0.01em | "Elegí tu servicio" |
| H3 | 15px | 600 | 1.3 | -0.005em | Subtítulos ("¿Con quién querés atenderte?") |
| Cuerpo | 14px | 400 | 1.6 | 0 | Párrafos y descripciones |
| Ítem | 13–14px | 500 | 1.35 | 0 | Nombre de servicio o profesional |
| Meta | 12px | 400 | 1.4 | 0 | Duración y ayudas, en `--text-3` |
| Eyebrow | 11–12px | 600 | 1 | 0.12em, MAYÚSCULAS | "BARBERÍA & CO", en `--text-3` |
| Botón | 14px | 600 | 1 | 0 | CTA y acciones |
| Logo (wordmark) | Según el contexto | 300–400 | 1 | ~0.3em | "RESER" |

- **Cómo se arma la jerarquía:** con tamaño y gris. En todo el sistema hay como máximo 3 pesos: 400, 500/600 y 700, y el 700 queda solo para display.
- **Tamaño mínimo:** ningún texto legible baja de **11px**. La única excepción es el calendario mensual denso (y el calendario en móvil), que usa 10px.

---

## 3. Espaciado y layout

- **Escala** (base 4): `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`.
- **Tarjeta principal:** padding `24px`, y `28–32px` en escritorio ancho.
- **Ítems de lista:** alto de 44–52px, padding `12px 14px` y separación de `8px` entre ítems.
- **Entre bloques dentro de una tarjeta:** `20–24px`. Por ejemplo, del subtítulo a la lista, o de la lista a la siguiente pregunta.
- **Título y subtítulo de tarjeta:** `4–6px` entre ambos y `20px` antes del contenido.
- **Layout de reserva:** 2 columnas, con el hero a la izquierda y la tarjeta de acción a la derecha, unos `40–64px` de separación y un ancho máximo de unos `1120px`. Por debajo de `880px` queda en 1 columna, con el hero compacto arriba.
- **Panel:** contenido con ancho máximo cómodo y tarjetas en grilla con separación de `16px`.
- **Márgenes laterales en móvil:** `16px`, sin scroll horizontal.

---

## 4. Radios, bordes y sombras

- **Radios:** tarjeta `16`, ítem e input `12`, botón `10`, chip chico `8`, y círculo para íconos, radios y avatares.
- **Bordes:** siempre de `1px`. En reposo `--border`, en hover `--border-hover` y seleccionado `--border-strong`.
- **Relieve "Noir con luz"** (desde el 2026-10-19, pedido del dueño del producto: "que tenga relieve, no simples cartas sólidas"). Hay **una sola luz, que viene de arriba**, y todo la respeta. Las reglas viven en `src/relief.css`.
  - **Tarjeta (elevada):** borde con degradé `--edge` (más claro arriba), brillo `--sheen` en la cara, `--grain` y sombra en capas `--elev-2` más `--hl`. En hover (landing y métricas) el borde pasa a `--edge-hover`.
  - **Superficie dentro de una tarjeta:** solo `--sheen` y `--hl`, sin borde de luz propio. No se anidan tarjetas.
  - **Campo (hundido):** fondo `--surface-inset` y sombra `--inset`. Con foco: `--border-strong` más un halo blanco de 4px al 6 %.
  - **Diálogo o menú flotante:** `--shadow-pop` con `--hl-strong`.
  - **Luz ambiente:** un radial blanco de 5 a 7,5 % arriba del fondo de cada pantalla.
  - **Permitido:** degradés neutros de luminosidad (blanco sobre negro) de hasta un 12 % y un halo blanco tenue **solo** debajo del botón principal.
  - **Prohibido:** glows y sombras de color, degradés de color y `backdrop-filter` decorativo. Las excepciones son la nav sticky y la barra inferior del panel en el celular, que pueden usar un blur sutil.

---

## 5. Componentes

### Botón primario (CTA)
- Fondo `--accent`, texto `--on-accent`, peso 600, radio `--r-btn` y alto de 44px (48px en la versión grande).
- **Uno solo por pantalla o paso.** Va a ancho completo dentro de la tarjeta de reserva, con una flecha `→` a la derecha cuando avanza un paso.
- **Volumen:** degradé de `#FFF` a `#E9E9EC`, luz interna arriba, una línea oscura abajo y un halo blanco tenue debajo.
- **Hover:** sube 1px, el halo crece y la flecha `→` avanza 3px.
- **Presionado:** escala .98 y la sombra pasa adentro: se hunde.
- **Deshabilitado:** opacidad .4, sin volumen.

### Botón secundario / ghost
- **Secundario:** fondo `--surface-2` con `--sheen`, borde `--border`, texto `--text` y `--hl`. En hover pasa a `--surface-hover` con `--border-hover`, sube 1px y gana sombra. Al presionarlo se hunde (`--inset`).
- **Ghost / texto:** sin fondo y con `--text-2`. En hover cambia a `--text` y un subrayado crece desde la izquierda.
- **Peligro:** texto `--danger`, fondo `--danger-bg` y borde `--danger-border`. Sin degradé.

### Input / select / textarea
- Fondo `--surface-inset` con `--inset` (hundido), borde `--border`, radio `--r-item`, alto de 44px y texto `--text`. El placeholder va en `--text-3`, con regla `::placeholder` explícita.
- **Foco:** borde `--border-strong` más un halo blanco de 4px al 6 % (y el anillo de foco con teclado).
- **Error:** borde `--danger-border` y un mensaje debajo en `--danger`, de 12px.
- La etiqueta va arriba, en 12px, peso 500 y color `--text-2`.

### Tarjeta
- Fondo `--surface` con `--sheen` y `--grain`, borde de luz `--edge`, radio `--r-card`, padding de 24px y sombra `--shadow-card` más `--hl` (ver §4).

### Ítem seleccionable (radio-card)

Es el patrón central de la captura.

- **Estructura en fila:** [ícono opcional en círculo de 28px sobre `--surface-sel`] · [nombre en 13–14px peso 500 y meta en 12px `--text-3`] · [valor alineado a la derecha, en tabular-nums] · [indicador].
- **Reposo:** fondo `--surface-2`, borde `--border` y un indicador circular vacío de 16px con borde `--disabled`.
- **Hover:** borde `--border-hover`.
- **Seleccionado:** fondo `--surface-sel`, borde `--border-strong` e indicador **relleno blanco con un check oscuro** (`--accent` / `--on-accent`).
- **Todo el ítem es clickeable.** Lleva foco visible y estado `aria-pressed` o `aria-checked`, según lo que ya use el componente.
- **Valor no numérico** ("A consultar"): en `--text-3`, sin destacarlo.

### Progreso de pasos
- Barra horizontal fina de 2px en `--disabled`. El tramo completado es `--accent`.
- Cada paso es un punto de 8px: `--accent` si está hecho o es el actual, y `--disabled` si está pendiente.
- Va arriba de la tarjeta, sin números grandes. Si los pasos son clickeables, conservan esa función.

### Selector de fecha y grilla de horarios
- Celdas con `--surface-2`, borde `--border` y radio `--r-item`.
- **Seleccionada:** `--surface-sel` + `--border-strong`, y el texto pasa a `--text` en peso 600.
- **No disponible:** `--disabled`, sin hover.

### Chips y badges de estado
- Radio `--r-sm`, 11–12px, peso 500.
- **Neutro:** `--surface-2`, `--border` y `--text-2`.
- **Estados:** `--ok`, `--danger` o `--warn` como texto, con su `-bg` y `-border`.

### Íconos
- `lucide-react` con trazo de 1.5–1.75 y tamaño de 16–18px, en color `--text-2` o `--text`.
- **Íconos destacados:** van dentro de un círculo de 32–40px con `--surface-2` y borde `--border`, como los beneficios del hero.

### Navegación superior
- Logo "RESER" en blanco, con tracking amplio.
- Links en 13px `--text-2`, que pasan a `--text` en hover.
- La acción "Iniciar sesión" es un botón contorneado tipo píldora: borde `--border-hover`, texto `--text` y radio `--r-full`.
- Una línea `--border` separa la nav del contenido.

### Diálogo de confirmación
- Fondo `--surface`, borde `--border`, radio `--r-card` y sombra `--shadow-pop`, sobre un velo `rgba(0,0,0,.6)`.
- Las acciones van a la derecha: primero la secundaria y después la primaria o la de peligro.

### Tablas, filas y calendario
- Filas sobre `--surface-2` o separadas por `--border`, y hover con `--surface-hover`.
- **Turnos del calendario:**
  - Base: `--surface-2` con borde `--border` y el texto del turno en `--text`.
  - Atendido: acento `--ok`, con borde izquierdo o badge, más `--ok-bg`.
  - No vino: `--danger`.
  - Pendiente: `--warn`.
  - **El significado no puede depender solo del color:** además lleva un ícono o un texto.

---

## 6. Movimiento

- **Duraciones:** 80–120ms al presionar, 180–220ms para cambios de estado y 300–420ms para cambios de tamaño, de paso o de sección. Curva `--ease-out`. Las salidas son más rápidas que las entradas.
- **Respuesta al tacto:** todo botón se comprime al presionarlo (escala .96–.98).
- **Elevación:** en hover, solo los botones suben 1px. Las tarjetas no saltan: cambian su luz.
- **Continuidad:**
  - el indicador del ítem activo se desliza entre opciones (`SegmentIndicator`, con `layoutId` de motion);
  - el alto de la tarjeta de reserva se anima entre pasos (`AutoHeight`);
  - las secciones del panel entran con un fundido corto y arrancan desde arriba.
- **Números:** las métricas cuentan hacia arriba hasta su valor.
- **Sin** rebotes elásticos ni entradas idénticas en cada sección. Hay un momento propio por pantalla: el verde de confirmación en la reserva y el "de WhatsApp a la agenda" en la portada.
- **Animaciones que se mantienen:** las de marca que ya existen (logo con scroll, check de éxito).
- **Reducir movimiento:** `MotionConfig reducedMotion="user"` en `App.tsx` más las reglas `prefers-reduced-motion` en CSS. Se quitan los desplazamientos y escalas, y quedan los fundidos y los cambios de estado.

---

## 7. Accesibilidad

- **Foco visible siempre:** `outline: 2px solid var(--focus); outline-offset: 2px;`.
- **Contraste:** AA como mínimo. Revisar especialmente `--text-3`.
- **Área táctil** mínima de 44 × 44px.
- **Estados:** nunca se comunican solo con color. Se acompañan con check, ícono o texto.
- **Idioma:** `lang="es"` y textos en español rioplatense.

---

## 8. Patrones de UX

1. **Un paso, una decisión.** Cada pantalla tiene una pregunta clara y un solo CTA.
2. **El estado se ve de un vistazo.** Lo elegido tiene borde claro y check, y lo pendiente se ve vacío.
3. **Textos honestos.** Usar "A consultar" o "Se coordina por WhatsApp" en lugar de inventar un precio o un plazo.
4. **Apoyo breve.** Debajo de cada título va una sola línea en `--text-2`, sin párrafos explicativos.
5. **Luz, no decoración.** El relieve (luz arriba, sombra abajo) le da vida a la interfaz sin competir con la acción. Se usan fragmentos reales del producto en lugar de ilustraciones de relleno, y nada de glows ni degradés de color.
6. **Consistencia.** Si un patrón existe (radio-card, progreso, CTA), se reutiliza en vez de inventar uno nuevo.

---

## 9. Lo que no se usa

- Azul, celeste, cian o cualquier color de marca saturado.
- Degradés de color, glows y sombras de color. Los degradés neutros de luz (§4) sí se usan.
- Cursivas decorativas y monoespaciadas. Serif solo en la excepción de §2 (títulos de los paneles de funciones de la portada).
- Más de un CTA blanco por pantalla.
- HEX sueltos en componentes. Todo va por tokens.
- Texto legible de menos de 11px o en `--disabled`.

---

## 10. Checklist de cumplimiento por pantalla

Cada pantalla migrada tiene que cumplir todo esto antes del commit:

- [ ] No queda ningún HEX azul o cian, y todo color sale de un token.
- [ ] Usa Inter, con a lo sumo 3 pesos, y números en `tabular-nums`.
- [ ] Hay un solo CTA primario blanco.
- [ ] Las tarjetas tienen radio 16, borde de luz (`--edge`) y sombra en capas; los campos están hundidos; los botones suben en hover y se hunden al presionarlos.
- [ ] Respeta "reducir movimiento".
- [ ] Los ítems seleccionables siguen el patrón radio-card.
- [ ] El foco se ve en todos los controles.
- [ ] El contraste es AA y los estados no dependen solo del color.
- [ ] Funciona bien en 375px, 768px y escritorio, sin scroll horizontal.
- [ ] El funcionamiento es **idéntico** al de antes: los mismos flujos, datos, validaciones y mensajes.
- [ ] El `git diff` de los `.tsx` muestra solo clases, marcado, estilos y textos estáticos.

| Pantalla | Archivo(s) | Estado |
|---|---|---|
| Landing | `App.tsx` | hecho |
| Reserva pública (pasos y éxito) | `BookingExperience.tsx`, `SuccessCheck.tsx` | hecho |
| Cancelar reserva | `CancelBooking.tsx` | hecho |
| Login y recuperar contraseña | `Login.tsx`, `ResetPassword.tsx` | hecho |
| Unirse al equipo | `JoinTeam.tsx` | hecho |
| Onboarding y disponibilidad | `Onboarding.tsx`, `AvailabilityEditor.tsx` | hecho |
| Páginas legales | `LegalPage.tsx` | hecho |
| Panel: shell, métricas, agenda y calendario | `OwnerDashboard.tsx` | hecho |
| Panel: reservas | `ReservationsSection.tsx` | hecho |
| Panel: servicios y configuración | `OwnerDashboard.tsx` | hecho |
| Panel: equipo | `TeamSection.tsx` | hecho |
| Panel: mis horarios y días libres | `MyScheduleSection.tsx`, `TimeOffSection.tsx` | hecho |
| Confirmación y error | `ConfirmDialog.tsx`, `ErrorBoundary.tsx` | hecho |
| Logo y marca | `Brand.tsx`, `ScrollBrand.tsx`, `public/` | hecho (PNG en monocromo) |
| Mail de recordatorio | `supabase/functions/send-reminders/mail.ts` | colores listos en local; falta desplegar |
