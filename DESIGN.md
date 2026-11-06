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

## Modal header + back button (VirtualDocuments)

Patrón para modales full-screen con `animationType="slide"` (referencia: `RundiApp/src/components/driver/DriverProfile/VirtualDocuments.tsx`).

**Back button circular** — 40×40, `borderRadius: 20`, fondo `colors.card`, borde `hairlineWidth` en `colors.border`, micro-shadow iOS (`offset {0,2} / opacity .06 / radius 6`, `elevation: 2`). Icono `Ionicons` `chevron-back` 24 en `colors.text`. `hitSlop={8}` y `accessibilityRole="button"` con label traducido.

**Header centrado** — fila `paddingHorizontal: 20 / paddingTop: 8 / paddingBottom: 18`. Tres celdas: back button (40 fijo) + título (`flex: 1`, 20/700, `textAlign: 'center'`, `numberOfLines={1}`) + spacer de 40px del mismo ancho del botón para que el título quede centrado real. Sin borde inferior; el título ya no compite con el notch porque el inset lo maneja el contenedor.

**Safe area** — dentro de `Modal` usar `useSafeAreaInsets()` y aplicar `paddingTop: insets.top` al contenedor `View` raíz. No usar `SafeAreaView` dentro del modal: no respeta el Dynamic Island.

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

---

# Rundi — RidePreviewScreen (lado conductor)

## Overview

**Creative North Star: "El precio manda, el mapa enmarca".**

`RidePreviewScreen` es la pantalla donde el conductor evalúa un viaje entrante: mapa full-bleed con la ruta origen→destino dibujada y una bottom sheet fija (no arrastrable) que colapsa por tap en el handle. A diferencia del sheet de búsqueda, aquí la información ya está decidida — el trabajo del UI es presentar cliente, precio y negociación con máxima legibilidad para una decisión de ~5 segundos.

La estructura del sheet es siempre la misma, de arriba hacia abajo:

1. **Handle** (tap = toggle expandir/colapsar; anima altura + opacity del bloque de negociación, 240ms cubic).
2. **`RidePreviewNegotiation`** — banner de estado + `priceCard` con hero de precio, chips de sugerencia, toggle de oferta custom y fila de precio final. Es la zona que colapsa.
3. **`RidePreviewClientInfo`** — fila cliente (avatar + nombre + meta + acciones de contacto). Siempre visible.
4. **`RidePreviewActions`** — CTAs Aceptar/Rechazar de ancho completo. Siempre visibles.

Referencias de implementación: layout y tokens en `RundiApp/src/screens/Driver/RidePreviewScreen.tsx` (StyleSheet al final), subcomponentes en `RundiApp/src/components/driver/RidePreview/`.

**Key Characteristics:**

- Un solo número grande: el precio hero 30/800. Todo lo demás compite por debajo (≤18).
- Estados de negociación por **tinte semántico**: azul = mi oferta en espera, verde = oferta del cliente. Nunca neutro.
- Sugerencias rápidas en **verde-dinero** (`rgba(125,230,173,*)`); el latón queda reservado a acciones (editar, enviar, ofertar).
- Aceptar = `warning` ámbar con texto oscuro `#0D0D0D` (no blanco); Rechazar = `error` con texto blanco.
- Sombras permitidas: sheet, FAB de regreso, `nearbyCard`, micro-shadow de `priceCard`. Resto flat.

## Colores propios

Reusa la paleta base (`primary` = `#b38737`, `card`, `text`, `textSecondary`, `border`, `warning`, `error`). Tokens adicionales específicos del preview:

