# TASKS — LanguAI Roadmap de Ejecución

Lista cronológica y atómica de minitareas para llevar el proyecto de specs → MVP funcional → producto pulido. Cada tarea es **completable de forma aislada** y **depende solo de las anteriores**. Marcá `[x]` cuando termines una.

**Cómo usar:** Decime "hacé la próxima", "hacé las próximas 2-3", o el número de la tarea que quieras saltar a. No mezclar tareas de fases distintas hasta cerrar la actual salvo justificación.

**Leyenda:**
- 📦 = setup / infra
- 🎨 = UI / UX
- 🧠 = IA / backend logic
- 🗄️ = datos / persistencia
- ✅ = verificación

---

## Fase 0 — Fundación del repo

- [x] **0.1** 📦 `git init` + `.gitignore` (node_modules, .env, .expo, ios/, android/build) + commit inicial con los specs actuales (incluye el nuevo `COSTS.md`).
- [x] **0.2** 📦 Inicializar proyecto Expo con TypeScript (`npx create-expo-app@latest --template`). Verificar `expo start` en simulador o Expo Go.
- [x] **0.3** 📦 Instalar dependencias base: Zustand, NativeWind + Tailwind, expo-av, expo-haptics, expo-blur, react-native-reanimated, react-native-gesture-handler.
- [x] **0.4** 📦 Crear estructura de carpetas: `src/{screens,components,stores,services,hooks,lib,types,theme}`. Añadir `README.md` con instrucciones de arranque.
- [x] **0.5** 📦 Configurar ESLint + Prettier + path aliases (`@/*` → `src/*`) en `tsconfig.json` y `babel.config.js`.

## Fase 1 — Backend skeleton (Supabase)

- [x] **1.1** 📦 Crear proyecto en Supabase. Guardar URL + anon key en `.env.local` (no commitear). Documentar variables en `.env.example`.
- [x] **1.2** 🗄️ Habilitar extensiones `pgvector` y `pgcrypto` en Supabase SQL editor.
- [x] **1.3** 🗄️ Crear migración SQL `001_sessions.sql` con tablas `sessions`, `session_turns` según [ARCHITECTURE.md](ARCHITECTURE.md). Aplicarla.
- [x] **1.4** 🗄️ Crear migración SQL `002_feedback.sql` con `feedback_annotations`, `tracked_items` (incluye `user_rejections int default 0`), `deep_dive_sessions`. Aplicarla.
- [x] **1.5** 🗄️ Crear migración SQL `003_settings.sql` con `user_settings` (incluye `native_language`, `languages_config jsonb`, `onboarding_completed`), `user_streaks`, `user_facts`, `roleplay_topic_batches`. Aplicarla.
- [x] **1.6** 🗄️ Crear vista materializada `session_analytics` (ver [ARCHITECTURE.md](ARCHITECTURE.md)). Aplicarla.
- [x] **1.7** 🗄️ Configurar Row Level Security: solo el `user_id` ve sus filas en todas las tablas.
- [x] **1.8** 📦 Crear cliente Supabase en `src/lib/supabase.ts` con tipos auto-generados (`supabase gen types typescript`).
- [x] **1.9** 🧠 Scaffold de Edge Function `chat-turn` (Deno) que solo hace echo del request, deployada y llamable desde la app. Verificar.


## Fase 1.5 — RLS: verificación y hardening de seguridad

> **Contexto:** El cliente usa la `anon key` (publishable). El único escudo entre un usuario y los datos de otro es el RLS. Esta fase verifica que todas las tablas y objetos estén correctamente protegidos antes de conectar la app al backend real.

### Estado del RLS — post hardening (migraciones 003, 004, 005)

| Objeto | RLS | Patrón aplicado | Estado |
|---|---|---|---|
| `profiles` | ✅ | SELECT + UPDATE con `(SELECT auth.uid())` + `TO authenticated` | ✅ |
| `user_settings` | ✅ | SELECT + UPDATE con `(SELECT auth.uid())` + `TO authenticated` | ✅ |
| `user_streaks` | ✅ | SELECT + UPDATE con `(SELECT auth.uid())` + `TO authenticated` | ✅ |
| `sessions` | ✅ | SELECT + INSERT + UPDATE con `(SELECT auth.uid())` + `TO authenticated` | ✅ |
| `session_turns` | ✅ | SELECT + INSERT via subquery cacheada + `TO authenticated` | ✅ |
| `tracked_items` | ✅ | SELECT + UPDATE con `(SELECT auth.uid())` + `TO authenticated` | ✅ |
| `feedback_annotations` | ✅ | SELECT via JOIN (más eficiente que IN/IN anidado) + `TO authenticated` | ✅ |
| `deep_dive_sessions` | ✅ | SELECT via subquery cacheada + `TO authenticated` | ✅ |
| `user_facts` | ✅ | SELECT con `(SELECT auth.uid())` + `TO authenticated` | ✅ |
| `roleplay_topic_batches` | ✅ | SELECT con `(SELECT auth.uid())` + `TO authenticated` | ✅ |
| `session_analytics` (mat. view) | ✅ | REVOKE directo + función `get_my_session_analytics()` SECURITY DEFINER | ✅ |
| `handle_new_user()` trigger | ✅ | SECURITY DEFINER + `SET search_path = public` | ✅ |

**Correcciones aplicadas directamente en 003/004/005 (migraciones aún no aplicadas):**
- `(SELECT auth.uid())` en *todas* las políticas — evita re-evaluación fila a fila (~95% mejora)
- `TO authenticated` en *todas* las políticas — descarta evaluación para rol anon (~99% mejora)
- `WITH CHECK` explícito en INSERT/UPDATE
- `feedback_annotations`: doble `IN` anidado → `JOIN` (mejor plan de ejecución)
- `handle_new_user()`: añadido `SET search_path = public` (previene search_path hijacking)
- `get_my_session_analytics()`: usa `(SELECT auth.uid())` + `SET search_path = public`

### Minitareas

- [x] **1.5.1** 🗄️ Hardening RLS completo en migraciones 003, 004, 005:
  - `(SELECT auth.uid())` en todas las políticas
  - `TO authenticated` en todas las políticas
  - `SET search_path = public` en funciones SECURITY DEFINER
  - REVOKE + función segura para `session_analytics`

- [x] **1.5.2** 📦 Aplicar las 5 migraciones en Supabase **en orden** (001 → 002 → 003 → 004 → 005) desde el SQL editor o CLI de Supabase.
  > Verificar que `pgvector` y `pgcrypto` estén habilitados antes de ejecutar 001.

- [x] **1.5.3** 📦 Generar tipos TypeScript del schema: `npx supabase gen types typescript --project-id <id> > src/types/database.ts`. Importar en `src/lib/supabase.ts` como parámetro genérico del cliente.

- [x] **1.5.4** ✅ Verificaciones de RLS en Supabase Table Editor:
  - Intentar leer `sessions` sin estar logueado → debe retornar 0 filas (o error 401).
  - Loguearse con usuario A, insertar una sesión, loguearse con usuario B → usuario B no debe ver la sesión de A.
  - Llamar `supabase.rpc('get_my_session_analytics')` → debe retornar solo filas propias.
  - Intentar hacer `SELECT * FROM session_analytics` directamente con la anon key → debe retornar error de permisos.

