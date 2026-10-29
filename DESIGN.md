---
name: Rundi — Ride Search
description: Panel inferior arrastrable sobre mapa; selección por tinte de fondo, jerarquía por peso tipográfico, cero sombras internas.
colors:
  accent-brass: "#b38737"
  accent-strong: "#c38d28"
  accent-strong-dark: "#e8c47f"
  accent-soft: "#b387371a"
  accent-soft-dark: "#b3873742"
  accent-border: "#b3873773"
  surface: "#F5F5F5"
  surface-dark: "#1E1E1E"
  card: "#FFFFFF"
  card-dark: "#2C2C2C"
  card-2: "#EDEDED"
  card-2-dark: "#4F4F4F"
  input-bg-dark: "#FFFFFF12"
  ink: "#000000"
  ink-dark: "#FFFFFF"
  ink-secondary: "#666666"
  ink-secondary-dark: "#B3B3B3"
  border: "#E0E0E0"
  border-dark: "#3A3A3A"
  success: "#4CAF50"
  warning: "#FFA726"
  overlay: "#00000080"
typography:
  label-uppercase:
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.5px"
  meta:
    fontSize: "12.5px"
    fontWeight: 500
  body:
    fontSize: "14px"
    fontWeight: 600
  title:
    fontSize: "16px"
    fontWeight: 700
  emphasis:
    fontSize: "15px"
    fontWeight: 800
  price:
    fontSize: "19px"
    fontWeight: 800
rounded:
  toggle: "10px"
  chip: "11px"
  icon-bubble: "12px"
  feature-card: "13px"
  control-track: "14px"
  card: "16px"
  summary: "18px"
  sheet: "24px"
  pill: "999px"
spacing:
  gap-tight: "4px"
  gap: "8px"
  gap-section: "10px"
  pad-chip: "8px 12px"
  pad-card: "10px 10px"
  pad-cta: "15px"
components:
  vehicle-option-card:
    backgroundColor: "transparent"
    rounded: "{rounded.card}"
    padding: "0px 10px"
    width: "100%"
  vehicle-option-card-selected:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  icon-bubble:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.icon-bubble}"
    size: "52x44"
  icon-bubble-selected:
    backgroundColor: "{colors.accent-soft}"
    rounded: "{rounded.icon-bubble}"
  passenger-pill:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "2px 7px"
    typography: "{typography.meta}"
  counter-track:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.control-track}"
    padding: "4px"
  counter-button:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.pill}"
    size: "44x44"
  feature-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.feature-card}"
    padding: "{spacing.pad-chip}"
  feature-card-selected:
    backgroundColor: "{colors.accent-soft}"
    rounded: "{rounded.feature-card}"
  mode-chip:
    backgroundColor: "transparent"
    rounded: "{rounded.chip}"
    height: "44"
    padding: "0px 12px"
  mode-chip-selected:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.chip}"
  collapsed-summary:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.summary}"
    padding: "10px 12px"
  fare-card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.control-track}"
    padding: "9px 12px"
    height: "68"
  cta-primary:
    backgroundColor: "{colors.accent-brass}"
    textColor: "#FFFFFF"
    rounded: "{rounded.card}"
    padding: "15px"
    typography: "{typography.title}"
  cta-secondary:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-strong}"
    rounded: "{rounded.control-track}"
    padding: "12px"
---

# Rundi — Sistema visual del panel de búsqueda de viaje

## Overview

**Creative North Star: "La tarjeta flota, el panel respira".**

`SearchRideScreen` es una pantalla map-first: el mapa ocupa todo el viewport y encima flota una bottom sheet arrastrable que contiene todo el formulario (ruta, vehículo, features, resumen, CTA). El panel tiene dos estados — colapsado (peek: resumen compacto + CTA siempre visibles) y expandido (máx. 68% del alto, `SHEET_EXPANDED_RATIO`) — con spring físico (`damping: 26, stiffness: 300`) y handle de 44×5px.

El panel no usa jerarquía por sombras ni bordes de color: la selección se expresa **únicamente con tintes de fondo** (lavado `surface`/`inputBg` en la tarjeta, `accentSoft` dorado en iconos, pills y chips activos). La profundidad dentro del panel sale de alternar dos neutrales (`surface` ↔ `card`), nunca de sombras. Las únicas sombras del sistema viven en el sheet mismo y en los controles flotantes del mapa (botón atrás, burbuja de ruta).

