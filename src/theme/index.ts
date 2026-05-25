/**
 * LanguAI — Design System Tokens
 * Fuente de verdad: crafting/DESIGN_SYSTEM.md
 * Última actualización: 2026-05-24
 */

// ─── COLORS ──────────────────────────────────────────────────────────────────

export const colors = {
  dark: {
    // Base
    background:    '#0C0D0B',                    // negro neutro cálido — NO verde bosque
    // Glass surfaces (siempre derivadas de blanco puro)
    surfaceGhost:  'rgba(255, 255, 255, 0.02)',  // nav pills, swipe panels
    surfaceSoft:   'rgba(255, 255, 255, 0.47)',  // cards, chat bubbles
    surfaceStrong: 'rgba(255, 255, 255, 0.75)',  // YouTube card, modales clave
    // Compatibilidad legado (mapean a surfaceSoft)
    surface:       'rgba(255, 255, 255, 0.47)',
    surfaceSolid:  '#1A1A18',
    // Text
    text:          '#F0EDE6',                    // crema cálido
    textMuted:     'rgba(240, 237, 230, 0.50)',  // 50% opacity
    // Borders
    border:        'rgba(255, 255, 255, 0.28)',  // glass edge glow
    borderSubtle:  'rgba(255, 255, 255, 0.08)',
    // Blob ambiental — sage al 30% dark (20% era invisible), NO protagonista
    blob:          'rgba(233, 235, 214, 0.30)',
    // Accents
    accent:        '#747E12',                    // olive
    accentLight:   '#9AAB28',
    danger:        'rgba(125, 46, 17, 0.90)',    // terracota
    success:       '#4A7A55',
    // Feedback color coding (spec no-negociable)
    feedbackError:   'rgba(180, 60, 50,  0.90)',  // rojo
    feedbackWarning: '#C9A227',                   // ámbar
    feedbackInfo:    'rgba(74, 122, 211, 0.90)',  // azul
  },
  light: {
    // Base
    background:    '#FAFAF7',                    // blanco cálido — conecta con sage
    // Glass surfaces
    surfaceGhost:  'rgba(255, 255, 255, 0.02)',
    surfaceSoft:   'rgba(255, 255, 255, 0.47)',
    surfaceStrong: 'rgba(255, 255, 255, 0.75)',
    // Compatibilidad legado
    surface:       'rgba(255, 255, 255, 0.75)',
    surfaceSolid:  '#FAFAF7',
    // Text
    text:          '#1A1A18',
    textMuted:     'rgba(26, 26, 24, 0.50)',
    // Borders
    border:        'rgba(255, 255, 255, 0.74)',  // glass bright edge
    borderSubtle:  'rgba(0, 0, 0, 0.07)',
    // Blob — más opaco en light para que "aparezca"
    blob:          'rgba(233, 235, 214, 0.80)',
    // Accents
    accent:        '#5C7048',
    accentLight:   '#7A9060',
    danger:        'rgba(125, 46, 17, 0.80)',
    success:       '#3A6644',
    // Feedback
    feedbackError:   'rgba(180, 60, 50,  0.85)',
    feedbackWarning: '#A07A10',
    feedbackInfo:    'rgba(50, 90, 180,  0.85)',
  },
} as const;

// ─── GLASS TIERS ─────────────────────────────────────────────────────────────
// Máximo 2 tiers distintos por pantalla. Nunca el mismo tier apilado.
// Ver: crafting/DESIGN_SYSTEM.md § 4

export const glass = {
  ghost: {
    blur:   12,
    fill:   'rgba(255, 255, 255, 0.02)',
    border: 'rgba(255, 255, 255, 0.14)',
  },
  soft: {
    blur:   16,
    fill:   'rgba(255, 255, 255, 0.47)',
    border: 'rgba(255, 255, 255, 0.56)',
  },
  strong: {
    blur:   27,
    fill:   'rgba(255, 255, 255, 0.75)',
    border: 'rgba(255, 255, 255, 0.74)',
  },
} as const;

// ─── TYPOGRAPHY ───────────────────────────────────────────────────────────────
// 6 tokens canónicos. No usar valores ad-hoc.
// letterSpacing en dp: LS_dp = (LS_percent / 100) × fontSize
// Ver: crafting/DESIGN_SYSTEM.md § 3

