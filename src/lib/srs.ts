/**
 * srs.ts — Algoritmo SM-2 (Anki simplificado) · Fase 9.1
 *
 * Lógica pura y determinística para programar la próxima repetición de un
 * `tracked_item`. Sin dependencias de React ni de Supabase — testeable de
 * forma aislada.
 *
 * El estado se persiste en `tracked_items.srs_state` (jsonb). Forma canónica
 * (igual al DEFAULT de la migración 002):
 *   { "interval": 1, "ease": 2.5, "repetitions": 0, "next_review": null }
 *
 * Referencia: SM-2 de SuperMemo. La UI expone 4 botones (Again/Hard/Good/Easy)
 * que mapeamos a las "qualities" de SM-2.
 */

// ── Tipos ───────────────────────────────────────────────────────────────────
export interface SrsState {
  /** Días hasta la próxima revisión tras el último repaso. */
  interval: number;
  /** Factor de facilidad (ease factor). Nunca baja de 1.3. */
  ease: number;
  /** Repasos consecutivos correctos (se resetea con "Again"). */
  repetitions: number;
  /** Fecha de la próxima revisión en formato `YYYY-MM-DD`, o null si nunca se repasó. */
  next_review: string | null;
}

/** Las 4 calificaciones que ofrece la card SRS (9.4). */
export type SrsGrade = 'again' | 'hard' | 'good' | 'easy';

// ── Constantes ──────────────────────────────────────────────────────────────
export const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;

export const DEFAULT_SRS_STATE: SrsState = {
  interval:    1,
  ease:        DEFAULT_EASE,
  repetitions: 0,
  next_review: null,
};

/**
 * Mapeo de los botones de la UI a la escala de "quality" de SM-2 (0–5).
 * - again (2): fallo → relearn, resetea repeticiones.
 * - hard  (3): recordado con dificultad → avanza poco, baja ease.
 * - good  (4): recordado bien → progresión normal.
 * - easy  (5): trivial → progresión + bonus, sube ease.
 */
const GRADE_QUALITY: Record<SrsGrade, number> = {
  again: 2,
  hard:  3,
  good:  4,
  easy:  5,
};

/** Multiplicador extra al primer intervalo "real" para Easy (bonus de Anki). */
const EASY_BONUS = 1.3;
/** Multiplicador acotado para Hard (en vez de usar el ease completo). */
const HARD_MULTIPLIER = 1.2;

// ── Helpers ───────────────────────────────────────────────────────────────────
const clampEase = (ease: number): number => Math.max(MIN_EASE, ease);

/** Suma `days` días a `from` y devuelve la fecha en `YYYY-MM-DD` (UTC). */
export function addDays(from: Date, days: number): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

/**
 * Ajuste de ease de SM-2 según la quality `q`:
 *   ease' = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
 * Para q=5 sube +0.1, q=4 queda igual, q=3 baja −0.14, q=2 baja −0.32.
 */
function updateEase(ease: number, q: number): number {
  return clampEase(ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
}

// ── Núcleo: nextReview ─────────────────────────────────────────────────────────
/**
 * Calcula el nuevo `SrsState` tras calificar una card.
 *
 * @param state Estado SRS actual (se tolera parcial/legacy → se rellena con defaults).
 * @param grade Calificación elegida por el usuario.
 * @param now   Fecha base para `next_review` (inyectable para tests; default: hoy).
 * @returns     Nuevo estado SRS inmutable (no muta el input).
 */
export function nextReview(
  state: Partial<SrsState> | null | undefined,
  grade: SrsGrade,
  now: Date = new Date(),
): SrsState {
  // Normalizar entrada (tolerante a srs_state incompletos o nulos)
  const prev: SrsState = {
    interval:    state?.interval    ?? DEFAULT_SRS_STATE.interval,
    ease:        clampEase(state?.ease ?? DEFAULT_SRS_STATE.ease),
    repetitions: state?.repetitions ?? DEFAULT_SRS_STATE.repetitions,
    next_review: state?.next_review ?? null,
  };

  const q = GRADE_QUALITY[grade];

  let interval: number;
  let repetitions: number;

  if (q < 3) {
    // "Again" → fallo. Reinicia el ciclo de aprendizaje.
    repetitions = 0;
    interval    = 1;
  } else {
    // Recordado. Progresión estándar de SM-2.
    if (prev.repetitions === 0) {
      interval = 1;
    } else if (prev.repetitions === 1) {
      interval = 6;
    } else {
      const factor = grade === 'hard' ? HARD_MULTIPLIER : prev.ease;
      interval = Math.round(prev.interval * factor);
    }

    if (grade === 'easy') {
      interval = Math.round(interval * EASY_BONUS);
    }

    repetitions = prev.repetitions + 1;
  }

  // El intervalo nunca es menor a 1 día.
  interval = Math.max(1, interval);

  const ease = updateEase(prev.ease, q);

  return {
    interval,
    ease,
    repetitions,
    next_review: addDays(now, interval),
  };
}

// ── Utilidades de consulta ──────────────────────────────────────────────────────
/**
 * ¿La card está vencida (due) para revisar a fecha `now`?
 * Una card sin `next_review` (recién creada) se considera due.
 */
export function isDue(state: Partial<SrsState> | null | undefined, now: Date = new Date()): boolean {
  const nextRev = state?.next_review;
  if (!nextRev) return true;
  return nextRev <= now.toISOString().slice(0, 10);
}