| Token | Light | Dark | Uso |
|---|---|---|---|
| `priceCard-bg` | `#FFF6E6` | `rgba(33,33,33,.9)` | Fondo crema cálido de la tarjeta de precio |
| `priceCard-border` | `#E3C592` | `rgba(255,255,255,.06)` | Borde de `priceCard` (`borderWidth: .3`) |
| `divider-warm` | `#E5D5B8` | `rgba(255,255,255,.08)` | Hairline de `finalRow` dentro de priceCard |
| `avatar-bg` | `#F1E4C8` | `rgba(179,135,55,.30)` | Lavado latón detrás del avatar del cliente |
| `iconButton-bg` | `#F2F2F2` | `rgba(255,255,255,.12)` | Botones de contacto (chat/llamada) |
| `suggestion-bg` | `rgba(125,230,173,.25)` | `rgba(125,230,173,.16)` | Chips de sugerencia rápida de precio |
| `suggestion-border` | `rgba(38,140,92,.25)` | `rgba(125,230,173,.32)` | Borde fino de esos chips |
| `suggestion-ink` | `#268C5C` | `#7DE6AD` | Texto de chips de sugerencia |
| `banner-driver` | `rgba(33,150,243,.10)` / `#1565C0` | `rgba(33,150,243,.18)` / `#90CAF9` | "Tu oferta enviada, esperando" |
| `banner-client` | `rgba(76,175,80,.10)` / `#2E7D32` | `rgba(76,175,80,.18)` / `#A5D6A7` | "El cliente sugirió/aceptó" |
| `accentSoft` | `rgba(179,135,55,.10)` | `rgba(179,135,55,.16)` | Fondo de `offerToggle` y wraps de icono |
| `accentBorder` | `rgba(179,135,55,.30)` | `rgba(179,135,55,.45)` | Borde de `offerToggle` |
| `fab-bg` | `rgba(255,255,255,.92)` | `rgba(255,255,255,.18)` | Botón flotante de regreso sobre el mapa |
| `fab-border` | `rgba(0,0,0,.08)` | `rgba(255,255,255,.28)` | Borde del FAB |
| `overlay-photo` | `rgba(0,0,0,.75)` | `rgba(0,0,0,.75)` | Modal de foto del vehículo |

## Tipografía propia

| Rol | Spec | Uso |
|---|---|---|
| `hero-price` | 30 / 800 / ls −0.5 | Valor principal del `priceCard` |
| `final-value` | 18 / 800 / `primary` | "Precio final" (`finalRow`) |
| `client-name` | 17 / 700 | Nombre del cliente |
| `cta` | 16 / 800 | Aceptar / Rechazar / Enviar oferta |
| `toggle-label` | 15 / 700 | `offerToggle`, títulos de banner |
| `toggle-value` | 15 / 800 | Valor latón en `offerToggle` |
| `meta` | 13 / 600 | "Tarifa estimada C$X", subtítulo de banner |
| `trip-meta` | 12 / 500 | "5.2 km • 12 min • Efectivo", nota del cliente |
| `label-uppercase` | 11 / 700 / ls .8 / caps | Labels de sección dentro del priceCard |
| `feature-badge` | 11 / 600 | Badges de características del viaje |
| `input` | 17 / 700 | Campo de oferta custom (prefix `C$` 16/800) |

Todo dígito sigue la **Tabular Numbers Rule** del sistema base.

## Componentes

**Sheet** — absoluta `bottom: 0`, `card` bg, top-radius 24, `paddingHorizontal: 20`, `paddingTop: 8`, `paddingBottom: max(insets.bottom,12)+8`. Sombra `opacity .15 / radius 12 / elevation 12`, offset `{0,-4}`.

**Handle** — zona tappable `paddingVertical: 12`; barra 48×5 `borderRadius: 999`, `rgba(0,0,0,.16)` light / `rgba(255,255,255,.28)` dark.

**FAB back** — 44×44 `borderRadius: 22`, `top: insets.top+12 / left: 20`, `fab-bg` + `fab-border` 1px, sombra flotante `opacity .2 / radius 6 / elevation 6`. Ionicons `chevron-back` 22.

**Client row** — `flexDirection: row`, `marginBottom: 16`. Avatar 52×52 `borderRadius: 16` sobre `avatar-bg` (foto o iniciales 18/800 en `primary`). Info `flex:1, gap:2`: nombre 17/700 → meta 13/600 `textSecondary` → trip-meta 12/500 → `featureBadges` (radius 8, pad `3×7`, gap 4, texto 11/600 en color de feature sobre su tinte 12%) → nota del cliente 12/500. Contact actions: dos `iconButton` (minHeight 44, radius 13, `iconButton-bg`, icono 22 `textSecondary`).

**Negotiation banner** — radius 14, `borderWidth: .1`, pad `12×14`, fila gap 12: icon-wrap 36×36 radius 12 sobre tinte → título 15/700 en el acento del estado + subtítulo 13/500 `textSecondary`. Dos variantes: `banner-driver` (azul, mi oferta en espera) y `banner-client` (verde, oferta del cliente).

**Price card** — radius 20, `borderWidth: .3`, pad `18×18`, `gap: 16`, `priceCard-bg` + `priceCard-border`. Micro-shadow `opacity .1 / radius 2 / offset {0,1} / elevation 4` (única sombra dentro del sheet). Header: label uppercase + valor hero 30/800; a la derecha puede vivir el botón terciario "Ver foto" (`iconButton` con icono 18 + texto 12/700).

