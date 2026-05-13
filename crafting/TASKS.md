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


## Fase 2 — App shell, theming y navegación por swipe

- [ ] **2.1** 🎨 Theme tokens en `src/theme/`: paleta dark + light, glass tokens (blur, opacity), tipografía. Hook `useTheme()`.
- [ ] **2.2** 🎨 Componente reusable `<GlassCard />` con `expo-blur` y bordes redondeados. Aplica dark/light correctamente.
- [ ] **2.3** 🎨 Implementar navegación principal con `react-native-pager-view` (swipe horizontal): Home (centro), Roleplay (izq), SRS + Shadow (der).
- [ ] **2.4** 🎨 Botones fallback equivalentes al swipe en cada extremo de Home (máscara 🎭 a la izq, libro 📚 a la der).
- [ ] **2.5** 🎨 Pantalla Home estática: botón circular masivo central, header con selector de idioma (EN B2 / DE A1) + streak 🔥 placeholder, input píldora abajo.
- [ ] **2.6** 🎨 Toggle dark/light en una pantalla de ajustes mínima (acceso desde long-press en header).
- [ ] **2.7** ✅ Verificar swipes + fallback + theming en device físico.

## Fase 2.5 — Onboarding

- [ ] **2.5.1** 🎨 Componente `<OnboardingStep />` reutilizable con barra de progreso y botones "Siguiente" / "Omitir" (para pasos opcionales).
- [ ] **2.5.2** 🎨 Paso 1 — Idioma nativo: selector de idioma (lista scrolleable, al menos 10 idiomas comunes). Guarda en `user_settings.native_language`.
- [ ] **2.5.3** 🎨 Paso 2 — Idiomas a practicar: toggle multi-select EN 🇺🇸 / DE 🇩🇪 (MVP). Guarda selección.
- [ ] **2.5.4** 🎨 Paso 3 — Nivel por idioma: selector CEFR (A1/A2/B1/B2/C1) para cada idioma elegido. Guarda en `user_settings.languages_config`.
- [ ] **2.5.5** 🎨 Paso 4 — Tour de funciones: 3-4 tarjetas swipeables estáticas con illustrations del botón central, swipe izq (Roleplay), swipe der (SRS + Shadow).
- [ ] **2.5.6** 🎨 Paso 5 — GitHub opcional: inputs para Personal Access Token + nombre del repo. Botón "Ahora no" sin penalización. Validar token si se ingresa.
- [ ] **2.5.7** 🗄️ Al finalizar: setear `user_settings.onboarding_completed = true`. Navegar a Home.
- [ ] **2.5.8** 🧠 En el arranque de la app: si `onboarding_completed = false`, redirigir a Onboarding antes de mostrar Home.
- [ ] **2.5.9** ✅ Onboarding completo de inicio a fin con y sin GitHub. Verificar que el nivel elegido se refleja en el selector de idioma del Home.

## Fase 3 — Voice pipeline (modo libre MVP loop)

- [ ] **3.1** 🧠 Servicio STT en `src/services/stt.ts` usando **Groq Whisper** API. Función `transcribe(audioBlob, lang) → text`.
- [ ] **3.2** 🎨 Hook `useVoiceRecording()` con `expo-av`: tap start, tap stop, devuelve audio blob. Indicador visual "Listening...". **Edge case:** si la duración del audio < 2 segundos, descartar silenciosamente y volver a estado "Tap to Speak" sin llamar a Groq.
- [ ] **3.3** 🧠 Extender Edge Function `chat-turn`: recibe `{ session_id, user_text, lang, level }`, llama al LLM vía proxy OpenCode con system prompt base, devuelve `{ ai_text }`.
- [ ] **3.4** 🧠 Servicio TTS en `src/services/tts.ts` (OpenAI TTS para empezar — barato). Función `speak(text, lang) → audio URL`.
- [ ] **3.5** 🎨 Animación de ondas sonoras (Reanimated) que reacciona al input/output de audio. Estados: idle / listening / processing / speaking.
- [ ] **3.6** 🎨 Haptics: tap suave al iniciar grabación, doble vibración cuando empieza respuesta de IA.
- [ ] **3.7** ✅ Loop end-to-end: hablo en Home → veo "Processing..." → escucho respuesta IA. Probar en EN y DE. Probar audio < 2s → debe ignorarse sin error.

## Fase 3.5 — Pronunciation Score

- [ ] **3.5.1** 🧠 Edge Function `score-pronunciation` (Deno, asíncrona): recibe `{ audio_b64, transcript, lang }`, llama a Azure Speech Pronunciation Assessment API, devuelve `{ score: 0-100, breakdown: {...} }`.
- [ ] **3.5.2** 🗄️ Añadir campo `pronunciation_score float` a `session_turns` para persistir el score por turno.
- [ ] **3.5.3** 🧠 Disparar `score-pronunciation` en paralelo (fire-and-forget) después de cada turno del usuario en `chat-turn`. No bloquea el flujo conversacional.
- [ ] **3.5.4** 🎨 En `FeedbackScreen`, mostrar badge pequeño de score bajo la burbuja del usuario si `pronunciation_score` está disponible. Badge: número + barra de color (verde > 80, amarillo > 60, rojo ≤ 60).
- [ ] **3.5.5** ✅ Hablar un turno → cerrar sesión → ver badge de pronunciación en el feedback. Verificar que no añade latencia perceptible a la conversación.

