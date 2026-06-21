# Design System — LanguAI
> Documento canónico de decisiones de diseño. Toda modificación a tokens, tipografía, colores o efectos debe registrarse aquí antes de implementarse en código.

---

## 1. Filosofía visual

**Principio rector**: Minimalismo con vida. La aplicación es austera y funcional, y el glassmorphism es el único agente de "vida" — no el color saturado ni los gradientes de fondo.

**Triángulo de referencia visual**:
| Referencia | Lo que aporta |
|---|---|
| Journal app (tarjetas blancas) | Whitespace, jerarquía tipográfica limpia, airiness |
| 07. Calendar (editorial oscuro) | Tipografía display grande, warm dark, cuerpo terracota/rust como acento |
| WOVE app (arco numerado) | Anti-UI, escala tipográfica como navegación, brutalismo limpio |
| Analytics stories (naranja/negro/blanco) | Formato Spotify Wrapped para analíticas, grandes números como dato principal |
| "7 weeks" streak (crema/rojo) | Composición grande + descripción contextual, warm cream |

**Decisión de modo**: Dark mode por defecto. Light mode soportado desde MVP con mismo sistema de tokens.

---

## 2. Colores — Design Tokens

### 2.1 Base filosófica
- El **fondo oscuro** es negro neutro cálido (no verde bosque). El verde/sage aparece **solo en el blob ambiental**, no en las superficies.
- Las **superficies glass** son siempre derivadas de blanco puro con distintos niveles de opacidad, independientemente del modo.
- El **sage** (`#E9EBD6`) es el único acento cromático orgánico — aparece como blob, nunca como fill de componente.

### 2.2 Tokens por modo

#### Dark Mode
```
background:      #0C0D0B          // Negro neutro cálido. NO verde bosque.
surfaceGhost:    rgba(255,255,255, 0.02)   // Nav pills, paneles de swipe casi invisibles
surfaceSoft:     rgba(255,255,255, 0.47)   // Cards estándar, burbujas de chat
surfaceStrong:   rgba(255,255,255, 0.75)   // Card YouTube URL, modales importantes
text:            #F0EDE6          // Crema cálido — máximo contraste sobre dark
textMuted:       rgba(240,237,230, 0.50)   // 50% — fechas, subtítulos, acotaciones
border:          rgba(255,255,255, 0.28)   // Glass edge glow (Figma fill_OWSGMQ)
borderSubtle:    rgba(255,255,255, 0.08)   // Divisores muy sutiles
blob:            rgba(233,235,214, 0.30)   // Sage al 30% dark (20% era invisible en pantalla física)
accent:          #747E12          // Olive (badge gradient Figma top)
accentLight:     #9AAB28
danger:          rgba(125, 46, 17, 0.90)  // Terracota (Figma fill_NDI5NT)
success:         #4A7A55
```

#### Light Mode
```
background:      #FAFAF7          // Blanco cálido (no puro) — conecta con sage
surfaceGhost:    rgba(255,255,255, 0.02)
surfaceSoft:     rgba(255,255,255, 0.47)
surfaceStrong:   rgba(255,255,255, 0.75)
text:            #1A1A18
textMuted:       rgba(26,26,24,   0.50)
border:          rgba(255,255,255, 0.74)   // Glass bright edge (Figma fill_ER5XBO)
borderSubtle:    rgba(0,0,0,      0.07)
blob:            rgba(233,235,214, 0.80)   // Más opaco en light — el blob "aparece"
accent:          #5C7048
accentLight:     #7A9060
danger:          rgba(125, 46, 17, 0.80)
success:         #3A6644
```

### 2.3 Colores semánticos UI
```
error:    // usa danger
warning:  '#C9A227'              // ámbar para advertencias de feedback
info:     rgba(74, 122, 211, 0.9) // azul para mejoras de feedback
```

### 2.4 Color coding de feedback (no negociable per spec)
- 🔴 `danger` → error grave (rompe contexto)
- 🟡 `warning` → advertencia / circunlocución
- 🔵 `info` → mejora / alternativa más natural

---

## 3. Tipografía

