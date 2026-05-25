# Product Requirements Document (PRD)

## Visión del Proyecto
Una aplicación móvil orientada a la práctica **activa** de idiomas (inglés y alemán) mediante conversaciones de voz potenciadas por Inteligencia Artificial. El producto busca emular la experiencia de tutores IA premium (como Duolingo Max o Elsa Speak) pero a un costo mínimo o nulo (aprovechando APIs gratuitas o proxies ya pagados), añadiendo funcionalidades personalizadas como análisis de videos de YouTube y exportación inteligente de conocimientos al baúl personal de Obsidian del usuario.

## Audiencia y Problema
- **Problema:** La escucha pasiva (podcasts, YouTube) no desarrolla las habilidades de "Speaking" ni la fluidez mental en conversaciones reales. Las apps comerciales tienen mucha fricción (ejercicios repetitivos manuales) o son muy costosas en sus versiones premium impulsadas por IA.
- **Solución:** Una app de "cero fricción" (Un botón gigante para hablar) que permite tener conversaciones libres o de roleplay con una IA de baja latencia, que recuerde al usuario (memoria a largo plazo) y discuta sobre temas de interés consumidos recientemente (ej. videos de YouTube).

## Funcionalidades Core (MVP)
1. **Zero-Friction Voice Chat:**
   - Botón principal de "Call to Action" masivo. Tocar para hablar.
   - Selector de idioma en la parte superior derecha (Inglés B2, Alemán A1).
   - Capacidad de funcionar en **segundo plano** (pantalla apagada, con audífonos en el bolsillo).
   - **Edge case:** Audios < 2 segundos no se procesan — la app vuelve silenciosamente al estado "Tap to Speak" sin llamar a ninguna API.

2. **Roleplay Mode** — práctica activa estructurada con escenarios sugeridos por IA, máscara de teatro como entrada, "dado" para re-sortear tema, sesión soft-target de ~5 min. Al aceptar un escenario, la IA adopta un personaje con mood y estilo fijos (rol implícito en el texto del escenario) que mantiene hasta el cierre narrativo. Detalle completo en [ROLEPLAY.md](ROLEPLAY.md).

2.5. **Guided Practice Mode** — tercer modo conversacional que fuerza producción activa de expresiones B2 (phrasal verbs, palabras "rare-but-useful" como *hence*, *glance*). Tras cada turno de la IA, la app emite 4 chips de expresión sugerida (mix de tus tracked_items + corpus B2 curado + sugerencia contextual del LLM); el usuario debe intentar usar una. Si no, la IA hace re-prompt suave invitándolo a reformular (sin enforcement duro). El LLM decide cuándo emitir chips (salta saludos y small-talk). Detalle completo en [GUIDED_PRACTICE.md](GUIDED_PRACTICE.md).

3. **Feedback estructurado post-sesión** — pantalla con transcripción navegable, marcado a color (🔴 errores graves / 🟡 advertencias-estrategias horizontales / 🔵 mejoras), spans clickeables con preview y deep-dive flotante voz↔voz. Librería de errores con pesos que alimenta SRS y nudges implícitos al LLM. Detalle completo en [FEEDBACK.md](FEEDBACK.md).

4. **YouTube Video Context (Gemini Integration):**
   - Input en la parte inferior para pegar URLs de YouTube.
   - Análisis de contexto rápido del video mediante Gemini 1.5 Flash.
   - Discusión interactiva sobre el contenido del video (refuerzo de input pasivo convirtiéndolo en output activo).

5. **Memoria a Largo Plazo y RAG:**
   - La IA recuerda eventos pasados, preferencias y detalles de conversaciones anteriores y los utiliza de forma conversacional.

6. **Obsidian "Brain" Integration:**
   - Al finalizar la sesión, un proceso en segundo plano analiza la conversación.
   - Extrae entidades, eventos y tópicos clave (ej. `deportes`, `amigos`, `paranoia`).
   - Genera archivos Markdown estructurados con enlaces (Backlinks `[[tag]]`) compatibles con Obsidian para conectar conocimiento.

## Funcionalidades Secundarias
- **Vocabulary Catalog** — catálogo personal browsable de palabras y expresiones que el usuario *ya domina* o *quiere adoptar conscientemente*. Distinto del SRS (que entrena items débiles) y de `tracked_items` (que registra errores). Se llena por 3 vías: promoción automática cuando un tracked_item se gradúa (`weight ≤ 0` + retención 14d), sugerencia post-sesión de palabras B2+ que dijo la IA, y adición manual desde la transcripción del feedback. Filtros anti-ruido por CEFR floor configurable. Detalle en [VOCABULARY_CATALOG.md](VOCABULARY_CATALOG.md).
- **SRS Phrasal Verbs (EN-only)** — sección de repaso espaciado de las expresiones donde el usuario más se equivoca, derivada de los `tracked_items` del feedback. Detalle en [FEEDBACK.md](FEEDBACK.md).
- **Pronunciation Score** — evaluación fonética asíncrona después de cada turno del usuario: score 0-100 con breakdown por zona de pronunciación. Implementado con Azure Speech Pronunciation Assessment (o Speechace API como alternativa). Se muestra como un badge pequeño debajo de la burbuja del usuario en el FeedbackScreen. No bloquea el flujo ni la conversación.
- **Shadow Reading Mode** — la IA pronuncia una frase (TTS) y el usuario la repite en voz alta. Whisper transcribe la repetición y el LLM evalúa precisión, velocidad (palabras/min) y naturalidad. Accesible como sub-sección dentro del área SRS (swipe derecho). Diferenciador técnico frente a Duolingo/apps genéricas; trabaja la prosodia y el acento.
- Gamificación simple (Streaks / Rachas) sin bloquear la experiencia core.
- Haptics (vibración) para mejor UX en la interacción de botones y cargas.