- [x] **1.5.5** ✅ Verificar el trigger `on_auth_user_created`: registrar un nuevo usuario y confirmar que se crean automáticamente las filas en `profiles`, `user_settings` y `user_streaks`.

## Fase 2 — App shell, theming y navegación por swipe

- [x] **2.1** 🎨 Theme tokens en `src/theme/`: paleta dark + light, glass tokens (blur, opacity), tipografía. Hook `useTheme()`.
- [x] **2.2** 🎨 Componente reusable `<GlassCard />` con `expo-blur` y bordes redondeados. Aplica dark/light correctamente.
- [x] **2.3** 🎨 Implementar navegación principal con `react-native-pager-view` (swipe horizontal): Home (centro), Roleplay (izq), SRS + Shadow (der).
- [x] **2.4** 🎨 Botones fallback equivalentes al swipe en cada extremo de Home (máscara 🎭 a la izq, libro 📚 a la der).
- [x] **2.5** 🎨 Pantalla Home estática: botón circular masivo central, header con selector de idioma (EN B2 / DE A1) + streak 🔥 placeholder, input píldora abajo.
- [x] **2.6** 🎨 Toggle dark/light accesible desde language pill en header.
- [x] **2.7** ✅ Verificar swipes + fallback + theming en device físico.

## Fase 2.5 — Onboarding

- [x] **2.5.1** 🎨 ~~Componente `<OnboardingStep />`~~ → Implementado como pantalla de 3 pasos inline con chips seleccionables.
- [x] **2.5.2** 🎨 Paso 1 — Idioma nativo: 12 idiomas comunes. Guarda en `user_settings.native_language`.
- [x] **2.5.3** 🎨 Paso 2 — Idioma objetivo EN / DE. Guarda selección.
- [x] **2.5.4** 🎨 Paso 2 — Nivel CEFR (A1–C1). Guarda en `user_settings.languages_config`.
- [ ] **2.5.5** 🎨 Paso 4 — Tour de funciones (diferido: baja prioridad para MVP funcional).
- [ ] **2.5.6** 🎨 Paso 5 — GitHub opcional (diferido a Fase 12).
- [x] **2.5.7** 🗄️ Al finalizar: setear `user_settings.onboarding_completed = true`. Navegar a Home.
- [x] **2.5.8** 🧠 En arranque: si `onboarding_completed = false`, redirigir a Onboarding. Implementado via gate en `App.tsx`.
- [ ] **2.5.9** ✅ Onboarding completo de inicio a fin. Verificar que el nivel elegido se refleja en la language pill del Home.

## Fase 3 — Voice pipeline (modo libre MVP loop)

- [x] **3.1** 🧠 Servicio STT en `src/services/stt.ts` usando **Groq Whisper** API. Función `transcribe(audioBlob, lang) → text`.
- [x] **3.2** 🎨 Hook `useVoiceRecording()` con `expo-av`: tap start, tap stop, devuelve audio blob. Indicador visual "Listening...". **Edge case:** si la duración del audio < 2 segundos, descartar silenciosamente y volver a estado "Tap to Speak" sin llamar a Groq.
- [x] **3.3** 🧠 Extender Edge Function `chat-turn`: recibe `{ session_id, user_text, lang, level }`, llama al LLM vía proxy OpenCode con system prompt base, devuelve `{ ai_text }`. Incluye fetch de historial desde DB (últimos 20 turnos). Fix de race condition: `persistTurn(user)` se llama post-respuesta, no pre-request.
- [x] **3.4** 🧠 Servicio TTS en `src/services/tts.ts` (OpenAI TTS para empezar — barato). Función `speak(text, lang) → audio URL`.
- [x] **3.5** 🎨 Animación de ondas sonoras (Reanimated) que reacciona al input/output de audio. Estados: idle / listening / processing / speaking.
- [x] **3.6** 🎨 Haptics: tap suave al iniciar grabación, doble vibración cuando empieza respuesta de IA.
- [x] **3.7** ✅ Loop end-to-end: hablo en Home → veo "Processing..." → escucho respuesta IA. Probar en EN y DE. Probar audio < 2s → debe ignorarse sin error.

## Fase 3.7 — Focus Mode UI + End-of-conversation detection

> Foco: separar visualmente el modo "idle" del modo "en conversación", agregar detección de despedida vía tool call, sentar las bases para el flujo `closing → summary`. Detalle completo en [CONVERSATION_LIFECYCLE.md](CONVERSATION_LIFECYCLE.md).

- [x] **3.7.1** 🎨 Implementar fade progresivo en `HomeScreen`: 3 niveles (Normal / Focus parcial / Focus completo). Animar opacity de edges + swipe disable con `Animated`/`Reanimated`.
- [x] **3.7.2** 🎨 Botón "End conversation" en footer durante focus completo (oculto en idle). Usar `colors.danger` con glass tint.
- [x] **3.7.3** 🎨 Botón Back ← top-left durante focus. Tap → modal de confirmación si `turnIndex >= 2`: "Discard this conversation? Progress won't be saved." [Discard] / [Keep talking].
- [x] **3.7.4** 🧠 Agregar tool `end_conversation` al request del `chat-turn` Edge Function con schema definido en [CONVERSATION_LIFECYCLE.md](CONVERSATION_LIFECYCLE.md) §3.2.
- [x] **3.7.5** 🧠 En la app, leer `tool_calls` de la respuesta del chat-turn. Si `confidence >= 0.85` → set `sessionStore.endRequested = true` → reproducir audio del `ai_text` final → trigger flujo `closing`.
- [x] **3.7.6** 🧠 Si `0.50 <= confidence < 0.85` → setear `sessionStore.pendingClose = true`. Si el próximo turno del usuario es <5 palabras y afirmativo → cerrar. Si no → reset `pendingClose`.
- [x] **3.7.7** 🎨 Componente `<SessionClosingScreen />` (loader full-screen) — texto "Wrapping up your conversation…" + spinner + skeleton del summary. Timeout 8s → mostrar opción "View partial summary".
- [x] **3.7.8** ✅ Conversación libre con focus mode: tap mic → ver fade parcial → recibir respuesta IA → ver focus completo. Decir "see you later" → IA cierra. Decir "And I said goodbye to him" → IA NO cierra. Tapear End → ver loader.

## Fase 3.5 — Pronunciation Score

- [ ] **3.5.1** 🧠 Edge Function `score-pronunciation` (Deno, asíncrona): recibe `{ audio_b64, transcript, lang }`, llama a Azure Speech Pronunciation Assessment API, devuelve `{ score: 0-100, breakdown: {...} }`.
- [ ] **3.5.2** 🗄️ Añadir campo `pronunciation_score float` a `session_turns` para persistir el score por turno.
- [ ] **3.5.3** 🧠 Disparar `score-pronunciation` en paralelo (fire-and-forget) después de cada turno del usuario en `chat-turn`. No bloquea el flujo conversacional.
- [ ] **3.5.4** 🎨 En `FeedbackScreen`, mostrar badge pequeño de score bajo la burbuja del usuario si `pronunciation_score` está disponible. Badge: número + barra de color (verde > 80, amarillo > 60, rojo ≤ 60).
- [ ] **3.5.5** ✅ Hablar un turno → cerrar sesión → ver badge de pronunciación en el feedback. Verificar que no añade latencia perceptible a la conversación.

