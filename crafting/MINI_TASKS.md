# MINI_TASKS — Plan ejecutable de LanguAI

Plan contable y atómico. Complementa a [`crafting/TASKS.md`](crafting/TASKS.md), que es el roadmap largo por fases: esta tabla es **lo que está sobre la mesa ahora**, con identificador estable, estimación y bloqueos explícitos.

- El **identificador nunca se reusa**. Una tarea cancelada se marca `❌ cancelada`, no se borra ni se recicla su número.
- **Est.** = tiempo estimado de trabajo efectivo. **Energía** = cuánta carga mental exige: 🔴 alta (diseño o depuración densa) · 🟡 media · 🟢 baja (mecánica).
- **Prioridad**: 1 = bloquea todo lo demás · 2 = camino crítico del MVP · 3 = importante, no bloqueante · 4 = deuda o pulido.
- **Estado**: `⬜ pendiente` · `🔄 en curso` · `✅ hecho` · `⛔ bloqueada` · `❌ cancelada`.
- Referencias: `D…` = decisión, `G…` = gap, `Q…` = pregunta abierta, todas en [`crafting/00-DECISIONS.md`](crafting/00-DECISIONS.md).

---

| # | Mini-task | Por qué | Est. | Energía | Prioridad | Estado | Bloqueado por | Cierre |
|---|---|---|---|---|---|---|---|---|
| 1 | Inicializar Expo + TypeScript, deps base y estructura `src/{screens,components,stores,services,hooks,lib,types,theme}` | Sin fundación no hay nada que construir encima | 3h | 🟢 | 1 | ✅ hecho | | 2026-05-13 |
| 2 | Escribir y aplicar migraciones 001–004 (sessions, feedback, settings, analytics + RLS) | El schema es el contrato del resto del sistema | 4h | 🔴 | 1 | ✅ hecho | 1 | 2026-05-13 |
| 3 | Hardening RLS: `(SELECT auth.uid())` + `TO authenticated` en todas las políticas y `SECURITY DEFINER` para `session_analytics` (migración 005) | El cliente usa la anon key: el RLS es el único escudo entre un usuario y otro (D5) | 2h | 🔴 | 1 | ✅ hecho | 2 | 2026-05-13 |
| 4 | Generar tipos TypeScript del schema en `src/types/database.ts` y tipar el cliente Supabase | Sin tipos, cada query es un error de runtime esperando su turno | 1h | 🟢 | 2 | ✅ hecho | 2 | 2026-05-13 |
| 5 | Tokens de theme (dark/light, glass, tipografía) + `useTheme()` + `<GlassCard />` | Es la base visual de la que dependen todas las pantallas (D32, D33) | 4h | 🟡 | 2 | ✅ hecho | 1 | 2026-05-24 |
| 6 | Reemplazar `react-native-pager-view` por `HorizontalNav` con membrana SVG elástica y umbral invisible | El swipe es la identidad de la app, no un pager genérico (D27, D28) | 8h | 🔴 | 2 | ✅ hecho | 5 | 2026-05-24 |
| 7 | Login por Magic Link + gate de onboarding en `App.tsx` según `onboarding_completed` | Sin sesión de usuario no hay `user_id` y ninguna tabla es escribible | 3h | 🟡 | 2 | ✅ hecho | 3 | 2026-05-24 |
| 8 | Onboarding de 3 pasos (idioma nativo, idioma objetivo, nivel CEFR) escribiendo a `user_settings` | El nivel declarado alimenta el prompt, el SRS y el floor del catálogo (D21) | 4h | 🟡 | 2 | ✅ hecho | 7 | 2026-05-24 |
| 9 | Voice loop mínimo end-to-end: `useVoiceRecording` (descarte <2s) → Groq STT → `chat-turn` → OpenAI TTS | Es el producto: sin este loop no hay nada que evaluar (D11, D12, D29) | 8h | 🔴 | 2 | ✅ hecho | 5, 7 | 2026-05-22 |
| 10 | Mover las llamadas a Groq STT y OpenAI TTS del cliente a Edge Functions y sacar `EXPO_PUBLIC_GROQ_API_KEY` / `EXPO_PUBLIC_OPENAI_API_KEY` del bundle | Hoy las claves viajan dentro del APK y son extraíbles: bloquea cualquier build distribuible (G4) | 4h | 🔴 | 1 | ⬜ pendiente | | |
| 11 | Reescribir `.env.example` con los nombres reales que lee el código y todas las claves necesarias | Un clon limpio hoy no arranca y falla con un warning críptico (G5) | 20m | 🟢 | 1 | ⬜ pendiente | 10 | |
| 12 | Crear `supabase/migrations/006_guided_and_catalog.sql` con el DDL que hoy vive suelto en `ARCHITECTURE.md` | La migración existe como texto pero no es aplicable ni versionable (G1) | 1h | 🟡 | 1 | ⬜ pendiente | | |
| 13 | Renumerar la migración del RAG (`ALTER TABLE user_facts`) a 007 y corregir la referencia en `TASKS.md` 10.1 | Dos migraciones distintas se llaman 006: la primera que se aplique rompe a la otra (G2) | 20m | 🟢 | 1 | ⬜ pendiente | 12 | |
| 14 | Añadir `session_turns.pronunciation_score float` a la migración 007 | El pipeline de `ARCHITECTURE.md` §3.4 ya escribe en una columna que no existe (G3) | 20m | 🟢 | 2 | ⬜ pendiente | 13 | |
| 15 | Corregir `UNIQUE (user_id, lemma)` de `tracked_items` a `(user_id, lemma, language)` | Un lemma compartido entre EN y DE colisiona hoy en la misma fila (G17) | 30m | 🟡 | 2 | ⬜ pendiente | 13 | |
| 16 | Pasar historial de conversación (ventana de N turnos) al LLM en `chat-turn` y definir N en el spec | Hoy la IA no recuerda nada dentro de la propia sesión: responde a cada turno aislado (G6, Q19) | 2h | 🟡 | 2 | ⬜ pendiente | | |
| 17 | Implementar `buildSystemPrompt()`: bloque `[MEMORY]` desde `user_facts` + nudge implícito de `tracked_items` con weight alto | Es lo que convierte el chat genérico en el producto: memoria y exposición dirigida (D36, D37) | 4h | 🔴 | 2 | ⬜ pendiente | 16 | |
| 18 | Añadir el tool `end_conversation` al request de `chat-turn` y la lógica de confidence (≥0.85 cierra, 0.50–0.84 pending_close) | Cerrar la sesión a mano en cada despedida rompe la inmersión (D30) | 3h | 🟡 | 2 | ⬜ pendiente | 16 | |
| 19 | Focus mode de 3 niveles en `HomeScreen` + botón "End conversation" + Back con confirmación | Sin focus mode, un swipe accidental tira la conversación en curso (D31) | 5h | 🟡 | 2 | ⬜ pendiente | 6, 18 | |
| 20 | Escribir `sessions.mode` desde `useSessionStore` y separar por escrito la semántica de `type` vs `mode` | El modo `guided` no tiene productor y las dos columnas se solapan sin regla (G7, G18) | 1h | 🟡 | 2 | ⬜ pendiente | 12 | |
| 21 | Edge Function `analyze-turn` fire-and-forget tras cada turno del usuario, escribiendo annotations parciales | Es lo que baja el cierre de sesión de 15-20s a 2-3s (D15) | 5h | 🔴 | 2 | ⬜ pendiente | 16 | |
| 22 | Edge Function `generate-feedback` con validación JSON de 2 reintentos y `feedback_status='failed'` en el peor caso | El feedback es el pilar del producto; sin él la sesión no deja aprendizaje (D14, D16) | 8h | 🔴 | 2 | ⬜ pendiente | 21 | |
| 23 | `FeedbackScreen` + `<AnnotatedText />` con spans 🔴🟡🔵 y tooltip con explicación, sugerencia y botón "No era error" | Sin la UI, el JSON de feedback no le sirve a nadie (D17) | 8h | 🔴 | 2 | ⬜ pendiente | 22 | |
| 24 | Suscripción Realtime a `sessions.feedback_status` + `<SessionClosingScreen />` con timeout de 8s | Sin notificación, el usuario se queda mirando un loader sin saber si terminó | 3h | 🟡 | 3 | ⬜ pendiente | 22 | |
| 25 | Decidir NativeWind vs `StyleSheet` y unificar todo el código bajo la opción elegida | Hoy conviven la config de Tailwind y su opuesto en las 8 pantallas; la regla de `CLAUDE.md` no se cumple (G9, Q18) | 30m decisión + 4h migración | 🟡 | 3 | ⬜ pendiente | | |
| 26 | Abrir una fase de Guided Practice en `TASKS.md` con sus minitareas (`guided-chips`, corpus seed, chips UI, matching fuzzy) | Tiene spec cerrado y schema escrito, pero cero presencia en el roadmap (G10) | 1h | 🟡 | 3 | ⬜ pendiente | 12 | |
| 27 | Abrir una fase de Vocabulary Catalog en `TASKS.md` (promoción desde graduación, sugerencia post-sesión, adición manual) | Mismo caso que 26: D19 y D20 no tienen ejecución planificada (G10) | 1h | 🟡 | 3 | ⬜ pendiente | 12 | |
| 28 | Seed inicial del corpus B2 (~150 expresiones de Oxford + Cambridge) como migración SQL curada | Es el insumo sin el cual Guided Practice no puede emitir chips (D25) | 4h | 🟢 | 3 | ⬜ pendiente | 26 | |
| 29 | Reconciliar los checkboxes de `TASKS.md` con el estado real del código (Fase 3 figura sin marcar y está hecha) | Un roadmap que miente sobre el presente no sirve para decidir el siguiente paso (G11) | 30m | 🟢 | 3 | ⬜ pendiente | | |
| 30 | SM-2 en `src/lib/srs.ts` + `SRSScreen` con cards Reveal / Again·Hard·Good·Easy | Es el consumidor de `tracked_items`: sin SRS el feedback no se convierte en práctica (D18) | 6h | 🔴 | 3 | ⬜ pendiente | 23 | |
| 31 | Lógica de graduación: `weight<=0` + `interval>=14d` → sugerencia de promoción a `vocabulary_catalog` | Cierra el ciclo error → práctica → dominio → catálogo (D18, D19) | 3h | 🟡 | 3 | ⬜ pendiente | 30, 27 | |
| 32 | Refresh automático de `session_analytics` al cerrar cada sesión (trigger o función Postgres) | Hoy las métricas quedan congeladas al momento de crear la vista (G8) | 1h | 🟡 | 4 | ⬜ pendiente | | |
| 33 | Logging de errores en app y Edge Functions (Sentry o equivalente free) | Sin rastro, cada fallo de IA o de red se depura a ciegas (G14) | 3h | 🟡 | 4 | ⬜ pendiente | | |
| 34 | Reescribir `README.md` en UTF-8 con setup real, variables de entorno y decisiones clave | Hoy son dos líneas guardadas en UTF-16, ilegibles en GitHub (G13) | 1h | 🟢 | 4 | ⬜ pendiente | 11 | |
| 35 | Elegir licencia y añadir `LICENSE` + `CONTRIBUTING.md` mínimo | El repo se declara open-source sin serlo legalmente (G13, Q22) | 30m | 🟢 | 4 | ⬜ pendiente | 34 | |
| 36 | Eliminar `react-native-pager-view` de `package.json` | Dependencia muerta desde D27; nadie la importa (G12) | 5m | 🟢 | 4 | ⬜ pendiente | | |
| 37 | Instrumentar costo real por sesión (tokens, segundos de audio, chars de TTS) y contrastar contra `COSTS.md` | Todo `COSTS.md` es estimación sin un solo dato observado (G16) | 3h | 🟡 | 4 | ⬜ pendiente | 33 | |
| 38 | Benchmark de DeepSeek V4 Flash vs gpt-4o-mini en alemán B2, 20 turnos reales | Es la validación pendiente que cierra Q1 y confirma o tumba D7 para `lang='de'` | 4h | 🟡 | 4 | ⬜ pendiente | 22 | |

---

## Resumen

| Estado | Cantidad |
|---|---|
| ✅ hecho | 9 |
| ⬜ pendiente | 29 |
| **Total** | **38** |

**Camino crítico inmediato:** 10 → 11 → 12 → 13 → 16 → 17 → 21 → 22 → 23. Las cuatro primeras son deuda que bloquea cualquier build o migración; de la 16 en adelante es el MVP conversacional real.