### 3.1 Familias en uso
| Familia | Pesos cargados | Propósito |
|---|---|---|
| Plus Jakarta Sans | ExtraLight 200, Regular 400 | Display, logo, hero |
| Darker Grotesque | Regular 400 | Navegación, captions |
| Bricolage Grotesque | Light 300, Regular 400 | Body text, texto continuo |

### 3.2 Escala de tipos (6 tokens canónicos)

> **Nota técnica**: `letterSpacing` en React Native es `dp`, no `%`.  
> Fórmula de conversión: `LS_dp = (LS_percent / 100) × fontSize`

| Token | Familia | Peso | Size | LS % | LS dp | Uso específico |
|---|---|---|---|---|---|---|
| `display` | Plus Jakarta Sans | Regular 400 | 48 | −5% | **−2.4** | Héros numéricos, datos grandes (analytics) |
| `logo` | Plus Jakarta Sans | ExtraLight 200 | 36 | −2.5% | **−0.9** | "LanguAI" sobre glass, títulos de pantalla |
| `nav` | Darker Grotesque | Regular 400 | 24 | 0% | **0** | Menú lateral, ítems de navegación |
| `body` | Bricolage Grotesque | Regular 400 | 20 | 0% | **0** | Texto corriente, hints, conversación |
| `caption` | Darker Grotesque | Regular 400 | 16 | +2% | **+0.32** | Fechas, sub-subtítulos, acotaciones — siempre al 75% opacity |
| `fine` | Bricolage Grotesque | Light 300 | 16 | 0% | **0** | Feedback post-sesión, texto continuo largo |

### 3.3 Reglas de uso
- `display` solo se usa cuando el número/texto ES el contenido principal (analytics, streak count)
- `caption` siempre se renderiza con `opacity: 0.75` — nunca al 100%
- No mezclar `body` y `fine` en el mismo bloque de texto. Elegir uno por pantalla/componente
- `logo` es el único token con letter spacing negativo fuerte — solo para "LanguAI" y títulos de pantalla grandes

---

## 4. Efectos Glass — 5 Tiers

### Filosofía
El glass es la fuente de vida visual. Pero **se usan máximo 2 tiers distintos en la misma pantalla** y **nunca el mismo tier apilado** (evitar: nav bar `soft` + items `soft` → visual noise).

### Arquitectura (post UI.A.10 — 2026-06-21)
- **Fuente única de verdad:** `theme/index.ts → glass` + `resolveGlass(tier, isDark)`. No hay magic numbers de blur duplicados.
- **Dos componentes, un sistema:**
  - `GlassCard` — contenedor con `children` (cards, modales). Prop `elevated` para "el efecto".
  - `GlassFill` — capas absolutas `blur + fill` sin children, para parents que ya gestionan layout/borde (header btns, mic, YT pill). Reemplaza el antiguo `GlassLayers` inline de HomeScreen.
- **`blur` es per-mode:** en dark el `BlurView` necesita más intensidad para leerse. Los valores son `intensity` de expo-blur (0–100), NO px de CSS `backdrop-filter`.

### Definición de tiers

| Tier | blur (dark/light) | Fill (dark → light) | Border (dark → light) | Uso |
|---|---|---|---|---|
| `ghost` | 8 / 6 | white 0.02 | white 0.14 | Nav pills, swipe panels, casi invisibles |
| `soft` | 20 / 16 | white 0.47 | white 0.56 | Cards de historial, burbujas de chat, cards estándar |
| `medium` | 30 / 38 | white 0.56 | white 0.74 | **Scenario card de Roleplay** (Figma 65:1830) — tier intermedio (UI.A.7) |
| `strong` | 40 / 32 | white 0.75 | white 0.74 | Card YouTube URL, modales, alto foco |
| `frost` | 36 / 48 | white 0.12 → black 0.08 | white 0.22 → black 0.12 | Header btns, mic, YT pill — translúcido, deja pasar el blob borroso. Único tier con fill mode-aware real |