## Fase 4 — Persistencia de sesiones

- [ ] **4.1** 🗄️ Store Zustand `useSessionStore`: crea sesión al primer turno, mantiene `session_id`, idioma, modo (`free` por ahora).
- [ ] **4.2** 🗄️ Función `persistTurn(session_id, speaker, text)` que escribe a `session_turns`. Llamarla después de cada STT (user) y cada respuesta LLM (ai).
- [ ] **4.3** 🎨 Botón "End session" en Home (visible solo si hay sesión activa). Marca `sessions.ended_at`.
- [ ] **4.4** ✅ Hablar 2-3 turnos, cerrar sesión, verificar filas en Supabase (`sessions`, `session_turns`).

## Fase 5 — Feedback core (pipeline + UI básica)

- [ ] **5.1** 🧠 Edge Function `generate-feedback` (Deno, asíncrona): recibe `session_id`, lee turnos, llama LLM con prompt estructurado, retorna JSON validado (ver [FEEDBACK.md](FEEDBACK.md)).
- [ ] **5.2** 🧠 Validador JSON con **2 reintentos**: retry 1 con prompt más estricto; retry 2 con prompt mínimo de campos obligatorios. Si ambos fallan, setear `feedback_status = 'failed'`.
- [ ] **5.3** 🎨 Estado de error de feedback: cuando `feedback_status = 'failed'`, mostrar popup en la app con opción de completar campos manualmente (HITL) o descartar.
- [ ] **5.4** 🗄️ Persistir resultados de `generate-feedback`: `feedback_annotations` + upsert a `tracked_items` (acumular `weight`, actualizar `last_seen_session`) + setear `sessions.summary` y `sessions.tags`.
- [ ] **5.5** 🎨 Pantalla `FeedbackScreen` con header (título + tags + contadores 🔴🟡🔵) y body scrolleable de turnos como `<GlassCard />` estilo chat.
- [ ] **5.6** 🎨 Componente `<AnnotatedText />` que renderiza spans con fondo/underline rojo / amarillo / azul según severidad.
- [ ] **5.7** 🎨 Tap en span → tooltip preview con `explanation` + `suggestion` + botón "No era error" (rechazo). Al rechazar: actualizar `weight` y `user_rejections` en `tracked_items`.
- [ ] **5.8** 🧠 Lógica de auto-archivado por rechazo: si `user_rejections >= 2` y `weight <= 0`, archivar el item automáticamente sin confirmación.
- [ ] **5.9** 🎨 Trigger: al pulsar "End session" → loader → navegar a `FeedbackScreen` cuando la Edge Function responde.
- [ ] **5.10** 🧠 Al generar feedback, detectar si el mismo `lemma` aparece en 3+ sesiones previas del usuario. Si sí, incluir en el output JSON un campo `pattern_insights[]`.
- [ ] **5.11** 🎨 Si `pattern_insights` no vacío, mostrar tarjeta de Pattern Insight en la parte superior del `FeedbackScreen` con botón para abrir deep-dive directo.
- [ ] **5.12** 🧠 En Edge Function `chat-turn`, detectar fuzzy-match de las expresiones del nudge (`tracked_items` con weight alto) en la respuesta IA. Incluir en respuesta `used_nudge_items[]`.
- [ ] **5.13** 🗄️ Persistir `used_nudge_items` por sesión. Al cerrar, mostrar en FeedbackScreen: *"Expresiones practicadas hoy: 'run into' ✓"* con badge en el SRS.
- [ ] **5.14** ✅ Sesión real → recibir feedback con colores → ver tooltip → rechazar span → verificar cambio de weight → ver Pattern Insight si aplica.

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

## Fase 10 — RAG / Memoria a largo plazo

- [ ] **10.1** 🧠 Edge Function `extract-facts`: al cerrar sesión, LLM pequeño extrae 3-8 hechos atómicos sobre el usuario en oraciones independientes.
- [ ] **10.2** 🗄️ Tabla `user_facts(id, user_id, text, embedding vector(1536), source_session, created_at)`.
- [ ] **10.3** 🧠 Generar embeddings (OpenAI `text-embedding-3-small`) y guardar en `user_facts.embedding`.
- [ ] **10.4** 🧠 En `buildSystemPrompt` (Fase 9.6), antes de iniciar sesión: embed del primer mensaje del usuario o del scenario, buscar top-5 hechos similares con `<=>`, inyectarlos como contexto.
- [ ] **10.5** ✅ Mencionar algo en sesión 1 → comprobar que la IA lo recuerda en sesión 2.

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

## Notas de ejecución

- **Tasks atómicas pero no microscópicas**: cada una debería caber en 1-3 mensajes de iteración. Si una tarea crece, se subdivide al momento.
- **Verificaciones ✅** son no negociables — no avanzar a la próxima fase con la verificación de la actual fallando.
- **Costos de IA**: monitorear desde Fase 5 en adelante. Referencia de estimaciones en [COSTS.md](COSTS.md). Si OpenCode Go llega a saturarse, activar el plan fallback cambiando `LLM_ENDPOINT` y `LLM_MODEL` en las Edge Functions.
- **Multi-idioma extendido**, **modo "continuar roleplay"**, **conversation starters inteligentes** → defer a v2. Costo de ingeniería de nuevo idioma documentado en [ARCHITECTURE.md](ARCHITECTURE.md).