## Fase 4 — Persistencia de sesiones

- [x] **4.1** 🗄️ Store Zustand `useSessionStore`: crea sesión al primer turno, mantiene `session_id`, idioma, modo (`free` por ahora).
- [x] **4.2** 🗄️ Función `persistTurn(session_id, speaker, text)` que escribe a `session_turns`. Llamarla después de cada STT (user) y cada respuesta LLM (ai).
- [x] **4.3** 🎨 Botón "End session" en Home (visible solo si hay sesión activa). Marca `sessions.ended_at`.
- [x] **4.4** ✅ Hablar 2-3 turnos, cerrar sesión, verificar filas en Supabase (`sessions`, `session_turns`).

## Fase 5 — Feedback core (pipeline + UI básica)

- [ ] **5.0** 🧠 *(diferido a Fase 5 v2)* Edge Function `analyze-turn` per-turn: pre-computa anotaciones durante la sesión para reducir latencia al cierre.
- [ ] **5.0b** 🧠 *(diferido)* LanguageTool: self-host vs cloud free tier. Añade cobertura de edge cases sintácticos. Implementar cuando el loop base funcione.
- [x] **5.1** 🧠 Edge Function `generate-feedback` (LLM-only, sin LanguageTool): recibe `session_id`, lee turnos, llama LLM con prompt estructurado, devuelve JSON de feedback. Matching de turnos por texto (robusto ante omisiones del LLM).
- [x] **5.2** 🧠 Validador JSON con **2 reintentos**: retry 1 instrucción de formato; retry 2 prompt mínimo. Si fallan → `feedback_status = 'failed'`.
- [x] **5.3** 🎨 Estado de error: `Alert.alert` cuando `feedback_status = 'failed'` o falla la invocación. La sesión queda guardada.
- [x] **5.4** 🗄️ Persistir: `feedback_annotations` (referencia a `turn_id`), upsert `tracked_items` (weight +0.2 si existe, cap 1.0), `sessions.summary` + `sessions.tags` + `feedback_status = 'done'`.
- [x] **5.5** 🎨 Pantalla `FeedbackScreen`: header (título + tags + contadores 🔴🟡🔵) + body scrolleable de turnos glass-bubble. Reemplaza HorizontalNav (no es modal).
- [x] **5.6** 🎨 Componente `AnnotatedText` inline en FeedbackScreen: spans con background + underline a color según severidad. Implementado con Text anidados (soporta onPress en RN).
- [x] **5.7** 🎨 Tap en span → tooltip con explanation + suggestion + botón "Not an error". Al rechazar: weight -1, user_rejections +1, se elimina de la UI local.
- [x] **5.8** 🧠 Auto-archivado: si `user_rejections >= 2` AND `weight <= 0` → `archived = true` en `tracked_items`.
- [x] **5.9** 🎨 Trigger real: `handleSessionClosing` en App.tsx captura sessionId → llama `generate-feedback` → si done: `FeedbackScreen` | si failed/corta: `Alert`.
  > ⚠️ **Pendiente de deploy:** ejecutar `supabase functions deploy generate-feedback` antes de probar.
- [ ] **5.10** 🧠 Al generar feedback, detectar si el mismo `lemma` aparece en 3+ sesiones previas del usuario. Si sí, incluir en el output JSON un campo `pattern_insights[]`.
- [ ] **5.11** 🎨 Si `pattern_insights` no vacío, mostrar tarjeta de Pattern Insight en la parte superior del `FeedbackScreen` con botón para abrir deep-dive directo.
- [ ] **5.12** 🧠 En Edge Function `chat-turn`, detectar fuzzy-match de las expresiones del nudge (`tracked_items` con weight alto) en la respuesta IA. Incluir en respuesta `used_nudge_items[]`.
- [ ] **5.13** 🗄️ Persistir `used_nudge_items` por sesión. Al cerrar, mostrar en FeedbackScreen: *"Expresiones practicadas hoy: 'run into' ✓"* con badge en el SRS.
- [ ] **5.14** ✅ Sesión real → recibir feedback con colores → ver tooltip → rechazar span → verificar cambio de weight → ver Pattern Insight si aplica.

### Fase 5.A — Fix de anotaciones + UX del FeedbackScreen (2026-06-21)

> **Bug raíz encontrado:** `feedback_annotations` quedaba SIEMPRE vacía (spans/tooltips/rechazo no funcionaban) aunque `tracked_items` sí se poblaba. Dos causas: (1) el LLM devolvía offsets de caracteres `[start,end]` poco fiables + matching de turno por texto exacto que fallaba; (2) las anotaciones nunca se vinculaban a su `tracked_item_id`.

- [x] **5.A.1** 🧠 Reescribir `generate-feedback` con modelo unificado: el LLM copia el substring del error **verbatim**; el span se calcula en código con `indexOf` (determinístico). Cada anotación con `track:true` hace upsert del `tracked_item` y vincula `tracked_item_id`. → arregla A1, A2, B1–B4, C1–C4, F2.
- [x] **5.A.2** 🎨 **TITULO-FEEDBACK-TRUNCATION**: el título del header se trunca con `…`; tap → píldora expandida en z-index con el título completo; tap fuera → cierra.
- [ ] **5.A.3** ✅ Re-desplegar `generate-feedback` y verificar en **sesión nueva**: spans de 3 colores visibles, tooltip abre/cierra, "Not an error" archiva y baja weight, `feedback_annotations` poblada con `tracked_item_id`.

### Fase 5.B — PARTIAL-SUMMARY-STREAMING (EDA / Realtime)

> **Motivación:** hoy el flujo es síncrono — spinner bloqueante hasta que `generate-feedback` termina, y el botón "View partial summary" es vestigial (solo oculta el spinner; el feedback igual llega al resolver el await). La conversación YA está en DB, así que se puede mostrar al instante y pintar el análisis progresivamente. RN `fetch` no soporta streaming de tokens fiable → usar **Supabase Realtime** como bus de eventos.

- [ ] **5.B.1** 🗄️ Habilitar Realtime (publication `supabase_realtime`) en `feedback_annotations` y `sessions`. Verificar que las políticas RLS permiten al usuario escuchar solo sus filas.
- [ ] **5.B.2** 🧠 Reordenar el flujo en `App.tsx`/`HomeScreen`: al cerrar sesión válida, abrir `FeedbackScreen` **inmediatamente** (con la conversación ya persistida) en estado "analyzing…", e invocar `generate-feedback` en background (fire-and-forget) en vez de `await` bloqueante.
- [ ] **5.B.3** 🎨 `FeedbackScreen` suscribe `postgres_changes`: INSERT en `feedback_annotations` (filtrado por los `turn_id` de la sesión) → pinta cada span al llegar; UPDATE en `sessions` → pinta `summary` + `tags` cuando se materializan. Shimmer sutil mientras `feedback_status != 'done'`.
- [ ] **5.B.4** 🎨 Reemplazar "View partial summary" por el estado real de streaming (la pantalla ya es la "partial"); quitar el botón vestigial del `SessionClosingScreen` (o reducir el rol del spinner a un fade de transición < 1s).
- [ ] **5.B.5** ✅ Cerrar sesión → ver la conversación al instante → ver spans/summary/tags aparecer progresivamente vía Realtime → estado final `done` sin recarga.