### "el efecto" — liquid glass 3D (UI.A.11)
`GlassCard` con prop `elevated` aproxima la lectura 3D del Figma (frames 53:343, 53:349). RN no soporta `box-shadow: inset`, así que se compone:
- **Drop shadow exterior** (`glassElevation` en theme) → la card "flota".
- **Highlight de borde superior** (`topHighlight`) → simula el inset blanco del Figma.

### Regla de apilamiento (crítica)
```
✅ Nav bar `ghost` + items del menú `soft`     → contraste apropiado
✅ Fondo blob + card `soft`                     → profundidad
✅ Card `soft` + tooltip `strong`               → jerarquía

❌ Nav bar `soft` + items `soft`                → visual noise, se aplana
❌ Blob + `ghost` + `soft` + `strong` en stack → demasiadas capas
❌ Liquid glass 3D + cards planas               → inconsistencia de estilo
```

### Sobre el menú lateral
El nav bar base usa tier `ghost`. Los 5 botones de acciones usan tier `soft`. Esto garantiza que los botones "floten" sobre la barra sin competir visualmente. El efecto de las transparencias superpuestas sobre el blob animado es el resultado deseado.

---

## 5. Shape Language — Radios

| Token | Valor | Uso |
|---|---|---|
| `radius.xs` | 8px | **SOLO** para elementos muy pequeños (badges inline, chips mini) |
| `radius.sm` | 12px | Chips, tags |
| `radius.md` | 16px | Burbujas de chat, cards pequeñas, modales compactos |
| `radius.lg` | 24px | Cards medianas — radio actual de GlassCard (conservar temporalmente) |
| `radius.card` | 32px | Cards principales, modales grandes |
| `radius.pill` | 60px | Botones pill, nav pills (Figma Rectangle 4,5,6) |
| `radius.blob` | 77px | Background blobs ambientales |
| `radius.circle` | 9999 | Botón mic, avatares, dot indicators |

### Decisión sobre burbujas de chat (frames 26 vs 27)
- **Frame 26**: `borderRadius: 16px` + glass soft + borde lima (rgba(225,243,125,0.1)) — DESCARTADO el borde lima (inconsistente con sistema neutro)
- **Frame 27**: `borderRadius: 8px` + glass plano — DESCARTADO (demasiado sharp para el lenguaje squircle)
- **Decisión final**: `radius.md = 16px` + tier `soft` + sin borde de color. La diferencia AI/usuario se expresa solo con alineación (left vs right).

---

## 6. Blob Ambiental

### Especificaciones
- **Color**: `rgba(233, 235, 214, 0.20)` — sage al 20% (no protagonista)
- **Tamaño**: ~60% del ancho de pantalla (antes era 92% — demasiado grande)
- **Posición base**: fondo inferior-centro, parcialmente fuera del viewport
- **Animación**: scale loop suave 8s, rango `1.0 → 1.04` (antes 1.06 — reducido)
- **Blur de fondo**: el blob SVG se acompaña de un `blur(200px)` para simular el efecto de halo del Figma
- **¿Se mueve por la pantalla?**: pendiente exploración técnica en React Native — el SVG animado actual solo respira (scale). Para movimiento XY real se necesita `react-native-reanimated` con `withRepeat` + `withTiming` en `translateX/Y`. Documentar en TASKS.md como mejora Phase 2.5.

---

## 7. Analíticas — Formato "Historias"

### Concepto (no implementado en MVP)
- Formato: Instagram Stories / Spotify Wrapped
- Navegación: tap derecha avanza, tap izquierda retrocede; swipe también funciona
- Cada "historia" es una pantalla de datos con un dato principal (display token) + contexto (body/fine)
- Final: resumen tipo Duolingo con métricas de la semana

### Inspiración de layout para las historias
- Fondo sólido de color (terracota, sage, negro) por historia — el color IS la historia
- Número display gigante como elemento principal (55%, 14, "7 weeks")
- Texto de contexto en body/fine debajo o al lado
- Posibles formas decorativas grandes (círculos, arcos) como en las referencias de analíticas

### Bento grid (pantalla de resumen final)
- 2 columnas, filas de altura variable (bento)
- Cards con borderRadius.card (32px)
- Fondo de card varía (sage, terracota, blanco, negro) — no todas glass
- Número grande en bottom de card, título pequeño en top