export const typography = {
  /**
   * display — Plus Jakarta Sans Regular 48 / -5% LS
   * Uso: héros numéricos, datos grandes (analytics, streak count)
   */
  display: {
    fontFamily:    'PlusJakartaSans_400Regular',
    fontSize:      48,
    letterSpacing: -2.4,   // -5% × 48
    lineHeight:    52,
  },
  /**
   * logo — Plus Jakarta Sans ExtraLight 36 / -2.5% LS
   * Uso: "LanguAI" sobre glass, títulos de pantalla
   */
  logo: {
    fontFamily:    'PlusJakartaSans_200ExtraLight',
    fontSize:      36,
    letterSpacing: -0.9,   // -2.5% × 36
    lineHeight:    40,
  },
  /**
   * nav — Darker Grotesque Regular 24 / 0% LS
   * Uso: menú lateral, ítems de navegación
   */
  nav: {
    fontFamily:    'DarkerGrotesque_400Regular',
    fontSize:      24,
    letterSpacing: 0,
    lineHeight:    28,
  },
  /**
   * body — Bricolage Grotesque Regular 20 / 0% LS
   * Uso: texto corriente, hints, conversación
   */
  body: {
    fontFamily:    'BricolageGrotesque_400Regular',
    fontSize:      20,
    letterSpacing: 0,
    lineHeight:    28,
  },
  /**
   * caption — Darker Grotesque Regular 16 / +2% LS
   * Uso: fechas, sub-subtítulos, acotaciones
   * SIEMPRE renderizar con opacity: 0.75
   */
  caption: {
    fontFamily:    'DarkerGrotesque_400Regular',
    fontSize:      16,
    letterSpacing: 0.32,   // +2% × 16
    lineHeight:    20,
    opacity:       0.75,   // aplicar en el componente
  },
  /**
   * fine — Bricolage Grotesque Light 16 / 0% LS
   * Uso: feedback post-sesión, texto continuo largo
   */
  fine: {
    fontFamily:    'BricolageGrotesque_300Light',
    fontSize:      16,
    letterSpacing: 0,
    lineHeight:    24,
  },

  // ── Aliases legado (evitar en código nuevo) ──────────────────────────────
  h1: {
    fontFamily:    'PlusJakartaSans_200ExtraLight',
    fontSize:      36,
    letterSpacing: -0.9,
    lineHeight:    40,
  },
  h2: {
    fontFamily:    'DarkerGrotesque_400Regular',
    fontSize:      24,
    letterSpacing: 0,
    lineHeight:    28,
  },
  h3: {
    fontFamily:    'DarkerGrotesque_400Regular',
    fontSize:      20,
    letterSpacing: 0,
    lineHeight:    26,
  },
  bodyMedium: {
    fontFamily:    'BricolageGrotesque_400Regular',
    fontSize:      20,
    letterSpacing: 0,
    lineHeight:    28,
  },
  label: {
    fontFamily:    'DarkerGrotesque_400Regular',
    fontSize:      13,
    letterSpacing: 0.26,
  },
} as const;

// ─── SHAPE / RADIUS ───────────────────────────────────────────────────────────
// Ver: crafting/DESIGN_SYSTEM.md § 5

export const radius = {
  xs:     8,    // solo para elementos muy pequeños (badges inline, chips mini)
  sm:     12,   // chips, tags
  md:     16,   // burbujas de chat, cards pequeñas, modales compactos
  lg:     24,   // cards medianas (legacy GlassCard)
  card:   32,   // cards principales, modales grandes
  pill:   60,   // botones pill, nav pills
  blob:   77,   // background blobs ambientales
  circle: 9999, // botón mic, avatares
} as const;

// ─── BLOB ─────────────────────────────────────────────────────────────────────

export const blob = {
  sizeFactor:     0.85,  // 85% del ancho de pantalla — más presente, sigue ambiental
  scaleTo:        1.04,  // amplitude del breath loop (era 1.06 — suavizado)
  durationMs:     8000,  // duración de cada fase del loop
  blurRadius:     200,   // px de blur de halo (simulado via filter en SVG)
} as const;

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type ColorMode   = 'dark' | 'light';
export type Colors      = typeof colors.dark;
export type Typography  = typeof typography;
export type GlassTier   = keyof typeof glass;
export type RadiusToken = keyof typeof radius;