## Fase 6 — Deep-dive flotante

- [ ] **6.1** 🎨 Pantalla `DeepDiveScreen` enfocada en un `tracked_item`: explicación completa, ejemplos de uso, botón micrófono (reusa pipeline de Fase 3).
- [ ] **6.2** 🗄️ Store Zustand `useDeepDiveStore`: mantiene a lo sumo **1 deep-dive activo**. Crear sub-sesión en `sessions` con `type=deep_dive` y fila en `deep_dive_sessions`.
- [ ] **6.3** 🎨 Burbuja flotante draggable (Reanimated + Gesture Handler) visible globalmente cuando hay deep-dive minimizado.
- [ ] **6.4** 🎨 Lógica de reemplazo: al abrir otro deep-dive, si el actual tiene > 4 turnos → modal de confirmación; sino reemplaza silenciosamente.
- [ ] **6.5** 🧠 Al cerrar un deep-dive → dispara `generate-feedback` para esa sub-sesión.
- [ ] **6.6** 🎨 Tap en preview de span (en `FeedbackScreen`) → abre `DeepDiveScreen`.
- [ ] **6.7** 🎨 Cross-link UI: en el feedback principal, si una anotación comparte `tracked_item` con un deep-dive cerrado → chip "Visto también en deep-dive [link]".
- [ ] **6.8** ✅ Flujo: error en sesión → tap → preview → tap → deep-dive con voz → minimizar → burbuja → reabrir → cerrar → feedback del deep-dive cross-linkeado.

## Fase 7 — Roleplay mode

- [ ] **7.1** 🧠 Edge Function `generate-roleplay-topics`: recibe `{ lang, level, user_interests[] }`, retorna **batch de 5 frases** de escenarios.
- [ ] **7.2** 🎨 Pantalla `RoleplayTopicScreen` (acceso por swipe izq + botón máscara): frase central grande tappable + botón dado 🎲 + botón Aceptar.
- [ ] **7.3** 🎨 Animación de rolling del dado (Reanimated) + haptic on tap. Cache local de frases; al bajar de 2 → pedir batch nuevo.
- [ ] **7.4** 🎨 Pantalla `RoleplaySessionScreen`: banner colapsable con el `scenario`, indicador no-agresivo de tiempo (anillo tenue) hacia 5 min, resto idéntico a Home.
- [ ] **7.5** 🧠 Extender system prompt del LLM cuando `sessions.type='roleplay'`: incluye `scenario` y la instrucción de cierre narrativo a ~5 min.
- [ ] **7.6** 🗄️ Al aceptar tema → crear `sessions` con `type='roleplay'`, `scenario`, navegar a `RoleplaySessionScreen`.
- [ ] **7.7** ✅ Roleplay de ~5 min → cierre narrativo de la IA → feedback automático con tags relevantes.

## Fase 8 — Histórico de sesiones

- [ ] **8.1** 🎨 Pantalla `HistoryScreen` con lista virtualizada de cards (`FlatList`). Cada card: título, fecha, duración, tags, contadores 🔴🟡🔵.
- [ ] **8.2** 🎨 Acceso a Historial: long-press en streak del Home **o** botón en pantalla de ajustes (descubrible sin saturar la home).
- [ ] **8.3** 🎨 Tap en card → reabre `FeedbackScreen` en modo lectura para esa sesión.
- [ ] **8.4** ✅ Verificar que sesiones libres, roleplays y deep-dives aparecen correctamente y abren su feedback.

## Fase 9 — SRS de Phrasal Verbs / Tracked Items (EN-only)

- [ ] **9.1** 🧠 Implementar algoritmo SM-2 (Anki simplificado) en `src/lib/srs.ts`. Función `nextReview(item, grade) → newSrsState`.
- [ ] **9.2** 🗄️ Al persistir un `tracked_item` (Fase 5.4), inicializar `srs_state` con intervalo 1 día, ease 2.5.
- [ ] **9.3** 🎨 Pantalla `SRSScreen` (swipe derecho desde Home + botón fallback): tab/toggle para SRS Phrasal Verbs y Shadow Reading. Mostrar solo `language='en'` para SRS.
- [ ] **9.4** 🎨 Card SRS: muestra `text` + `explanation`, botón "Reveal", luego 4 botones (Again / Hard / Good / Easy) que llaman `nextReview`. Badge "✓ usado en sesión" si el item fue activado via nudge.
- [ ] **9.5** 🧠 Lógica de graduación (Opción C): al calcular `nextReview`, verificar si `weight <= 0` AND `srs_state.interval >= 14`. Si sí, setear una flag `graduation_suggested = true` en el item. En la siguiente apertura del SRS, mostrar la sugerencia de archivar antes de la card.
- [ ] **9.6** 🎨 Modal de graduación: *"Parece que ya dominas '[expresión]' — ¿archivarlo?"* con botones [Archivar] / [Seguir practicando]. Al archivar: `archived = true`, item pasa a sección "Graduados" consultable.
- [ ] **9.7** 🧠 Modo "drill": Edge Function `generate-srs-drill` que toma N items y genera 3-5 mini-ejercicios de uso (cloze + producción libre).
- [ ] **9.8** 🧠 **Nudge implícito**: helper `buildSystemPrompt(user_id, lang)` que inyecta top N tracked_items con weight alto como instrucción al LLM ("weave these naturally, do not mention"). Usar en Edge Function `chat-turn`.
- [ ] **9.9** ✅ Cometer error → aparece como card SRS → repasar → en sesión siguiente la IA usa la expresión → badge ✓ en SRS → alcanzar criterio de graduación → ver sugerencia de archivado.

## Fase 9.5 — Shadow Reading Mode

- [ ] **9.5.1** 🧠 Edge Function `generate-shadow-exercise`: recibe `{ lang, level, tracked_items[] }`, llama LLM para generar 5 frases de práctica relevantes, luego TTS para audio de cada frase. Devuelve `[{ text, audio_b64 }]`.
- [ ] **9.5.2** 🎨 Pantalla `ShadowReadingScreen` (tab dentro de `SRSScreen`): card con la frase objetivo, botón "Escuchar" (reproduce TTS), botón micrófono para repetir.
- [ ] **9.5.3** 🧠 Al grabar la repetición del usuario: STT transcribe → LLM compara contra la frase original, devuelve `{ word_accuracy: %, wpm: N, naturalness_score: 0-10, feedback_text }`.
- [ ] **9.5.4** 🎨 Resultado visual: barra de progreso de precisión, velocidad en WPM, comentario de naturalidad. Botón "Siguiente frase".
- [ ] **9.5.5** 🗄️ Persistir resultados de shadow reading por sesión (tabla `shadow_sessions` o campo en `sessions`).
- [ ] **9.5.6** ✅ Escuchar frase → repetir → ver score de precisión + WPM + feedback. Probar con frase fácil y frase difícil.

## Fase 9.7 — Guided Practice + Vocabulary Catalog