**Key Characteristics:**

- Selección = tinte, nunca borde ni check destacado.
- Dos neutrales en alternancia para anidar controles; hairline dividers solamente.
- Un solo color de acción: latón `#b38737` (accent) en tres intensidades (`strong`, `soft`, `border`).
- Todo número usa `fontVariant: tabular-nums` (precios, ETA, pasajeros, radios).
- Radios grandes y redondeados: 11–24px según nivel de contenedor + pills `999`.

## Colors

La paleta es **Restrained**: neutrales calientes + un acento latón con ≤10% de superficie. Tres derivados del acento cubren todos los estados interactivos; nunca se introduce un segundo hue de acción dentro del panel.

| Token | Light | Dark | Rol |
|---|---|---|---|
| `accent-brass` | `#b38737` | `#b38737` | CTA primario, iconos activos, tinte base |
| `accent-strong` | `#c38d28` | `#e8c47f` | Precios, textos de énfasis sobre accentSoft |
| `accent-soft` | `rgba(179,135,55,.10)` | `rgba(179,135,55,.26)` | Fondos de selección: pills, chips, bubbles |
| `accent-border` | `rgba(179,135,55,.45)` | `rgba(232,196,127,.45)` | Borde de chips/feature-cards seleccionados |
| `surface` | `#F5F5F5` | `#1E1E1E` | Tracks de controles, tarjeta seleccionada (`inputBg`), feature cards |
| `card` | `#FFFFFF` | `#2C2C2C` | Sheet, botones dentro de tracks, fare cards |
| `card-2` | `#EDEDED` | `#4F4F4F` | Botón de foto (terciario) |
| `ink` | `#000000` | `#FFFFFF` | Títulos, valores |
| `ink-secondary` | `#666666` | `#B3B3B3` | Meta, hints, placeholders |
| `border` | `#E0E0E0` | `#3A3A3A` | Hairlines, handle, bordes de chip base |
| `input-bg` | = `surface` | `rgba(255,255,255,.07)` | Lavado de la tarjeta seleccionada |
| `success` | `#4CAF50` | `#81C784` | Confirmación foto/estados ok |
| `warning` | `#FFA726` | `#FFB74D` | Avisos (demanda alta, moto corta) |
| `overlay` | `rgba(0,0,0,.5)` | `rgba(0,0,0,.7)` | Modales (schedule) |

**The Tinted Selection Rule.** Un estado seleccionado nunca gana un borde visible ni un check grande: gana fondo. Tarjeta → `inputBg`; burbuja de icono → `accentSoft`; feature chip → `accentSoft` + `accentBorder`. El borde de `vehicleOptionCard` es permanentemente `1.5px transparent` para que seleccionar no provoque saltos de layout.

**The Two-Neutral Rule.** Para anidar un control dentro del panel se invierten los neutrales: track `surface` contiene botones `card` (counter, mode chips, meta pills del collapsed summary). Prohibido un tercer gris: si surface-no-alcanza, se usa `accentSoft`, no otro neutral.

## Typography

Sin familia custom: system font, jerarquía por escala y peso. El contraste entre pasos es ≥1.25 en los niveles importantes (meta 12.5 → título 16 → precio 19/22).

| Rol | Spec | Uso |
|---|---|---|
| `label-uppercase` | 11 / 700 / ls .5 / caps | "OPCIONES PARA ESTE SERVICIO", labels de summary/fare |
| `meta` | 12–12.5 / 500–600 | ETA, subtítulos, hints, pills de metadata |
| `body` | 14 / 600–700 | Chips de modo, botón de foto |
| `title` | 15–16 / 700–800 | Nombre del servicio, CTA, resumen |
| `price` | 17–22 / 800 / `accent-strong` | Tarifas; el número más grande del panel es el precio del resumen (22) |

**The Tabular Numbers Rule.** Todo dígito visible (precio, minutos ETA, nº de pasajeros, multiplicadores) lleva `fontVariant: ['tabular-nums']`. Un precio que "baila" al actualizarse es un bug visual.

**Peso del acento.** `accent-strong` solo colorea números y textos cortos de énfasis (precio, "Actualizando tarifa"). Jamás titulares largos ni párrafos: el latón rinde por contraste, no por volumen.

## Elevation

