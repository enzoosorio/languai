/**
 * useFocusStore — Máquina de estados del "modo enfoque" (Fase 9.C)
 *
 * Estado global y reciclable por cualquier pantalla que necesite enfoque forzado
 * (SRS en sesión, conversación/roleplay activos). Cuando hay un `owner`:
 *   - se bloquea el swipe horizontal entre vistas (HorizontalNav)
 *   - se muestra el vignette de bordes (EdgeFocusOverlay)
 *
 * `acquire(owner)` toma el foco; `release(owner)` solo lo suelta si el owner
 * coincide (evita que una pantalla libere el foco de otra). `swipeLocked` deriva
 * de `owner !== null`.
 */
import { create } from 'zustand';

interface FocusState {
  owner: string | null;
  acquire: (owner: string) => void;
  release: (owner: string) => void;
}

export const useFocusStore = create<FocusState>((set, get) => ({
  owner: null,
  acquire: (owner) => set({ owner }),
  release: (owner) => {
    if (get().owner === owner) set({ owner: null });
  },
}));

/** Selector helper: ¿hay enfoque activo (swipe bloqueado)? */
export const selectSwipeLocked = (s: FocusState) => s.owner !== null;