---

## 8. Consistencia — Reglas de evaluación

### Checklist de consistencia por pantalla
- [ ] ¿Todos los elementos text usan exactamente uno de los 6 tokens tipográficos?
- [ ] ¿Los radios corresponden a los tokens definidos (no valores ad-hoc)?
- [ ] ¿Hay máximo 2 tiers de glass distintos en la pantalla?
- [ ] ¿El mismo nivel de elemento (nav item, card, bubble) usa el mismo tier en toda la app?
- [ ] ¿El blob usa `rgba(233,235,214,0.30)` en dark y `rgba(233,235,214,0.80)` en light?
- [ ] ¿No hay bordes de color (lima, verde, etc.) en elementos glass?

### Anti-patterns detectados (a corregir)
| Anti-pattern | Dónde | Corrección |
|---|---|---|
| `borderRadius: 8px` en burbujas de chat | Frame 27 | → cambiar a `radius.md = 16px` |
| Borde lima `rgba(225,243,125,0.1)` en cards | Frame 26 | → eliminar, usar `borderSubtle` |
| Mismo tier de glass apilado (nav + items) | Frame 20/18 | → nav=ghost, items=soft |
| `dark.blob` al 7% opacity | `theme/index.ts` | → actualizar a 20% |
| `dark.background` verde bosque `#1A1F18` | `theme/index.ts` | → actualizar a `#0C0D0B` |
| `dark.surface` con sesgo verde `rgba(42,48,38,0.6)` | `theme/index.ts` | → actualizar a `rgba(255,255,255,0.47)` |
| Bricolage Grotesque ausente | `App.tsx`, `theme/index.ts` | → instalar e integrar |
| `letterSpacing: 1.5` en `display` | `theme/index.ts` | → corregir a `-2.4` |
| `display` sin `fontSize` | `theme/index.ts` | → agregar `fontSize: 48` |

---

## 9. Historial de decisiones

| Fecha | Decisión | Motivo |
|---|---|---|
| 2026-05-24 | Background dark = `#0C0D0B` | El `#1A1F18` tenía sesgo verde-bosque incompatible con glass neutro |
| 2026-05-24 | Blob opacity = 20% (no 40%) | 40% era protagonista; blob debe ser ambiental |
| 2026-05-24 | Blob dark → 30% (was 20%) | 20% era invisible en pantalla física; 30% mantiene ambientalidad y es perceptible |
| 2026-05-24 | HomeScreen: mic → squircle 159×159 r60 | Spec Figma nodo 53-325; ratio icono 1:8 (≈18-20px); ghost glass neutral |
| 2026-05-24 | HomeScreen: header → 3 squircles (settings + streak + moon) | Elimina emoji de racha; theme toggle pasa de long-press a botón explícito |
| 2026-05-24 | HomeScreen: edge nav → semicírculos sangrados | Reemplaza círculos centrados; sugiere gestura de swipe sin competir con mic |
| 2026-05-24 | HomeScreen: YouTube → TextInput + botón Extraer condicional | Linking.openURL eliminado; input espera URL pegada; botón aparece cuando hay contenido |
| 2026-05-24 | Sonar ring color → estado-dependiente (no accent) | Olive/accent en sonar era incorrecto visualmente; neutral en idle, danger/success según estado |
| 2026-05-24 | Bricolage Grotesque instalar | Ausente del proyecto, es la tipografía de body continuo |
| 2026-05-24 | Chat bubbles → `radius.md = 16px` | Frame 27 (8px) demasiado sharp; Frame 26 (16px) es el correcto del lenguaje squircle |
| 2026-05-24 | Borde lima en cards → eliminar | `rgba(225,243,125,0.1)` es inconsistente con sistema de colores neutro |
| 2026-05-24 | `surfaceStrong` → 75% (no 90%) | 90% se veía sólido, rompía el efecto glass |
| 2026-05-24 | Glass tiers máx 2 por pantalla | Más de 2 tiers en la misma vista satura visualmente |
| 2026-05-24 | Analytics = stories format | Inspiración Spotify Wrapped + Duolingo; implementación en fase futura |