Dos niveles de sombra y nada más; todo lo demás es flat.

1. **Sheet** (`shadowOpacity .15 / radius 12 / elevation 12`, top-radius 24) — la única sombra grande; es lo que separa el panel del mapa.
2. **Flotantes del mapa** (`shadowOpacity .12–.15 / radius 8–10 / elevation 5–6`) — back button 44×44, burbuja de ruta (radius 16). Píldoras/pins del mapa pueden usarlas.

Dentro del panel: **cero sombras**. La única excepción es el micro-shadow del mode-chip seleccionado (`opacity .08, radius 4` solo iOS). En dark mode las sombras se sustituyen por `hairlineWidth` borders. Test rápido: si un elemento dentro del sheet pide sombra, lo que necesita es contraste `surface`↔`card` o `accentSoft`, no elevación.

## Components

**Bottom sheet** — `card` bg, top corners 24, `overflow: hidden`. Handle: barra 44×5 `border` centrada en zona de 29px, pan + tap para toggle. Colapsado muestra peek (collapsed-summary) + CTA; el contenido del form se interpola opacity con la altura.

**Vehicle option card** — `radius 16`, borde permanente `1.5px transparent`, padding-x 10. Selected = fondo `inputBg`. Fila superior: icon-bubble + bloque de texto (título + pill de pasajeros + meta + subtítulo) + precio a la derecha. `minHeight 64`.

**Icon bubble** — 52×44 `surface` → `accentSoft` al seleccionar. Contiene imagen de servicio (moto/auto/designado PNG, 46×32 contain) con `accessibilityIgnoresInvertColors`.

**Passenger pill** — pill `999` en `accentSoft`: icono persona en `accent` + valor 13/700 en `ink`. Vive junto al título de la opción.

**Counter control** — track `surface` radius 14 padding 4; botones circulares 44×44 `card` con `remove`/`add`; centro icono+valor 17/800. Disabled = opacity .35.

**Feature card (chip seleccionable)** — ancho de contenido `minWidth 140 / maxWidth 210`, radius 13, `surface` + borde `border`. Fila: icono 16 `accent` + título 13/700 + radio-dot 20 (vacío → relleno `accentBorder` + check 12). Debajo: impacto 12/700 y condición horaria 10. Selected → `accentSoft`+`accentBorder`; disabled → opacity .56. Rail horizontal con scroll.

**Mode chips (designado auto/moto)** — track `surface` radius 14; cada chip `flex:1` minHeight 44 radius 11; selected → `card` + micro-shadow. Icono 16 + label 14/600 + precio 12.

**Collapsed summary** — `surface` radius 18 borde `border`: icon-bubble 40×40 `accentSoft` + título 15/800 + meta 12 + precio 19/800 `accent-strong` + meta-pills `card` (999) + hint de expansión.

**Fare card (resumen)** — `card` radius 14 borde `border` minHeight 68: label-uppercase + pago + precio 22/800 `accent-strong`.

**CTA primario** — `accent-brass`, padding-y 15, radius 16, texto blanco 16/800. Disabled = opacity .5. **CTA secundario** (agendar) — `accentSoft` + `accentBorder`, texto `accent-strong`. **Terciario** (limpiar) — borde `border` + `ink-secondary`.

## Do's and Don'ts

- **Do** expresar selección con lavados de fondo (`inputBg`, `accentSoft`); el check es un detalle, no el mecanismo.
- **Do** mantener bordes de tarjeta transparentes de ancho fijo (1.5px) para cero layout-shift al seleccionar.
- **Do** usar hairline (`StyleSheet.hairlineWidth`) para separar la zona expandida de la tarjeta.
- **Do** auto-dimensionar chips a su contenido (min/max-width), nunca truncar por ancho fijo.
- **Do** dar `fontVariant: tabular-nums` a cualquier dígito.
- **Don't** añadir sombras dentro del sheet; usa alternancia `surface`/`card` o `accentSoft`.
- **Don't** usar el acento latón sobre texto corrido largo ni sobre fondos que no sean `card`/`surface`.
- **Don't** introducir un segundo color de acción en el panel; warning/success solo para estados reales.
- **Don't** crear un tercer neutral; si falta contraste, el problema es de estructura, no de paleta.
- **Don't** renderizar separadores más gruesos que hairline dentro de tarjetas.