**Suggestion chips** — fila `gap: 10`; cada chip `flex:1`, radius 14, `minHeight: 46`, `suggestion-bg` + `suggestion-border` 0.1 + texto 14/700 `suggestion-ink`. Seleccionado → `primary` sólido + texto blanco.

**Offer toggle** — radius 14, `borderWidth: .1`, `paddingHorizontal: 16`, `minHeight: 50`, `accentSoft` + `accentBorder`: icono `edit` 18 + label 15/700 + valor 15/800 + chevron `expand-more/less` 20, todo en `primary`.

**Custom offer card** — radius 16, `borderWidth: .1`, pad 16, `gap: 12`, bg `#FFFFFF` / `rgba(23,30,38,.92)`. Label uppercase → input row (radius 14, height 52, prefix `C$` 16/800 `textSecondary`, input 17/700) → botón enviar radius 14 `minHeight: 50` `primary`, texto 17/800 blanco ls .3.

**Final row** — `borderTopWidth: 1` en `divider-warm`, `paddingTop: 14`: label uppercase + valor 18/800 `primary`.

**Actions row** — `gap: 12`, `marginTop: 18`, dos botones `flex:1` `minHeight: 54`: Aceptar radius 18 `warning` (icono `check` 20 + texto 16/800 en `#0D0D0D`); Rechazar radius 16 `error` (icono `close` 20 + texto 16/800 blanco). Feedback = Animated scale en press + `opacity: .7` cuando está ocupado (spinner `LoadingIcon` 20).

**Nearby card** — flotante sobre el mapa (`bottom: 140`, `left/right: 12`): radius 14, borde 1px `border`, bg glass `rgba(255,255,255,.96)` / `rgba(0,0,0,.72)`, sombra `opacity .2 / radius 8 / elevation 6`. Icon-wrap 36×36 radius 12 `accentSoft` (icono `near-me` 18 `primary`) + título 13/800 ls .3 + subtítulo 12/600 + botón radius 12 `paddingHorizontal: 16` `minHeight: 40` `primary`, texto 13/800 blanco.

**Route loader** — pill centrada `top: 24`: bg `rgba(0,0,0,.6)`, radius 16, pad `10×16`, spinner `LoadingIcon` 24 + texto 13/500 blanco.

**Photo modal** — `animationType="fade"`, overlay `rgba(0,0,0,.75)`, card `width:100%` radius 16 pad 16 (`#FFF`/`#1F1F1F`), imagen `height: 340` radius 12 contain, botón cerrar radius 24 pad `12×28` `primary` texto 16/700 blanco.

## Do's and Don'ts (preview)

- **Do** mantener el precio hero como el único elemento a 30/800; si otro número crece, sobra jerarquía.
- **Do** colapsar solo la negociación: cliente + CTAs siempre visibles.
- **Do** usar el tinte semántico del banner según quién propuso precio (azul conductor / verde cliente).
- **Do** reutilizar `iconButton` neutro para acciones de contacto; el latón es para negociar.
- **Don't** poner texto blanco sobre el CTA `warning` (va `#0D0D0D`).
- **Don't** agregar un segundo color de sugerencia: chips verdes, acciones latón.
- **Don't** dar sombra a banners ni chips dentro del priceCard.

## Réplica en el lado cliente

`HomeScreenOffersOfferCard` adopta este mismo lenguaje: fila espejo del `clientRow` (avatar 52 r16 lavado latón, nombre 17/700, meta 13/600, trip-meta 12/500), badges estilo `featureBadge`, panel de precio expandido como mini `priceCard` (label uppercase + hero `primary` + hairline), chat como `iconButton` neutro y "Negociar" como réplica del `offerToggle` (`accentSoft` + `accentBorder` + texto `primary`). Estado aceptado = banner verde `banner-client`.

Los modales del flujo de ofertas siguen la misma gramática: `PriceNegotiationModal` usa `priceCard` para el resumen de precios (hero `primary` 18/800 + hairlines `divider-warm`), banner `bannerIconWrap` 36 r12 para la contraoferta, CTAs radius 16 height 52 (aceptar oferta = `warning` + texto `#0D0D0D`, comenzar = `primary` + blanco) e input de contraoferta `offerInputRow` (r14, h52, prefix `C$` 16/800, input 17/700). `DriverReviewsModal` usa el avatar-squircle latón (84 r28 `avatar-bg`), labels uppercase ls .8, chips de cumplidos `accentSoft` y estrellas `primary` — ambos con iconografía Ionicons.