- [ ] **9.7.1** 🗄️ Aplicar migración 006 en Supabase: tablas `b2_expressions_corpus`, `user_corpus_exposure`, `vocabulary_catalog`, `vocabulary_definitions_cache` + ALTER `sessions.mode` y `session_turns` (chips_offered, chips_used, constraint_status). Verificar RLS de cada objeto.
- [ ] **9.7.2** 🗄️ Data migration 006b: seed de ~150 expresiones en `b2_expressions_corpus` (phrasal verbs + conjunciones + colocaciones de Oxford Learner's / Cambridge English). Script SQL curado, aplicar como migración independiente.
- [ ] **9.7.3** 🧠 Edge Function `guided-chips` (Deno): recibe `{session_id, turn_id, focus: 'srs'|'b2'|'mixed'}`, consulta `tracked_items` del usuario + `b2_expressions_corpus` filtrado por tags, llama DeepSeek V4 Flash, devuelve `{should_emit_chips, chips[{expression,source,hint_short,hint_example}]}`. Guard clause: no emitir en los primeros 2 turnos.
- [ ] **9.7.4** 🧠 Fuzzy match client-side en `src/lib/guidedChips.ts`: Levenshtein normalizado por lemma (threshold ≥ 0.8). Función `detectChipUsage(userText, chips[]) → {matched[], constraint_status}`. Tests unitarios con casos edge ("shown up" → "show up", "fell behind" → "fall behind").
- [ ] **9.7.5** 🎨 Componente `<ModePicker />` en `HomeScreen`: pill selector `[Free] [Roleplay] [🎯 Guided]`. Persiste en `useSessionStore.selectedMode`. Sub-label dinámico del botón principal según modo activo.
- [ ] **9.7.6** 🎨 Bottom-sheet `<GuidedConfigSheet />`: foco `[Mis errores] [Vocabulario B2] [Mixto]` + duración `[5 min] [10 min]`. Aparece una sola vez antes del primer turno de una sesión Guided. Guarda en `useSessionStore.guidedConfig`.
- [ ] **9.7.7** 🎨 Componente `<GuidedChips />`: 4 pills con stagger animation (Reanimated, 80ms entre chips, fade-in + translateY 12→0, out-expo). Badge superior por `source` (🎯/✨/🌱). Tap corto → tooltip `hint_short`. Tap largo → modal con `hint_example` + speaker TTS.
- [ ] **9.7.8** 🧠 Integración chip flow: en cada turno IA dentro de `mode=guided`, llamar `guided-chips` en paralelo. Si `should_emit_chips=true`, renderizar `<GuidedChips />`. Post-STT: correr `detectChipUsage`, actualizar `chips_offered`/`chips_used`/`constraint_status` en `session_turns`.
- [ ] **9.7.9** 🧠 Re-prompt suave: si `constraint_status='skipped'`, añadir al siguiente system prompt la frase de invitación ("Nice — could you try using one of these?"). Re-destacar los chips originales en UI sin nueva llamada a `guided-chips`.
- [ ] **9.7.10** 🧠 Cooldown de chips: en `useSessionStore`, trackear contador de turnos consecutivos `skipped`. Si ≥ 2, activar `chipsCooldown = 2` (decrementar por turno). Durante cooldown no llamar a `guided-chips`.
- [ ] **9.7.11** 🎨 Pantalla `VocabularyHubScreen` (reemplaza el slot de swipe izquierdo): header con contador + tab bar `[📚 Catálogo] [🔁 En práctica]`. Actualizar `PagerView` en navegación principal.
- [ ] **9.7.12** 🎨 Tab [📚 Catálogo]: search bar + filtros por categoría (All / Phrasal / Words / Idioms) + nivel CEFR. `FlatList` virtualizada de cards con expression, nivel, definición corta, badges de origen/estado. Swipe izq en card → `hidden = true`.
- [ ] **9.7.13** 🎨 Drawer de detalle del catálogo: definición, ejemplos, sesiones relacionadas, campo `user_note` editable inline, botón "Open deep-dive". Reutiliza `<GlassCard />` y el pipeline de deep-dive existente.
- [ ] **9.7.14** 🗄️ Sección "New for your catalog" en `FeedbackScreen`: lista de ≤5 candidatos B2+ generados por `generate-feedback` (palabras que la IA usó, no en catálogo del usuario). Checkboxes + botón "Agregar seleccionadas". INSERT en `vocabulary_catalog` con `source='post_session_suggestion'`.
- [ ] **9.7.15** 🎨 Sección "Guided Practice Summary" al tope del `FeedbackScreen` (solo `session.mode='guided'`): chips ofrecidos, usados, % usage rate + lista de expresiones con ✓/⚠.
- [ ] **9.7.16** 🧠 Lógica de graduación `promoted_from_tracked`: cuando `tracked_item.weight ≤ 0` AND `srs_state.interval ≥ 14`, mostrar CTA "→ Agregar al catálogo" en tab [🔁 En práctica]. Al aceptar: INSERT en `vocabulary_catalog` con `source='promoted_from_tracked'`, marcar `archived=true`, llamar LLM para `definition`+`example` si no hay caché en `vocabulary_definitions_cache`.
- [ ] **9.7.17** 🗄️ KPIs del modo Guided: calcular `chip_offer_rate`, `chip_usage_rate`, `new_expressions_practiced` al cerrar sesión en `generate-feedback` y persistir (columna en `sessions` o tabla auxiliar). Exponer en `StatsScreen` (Fase 13.5).
- [ ] **9.7.18** ✅ E2E sesión guiada: seleccionar Guided → config foco → conversar 5+ turnos → ver chips aparecer con stagger → usar al menos 2 → cerrar → ver "Guided Practice Summary" + "New for your catalog" → aceptar 1 entrada → verificar en tab [📚 Catálogo]. Verificar que Roleplay desde modo selector del Home sigue funcionando.

## Fase 10 — RAG / Memoria a largo plazo

> Implementación según el pipeline refinado en [MEMORY_SYSTEM.md](MEMORY_SYSTEM.md) §1.

- [ ] **10.1** 🗄️ Migración 006: `ALTER TABLE user_facts` agregando `superseded_by uuid`, `confidence float`, `needs_clarification bool`, `topic_tags text[]`. Aplicar.
- [ ] **10.2** 🧠 Edge Function `extract-facts` (DeepSeek V4 Flash): dispara cada 3 turnos del usuario durante la sesión + pasada final al cerrar. Extrae 3-8 hechos atómicos.
- [ ] **10.3** 🧠 Sub-función `judge-fact` (DeepSeek V4 Pro): para cada candidate, embed → pgvector retrieval top-5 (distancia <0.45) → si hay candidatos, LLM judge clasifica en 5 categorías (IDEMPOTENT / REFINES / CONTRADICTS / CONTEXT_DEPENDENT / UNRELATED).
- [ ] **10.4** 🗄️ Acciones según verdict: IDEMPOTENT=discard, REFINES=UPDATE, CONTRADICTS=set `superseded_by` + INSERT, CONTEXT_DEPENDENT=INSERT con `needs_clarification=true`, UNRELATED=INSERT directo.
- [ ] **10.5** 🧠 En `buildSystemPrompt` (Fase 9.8), antes de iniciar sesión: embed del primer mensaje del usuario o del scenario, buscar top-5 hechos similares (`WHERE superseded_by IS NULL`), inyectarlos como `[MEMORY]`.
- [ ] **10.6** 🧠 Feature de aclaración: en `chat-turn`, detectar si algún fact con `needs_clarification=true` tiene intersección de tópicos con el último turno del usuario. Si sí, inyectar nota `[PENDING CLARIFICATION]` en el system prompt (ver [MEMORY_SYSTEM.md](MEMORY_SYSTEM.md) §1.5).
- [ ] **10.7** 🧠 Al detectar que el usuario respondió a una clarification: marcar el fact viejo con `superseded_by` apuntando al nuevo, y el nuevo con `needs_clarification=false`.
- [ ] **10.8** ✅ Sesión 1: "Me gusta la ensalada". Sesión 2: "No me gustan las verduras". Verificar que se crea fact `needs_clarification=true`. Sesión 3 hablando de comida → la IA debería preguntar la aclaración. Responder → verificar resolución en DB.

## Fase 11 — YouTube Context (Gemini)

- [ ] **11.1** 🧠 Edge Function `analyze-youtube`: recibe URL, llama a Gemini 1.5 Flash con video multimodal, devuelve resumen + 5 puntos clave + transcripción condensada.
- [ ] **11.2** 🎨 Input píldora del Home: al pegar URL válida y tocar Go → loader → indicador "Context Loaded" + haptic success.
- [ ] **11.3** 🗄️ Sesiones con contexto YouTube: campo opcional `sessions.youtube_context jsonb`. Inyectarlo al system prompt si presente.
- [ ] **11.4** ✅ Pegar URL de YouTube → conversar sobre el video → la IA referencia el contenido correctamente.

## Fase 12 — Export a Obsidian vía GitHub

- [ ] **12.1** 🎨 Pantalla de ajustes: input para Personal Access Token de GitHub + nombre del repo destino. Guardar cifrado (Expo SecureStore). (Si se configuró en onboarding, pre-rellenar estos campos.)
- [ ] **12.2** 🧠 Edge Function `export-obsidian`: al cerrar sesión, formatea el Markdown según template de [MEMORY_SYSTEM.md](MEMORY_SYSTEM.md), incluye correcciones + `[[phrasal:...]]` enlaces + tags como frontmatter.
- [ ] **12.3** 🧠 **Primario:** PUT del Markdown a GitHub vía REST API. **Fallback automático:** Si el PUT falla (conflicto, permisos), crear un Pull Request con el mismo contenido vía `POST /repos/{owner}/{repo}/pulls`.
- [ ] **12.4** ✅ Cerrar una sesión → ver archivo `.md` en el repo de GitHub → sincronizar con Obsidian Git → ver nota en el vault con backlinks funcionando. Simular fallo de PUT para verificar que el PR fallback se crea correctamente.

## Fase 13 — Background audio y polish

- [ ] **13.1** 📦 Configurar `app.json`: `UIBackgroundModes: [audio]` (iOS), `expo.android.foregroundServiceTypes: [mediaPlayback]` (Android).
- [ ] **13.2** 🧠 Servicio en `src/services/backgroundAudio.ts` que mantiene sesión activa con audífonos / pantalla bloqueada. Integración con AVAudioSession y MediaSession.
- [ ] **13.3** 🎨 Voice Activation Detection (VAD) ligero o Push-To-Talk vía botón del audífono (controles remotos).
- [ ] **13.4** 🎨 Pulido visual: animaciones de transición entre pantallas, loading states, empty states.
- [ ] **13.5** 🎨 Streak / racha real (no placeholder): tabla `user_streaks(user_id, current, longest, last_session_date)`.
- [ ] **13.6** 🎨 Light mode parity audit: revisar cada pantalla en light mode y arreglar contrastes.
- [ ] **13.7** ✅ Conversación de 5 min con pantalla bloqueada y audífonos. La sesión continúa, se guarda, dispara feedback.

## Fase 13.5 — Analytics básico y Weekly Report

- [ ] **13.5.1** 🗄️ Refrescar la vista materializada `session_analytics` automáticamente al cerrar cada sesión (función Postgres o trigger).
- [ ] **13.5.2** 🎨 Pantalla `StatsScreen` (accesible desde Ajustes): muestra métricas de la semana actual y semana anterior: minutos hablados, sesiones, errores por severidad, palabras nuevas en tracked_items, palabras reforzadas (weight reducido).
- [ ] **13.5.3** 🧠 Edge Function `weekly-report` (cron, Supabase cron extension o Postgres `pg_cron`): se ejecuta cada domingo a las 23:00 UTC para cada usuario con `github_token` configurado.
- [ ] **13.5.4** 🧠 `weekly-report` llama al LLM con el resumen de la semana (desde `session_analytics` + `tracked_items`), genera Markdown del reporte y lo pushea al repo GitHub del usuario (mismo pipeline Obsidian con fallback PR).
- [ ] **13.5.5** ✅ Simular semana con 3+ sesiones → ejecutar `weekly-report` manualmente → ver archivo en GitHub + datos en `StatsScreen`.

## Fase 14 — Build, distribución y open-source readiness

- [ ] **14.1** 📦 Configurar EAS Build (`eas.json`) para iOS y Android. Cuenta Expo + credenciales.
- [ ] **14.2** 📦 Build interno para TestFlight (iOS) y APK firmada (Android). Probar en device propio.
- [ ] **14.3** 📦 Logging mínimo (Sentry o equivalente gratuito) en Edge Functions y app para diagnosticar fallos de IA / red.
- [ ] **14.4** 📦 `README.md` completo con setup, variables de entorno, decisiones de arquitectura.
- [ ] **14.5** 📦 Licencia (MIT o similar) + `CONTRIBUTING.md` mínimo. Preparar para hacer público el repo.
- [ ] **14.6** ✅ Onboarding cero: clonar el repo en máquina limpia, seguir el README, llegar a app corriendo. Iterar hasta que funcione.

---

## Fase UI.A — Design System Audit (post-iteración Figma 2026-06-21)

> Backlog generado a partir de auditoría senior cruzando código actual (`src/theme/index.ts`, `GlassCard`, `HomeScreen`, `FeedbackScreen`, `HorizontalNav`), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) y 4 frames canónicos de Figma (nodes 7:2, 53:325, 58:783, 63:1546, 65:1774).
>
> **Reglas de orden:** estas tareas NO son una fase secuencial estricta — son hardening transversal. Insertarlas en la fase activa cuando toquen su área (ej. UI.A.G.* al hacer Fase 9.7, UI.A.D.* al revisar contraste antes de Fase 14.2). Marcadas con prefijo `UI.A.` para no romper la numeración existente.

