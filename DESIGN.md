---
name: RESER
description: Reservas simples para negocios reales — RESER Noir: negro y grises neutros, un único acento blanco, Inter.
colors:
  bg: "#0a0a0b"
  surface: "#121214"
  surface-2: "#18181b"
  surface-sel: "#1f1f23"
  surface-hover: "#1c1c20"
  border: "#26262b"
  border-hover: "#3a3a41"
  border-strong: "#e4e4e7"
  text: "#fafafa"
  text-2: "#a1a1aa"
  text-3: "#88888f"
  disabled: "#3f3f46"
  accent: "#ffffff"
  on-accent: "#0a0a0b"
  ok: "#86c5a0"
  danger: "#e5737f"
  warn: "#d4a85a"
typography:
  editorial:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "clamp(28px, 2.6vw, 34px)"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-0.01em"
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(40px, 5vw, 56px)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.12em"
rounded:
  sm: "8px"
  btn: "10px"
  item: "12px"
  card: "16px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.btn}"
    padding: "0 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "#e4e4e7"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.btn}"
    padding: "0 18px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.item}"
    height: "44px"
    padding: "0 12px"
  option-selected:
    backgroundColor: "{colors.surface-sel}"
    textColor: "{colors.text}"
    rounded: "{rounded.item}"
  chip-eyebrow:
    textColor: "{colors.text-3}"
    typography: "{typography.label}"
---

# Design System: RESER Noir

> La guía completa (reglas, componentes, patrones de UX, accesibilidad y checklist por pantalla) está en **[`DESIGN_UX.md`](DESIGN_UX.md)**. Este archivo resume los tokens para las herramientas de diseño.

## Overview

**Creative North Star: "Clásico, con luz"**

Negro profundo, grises neutros sin tinte y un único acento blanco que marca dónde está la acción. La jerarquía se arma con tamaño y gris, nunca con color. La profundidad la da **una sola luz que viene de arriba**:
- las tarjetas tienen el borde más claro arriba, un brillo leve en la cara, grano fino y sombra en capas;
- los campos van hundidos;
- los botones suben al pasar el mouse y se hunden al presionarlos.

Nada de glows ni colores. Inter para todo, con a lo sumo tres pesos. La única excepción es **Source Serif 4** (400) en dos lugares de la portada, por pedido del dueño del producto: los títulos de los paneles de funciones y la segunda línea del título principal ("Hacelo rendir.", en itálica y gris), que hace de contrapunto editorial al Inter bold de la primera. Esos paneles son planos: borde fino, etiqueta en mayúsculas arriba, título con serif y un fragmento de la interfaz.

## Reglas clave

- Todo color sale de un token `var(--…)` definido en `src/styles.css`. Sin azul, celeste ni degradés de color.
- Un solo CTA blanco por pantalla. Los secundarios van con superficie y borde sutil.
- Las opciones seleccionables usan el patrón radio-card: borde claro y check blanco al elegirlas.
- Verde, rojo y ámbar apagados solo para estados (atendido, no vino, pendiente o error), siempre acompañados de un ícono o un texto.
- **Relieve** (tokens `--edge`, `--sheen`, `--grain`, `--hl`, `--elev-1/2`, `--inset` y `--surface-inset`; las reglas están en `src/relief.css`):
  - las tarjetas elevadas, los campos hundidos;
  - degradés neutros de luz de hasta un 12 %;
  - un halo blanco tenue solo bajo el botón principal.
- **Movimiento:**
  - solo los botones suben 1 px en hover, y todos se comprimen al presionarlos;
  - el indicador activo se desliza;
  - los pasos y las secciones cambian sin saltos;
  - las duraciones van de 80 a 420 ms con `cubic-bezier(.16, 1, .3, 1)`;
  - se respeta "reducir movimiento".
- Foco visible con un anillo blanco de 2 px. Contraste AA. Texto legible de 11 px como mínimo; la única excepción es el calendario mensual denso, que usa 10 px.