### A · Resync Figma ↔ Spec ↔ Código (decisiones de diseño)

- [x] **UI.A.1** 🎨 ~~Decidir familia tipográfica del **logo "LanguAI"**~~ → **DECISIÓN 2026-06-21**: **Plus Jakarta Sans ExtraLight 200, 36px**. Actualizar Figma (frames 58:817, 65:1788) y confirmar que `DESIGN_SYSTEM.md § 3` + `theme/index.ts` ya usen este valor.
- [x] **UI.A.2** 🎨 ~~Decidir familia del **streak chip**~~ → **DECISIÓN 2026-06-21**: **Bricolage Grotesque reemplaza a Geist** en el streak chip. No instalar `@expo-google-fonts/geist`. Actualizar Figma (frames 53:355, 65:1820) para eliminar Geist y usar Bricolage Grotesque SemiBold con el gradiente olive→gris existente.
- [ ] **UI.A.3** 🎨 Decidir si **Bricolage Grotesque ExtraLight 200** entra al sistema (Figma lo usa en scenario card de Roleplay y placeholder de YouTube). Hoy solo Light 300 y Regular 400 están cargados. Si entra: agregar token nuevo (ej. `bodyExtraLight`) + cargar peso 200 en `App.tsx`.
- [ ] **UI.A.4** 🎨 Actualizar Figma para eliminar el **borde lima `rgba(225,243,125,0.1)`** de las cards de historial (frame 63:1546, vars `fill_12d6ed7e`). DESIGN_SYSTEM § 8 ya lo marca como anti-pattern pero el archivo de Figma no fue resincronizado.
- [ ] **UI.A.5** 🎨 Actualizar Figma del Home (frame 53:325): hay **3 squircles apilados** (53:332/333/334) replicando el mic con `el efecto`. Viola "nunca el mismo tier apilado" del § 4. Quedarse con 1 squircle + sonar ring.
- [ ] **UI.A.6** 🎨 Resync **YouTube pill**: Figma frame 65:1837 usa `borderRadius: 32px` + text Bricolage ExtraLight 200 16px; código usa `borderRadius: 20px` + Darker Grotesque 400 13px. Definir cuál es la verdad y alinear.
- [x] **UI.A.7** 🎨 ~~Agregar tier `medium`~~ → **HECHO 2026-06-21**: tier `medium` añadido a `theme/index.ts → glass.medium` (fill 0.56, border 0.74, blur 30/38), soportado por `GlassCard` (`tier` ahora es `GlassTier`) y documentado en `DESIGN_SYSTEM.md § 4`. Aplicación a la scenario card real queda pendiente para cuando se construya Roleplay (hoy es placeholder).
- [ ] **UI.A.8** 🎨 Generar **mockups dark mode** en Figma para los 4 frames clave (todos están en light `#FFFFFF` o gris `#DADADA`). Sin mockup dark, "Light mode parity audit" (13.6) no es verificable bidireccionalmente.
- [ ] **UI.A.9** 🎨 Revisar frame 58:783 (mockup viejo con fill `#DADADA` + texto `#000` puro + Plus Jakarta Sans 14). Verificar si es Login/Onboarding deprecado y eliminarlo o actualizarlo a paleta vigente.

### B · Glassmorphism (consolidación técnica)

- [x] **UI.A.10** 🎨 ~~Unificar dos implementaciones de glass~~ → **HECHO 2026-06-21**: sistema único en `theme/index.ts` (`glass` per-mode + `resolveGlass(tier, isDark)`). `GlassLayers` inline extraído a componente reusable `src/components/GlassFill.tsx` (capas absolutas sin children); `GlassCard` (contenedor con children) ahora lee del mismo resolver. Cero magic numbers de blur duplicados. Tiers: ghost/soft/medium/strong/**frost** (el look translúcido del header/mic/YT que antes era `GlassLayers`).
- [x] **UI.A.11** 🎨 ~~Implementar "el efecto" liquid glass~~ → **HECHO 2026-06-21**: prop `elevated` en `GlassCard` + preset `glassElevation` en theme. RN no soporta `box-shadow: inset`, así que se aproxima con drop shadow exterior + highlight de borde superior (`topHighlight`). No requirió `react-native-shadow-2`. Pendiente: aplicar `elevated` a las cards/mic que lo ameriten cuando se rediseñe cada pantalla.
- [x] **UI.A.12** 🎨 ~~Hacer surfaces theme-aware~~ → **HECHO 2026-06-21**: en dark, los tokens FLAT `surface`/`surfaceSoft` bajaron de `white 0.47` a `white 0.10` (y `surfaceStrong` a 0.16, `surfaceGhost` a 0.04). Antes los chips/botones de modal (flat, sin blur) quedaban casi blancos con texto crema encima → ilegibles. Light mode sin cambios. Nota: los **fills de los tiers glass** (con BlurView detrás) siguen white-derived por diseño (§ 4).
- [~] **UI.A.13** 🧠 **PARCIAL 2026-06-21**: `experimentalBlurMethod="dimezisBlurView"` añadido en Android tanto a `GlassCard` como a `GlassFill`. **Falta medir FPS real** en dispositivo/emulador Android low-end (no hay device en esta sesión) — dejar abierto hasta validar ≥55fps con 6+ BlurView simultáneos en Home.
- [x] **UI.A.14** 🎨 ~~Fallback de glass en Android~~ → **HECHO 2026-06-21**: `dimezisBlurView` habilita blur real en Android; cuando el blur no rinde, el `fill` del tier sostiene la legibilidad. `surfaceGhost` subido a 0.04 para no desaparecer sin blur. Documentado en `GlassFill.tsx` y `DESIGN_SYSTEM § 4`.

### C · Tipografía (token discipline)

- [ ] **UI.A.15** 🎨 Auditar `HomeScreen.tsx`: hay **hardcoded font sizes** (11, 12, 13, 14, 15, 18) fuera del sistema de 6 tokens (`display 48`, `logo 36`, `nav 24`, `body 20`, `caption 16`, `fine 16`). Migrar a tokens o agregar tokens nuevos justificados en DESIGN_SYSTEM § 3.
- [ ] **UI.A.16** 🎨 Mismo audit para `FeedbackScreen` (fontSize 10, 11, 12, 13, 15) y `SessionClosingScreen` / `OnboardingScreen`. Generar tabla de "tokens vs hardcoded" como output del audit.
- [ ] **UI.A.17** 🎨 Aplicar regla **`caption.opacity = 0.75`** consistentemente: hoy el token lo define pero los componentes no lo aplican (queda en 100%). Centralizar en un componente `<Caption />` o en `<ThemedText variant="caption" />`.

### D · Accesibilidad (CRITICAL — bloqueante para v1.0)

- [ ] **UI.A.18** 🎨 Agregar `accessibilityLabel` + `accessibilityRole="button"` a TODOS los `TouchableOpacity` sin texto visible: mic button (Home), header buttons (settings, streak, theme toggle, back), modal close, chips de lang/level, rejection button, "Extraer" YT, back en FeedbackScreen.
- [ ] **UI.A.19** 🎨 Auditar contraste WCAG 4.5:1 en todos los pares:
  - `text #F0EDE6` sobre `background #0C0D0B` (esperado: ✅)
  - `text` sobre `surfaceSoft` (sospecha: ❌)
  - `textMuted` sobre `background` (sospecha: ✅ pero borderline)
  - `caption opacity 0.75 × textMuted 0.5 = 0.375 efectivo` (sospecha: ❌)
  - `danger` y `accent` sobre `background`
  Generar reporte con APCA o WCAG-AA y ajustar tokens.
- [ ] **UI.A.20** 🎨 Implementar soporte de **`AccessibilityInfo.isReduceMotionEnabled()`**: sonar ring (HomeScreen), breath loop (mic scale), mount fades, ElasticSVG membranes, FadeInUp/FadeOutDown del End button → todos deben pausarse o reducirse cuando el sistema lo pide.
- [ ] **UI.A.21** 🎨 Reemplazar emojis severidad `🔴🟡🔵` por **íconos SVG semánticos** + label de texto en `FeedbackScreen` counters y badges. Mantener color como refuerzo, no como único indicador (regla `color-not-only`).
- [ ] **UI.A.22** 🎨 Implementar **focus trap + escape route** en modales (Discard, Lang picker, Annotation tooltip): cerrar con Esc en web, con back-button hardware en Android, con swipe-down en iOS. Hoy solo cierran tapeando overlay.
- [ ] **UI.A.23** 🎨 Soportar **Dynamic Type / Text Scale**: el sistema tipográfico tiene `fontSize` fijos. Cuando el usuario aumenta tamaño de fuente del SO, hay riesgo de truncado en headers y chips. Probar con escala iOS 200% y Android 1.3x; agregar `allowFontScaling` policy explícita por token.

### E · Web compatibility (decisión estratégica)

- [x] **UI.A.24** 📦 ~~Decidir alcance web~~ → **DECISIÓN 2026-06-21**: **Solo app móvil nativa**. No se soporta `react-native-web` ni PWA. Bloque UI.A.25–UI.A.32 queda archivado. Documentar en `CLAUDE.md` como decisión no negociable para evitar regresiones futuras.
- [~] **UI.A.25** ~~📦 (web) Configurar `react-native-web`~~ → **ARCHIVADA** (decisión UI.A.24: solo mobile).
- [~] **UI.A.26** ~~🎨 (web) Breakpoints responsive~~ → **ARCHIVADA**.
- [~] **UI.A.27** ~~🎨 (web) Hover states~~ → **ARCHIVADA**.
- [~] **UI.A.28** ~~🎨 (web) Keyboard navigation~~ → **ARCHIVADA**.
- [~] **UI.A.29** ~~🎨 (web) BlurView fallback Firefox/Safari~~ → **ARCHIVADA**.
- [~] **UI.A.30** ~~🎨 (web) Viewport meta~~ → **ARCHIVADA**.
- [~] **UI.A.31** ~~🎨 (web) Conflicto swipe HorizontalNav~~ → **ARCHIVADA**.
- [~] **UI.A.32** ~~🎨 (web) SafeAreaView en web~~ → **ARCHIVADA**.

### F · Touch targets & inputs

- [ ] **UI.A.33** 🎨 Auditar todos los hit targets <44pt y expandir con `hitSlop` o padding:
  - YouTube "Extraer" button (paddingVertical 6 → ~28pt total). Subir a 12.
  - Modal chips (paddingVertical 9 → ~36pt). Subir a 13 o aumentar fontSize.
  - Severity badges en feedback tooltip.
- [ ] **UI.A.34** 🎨 Validación inline en YouTube `TextInput`: detectar URL inválida y mostrar microcopy bajo el input (regla `inline-validation` + `error-clarity`). Hoy un URL malformado no avisa.
- [ ] **UI.A.35** 🎨 Modal Discard: usar `animationType="slide"` + drag handle visible (3px × 36px gray bar centrada arriba del sheet) para coherencia con expectativa nativa iOS. Hoy es `"fade"` y sin handle.

### G · Loading & empty states

- [ ] **UI.A.36** 🎨 Reemplazar `ActivityIndicator` en `FeedbackScreen` (loading >1s) por **skeleton screen** (3 burbujas grises shimmer + header skeleton).
- [ ] **UI.A.37** 🎨 Mismo skeleton pattern para `SessionClosingScreen` — el spinner solo es válido <300ms.
- [ ] **UI.A.38** 🎨 Agregar **empty state HomeScreen first-time user**: hint "Tap the mic to start your first conversation" + arrow apuntando al mic. Esconderse después de la primera sesión.
- [ ] **UI.A.39** 🎨 Empty state planificado para `VocabularyHubScreen` (Fase 9.7.11) y `HistoryScreen` (Fase 8.1) — diseñar antes de implementar, no después.

### H · Icon consistency

- [ ] **UI.A.40** 🎨 Unificar **fill vs outline** en iconos del mic: hoy `mic` y `stop` son filled, `hourglass-outline` y `radio-outline` son outline. Decidir un estilo único (probablemente outline para coherencia con header `arrow-back`, `settings-outline`, `moon-outline`).
- [ ] **UI.A.41** 🎨 Documentar **icon set canónico** en DESIGN_SYSTEM.md (§ nueva): Ionicons outline + stroke width 1.5 + sizes 18/22/24 + alignment baseline. Hoy no hay regla escrita.

### I · Performance & rendering

- [ ] **UI.A.42** 🧠 Auditar **mount cost de HorizontalNav**: las 3 pantallas (Roleplay, Home, SRS) montan side-by-side. Sonar loop + breath loop + blob animation corren en pantallas offscreen → CPU/GPU desperdiciado. Pausar animaciones cuando `currentPage !== index`.
- [ ] **UI.A.43** 🧠 `FeedbackScreen` usa `ScrollView` para turnos. Sesiones >40 turnos producirán memory pressure. Migrar a `FlatList` con `removeClippedSubviews` antes de Fase 13.
- [ ] **UI.A.44** 🧠 Auditar **re-render del Home** en cada cambio de `voiceStatus`: el componente raíz se re-renderiza completo (incluye todos los hijos). Memoizar `GlassLayers`, `HeaderBtnBorder` con `React.memo`.

### J · Documentación cruzada

- [ ] **UI.A.45** 📦 Crear `crafting/UI_AUDIT_2026-06.md` con: tabla "Figma node ↔ código path ↔ spec sección", lista de divergencias, snapshot de tokens vigentes vs aplicados. Sirve como baseline para futuras auditorías y referencia para Gemini al generar nuevas pantallas.
- [ ] **UI.A.46** 📦 Actualizar `DESIGN_SYSTEM.md § 8` (tabla de anti-patterns) con los hallazgos nuevos: dos implementaciones de glass, hardcoded font sizes, mix fill/outline icons, emoji severidad load-bearing, `surfaceSoft` no theme-aware.

---

## Notas de ejecución

- **Tasks atómicas pero no microscópicas**: cada una debería caber en 1-3 mensajes de iteración. Si una tarea crece, se subdivide al momento.
- **Verificaciones ✅** son no negociables — no avanzar a la próxima fase con la verificación de la actual fallando.
- **Costos de IA**: monitorear desde Fase 5 en adelante. Referencia de estimaciones en [COSTS.md](COSTS.md). Si OpenCode Go llega a saturarse, activar el plan fallback cambiando `LLM_ENDPOINT` y `LLM_MODEL` en las Edge Functions.
- **Multi-idioma extendido**, **modo "continuar roleplay"**, **conversation starters inteligentes** → defer a v2. Costo de ingeniería de nuevo idioma documentado en [ARCHITECTURE.md](ARCHITECTURE.md).
