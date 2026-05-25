# Experiencia de Usuario e Interfaz (UX/UI)

El paradigma principal es el "Anti-Scroll" y "Cero Fricción". El usuario debe abrir la aplicación y, sin mirar la pantalla más de 2 segundos, empezar a hablar.

## Principios transversales

- **Navegación principal por swipe**, no por tab bar inferior. Las tab bars se sienten antiguas y rompen el flujo zero-friction; los swipes son modernos, móvil-nativos y permiten gestos rápidos.
- **Cada gesto de swipe tiene un botón fallback equivalente**. Permite desactivar uno u otro en el futuro sin perder la funcionalidad, y mejora la descubribilidad para usuarios nuevos.
- **Dark mode + light mode** soportados desde el MVP, ambos con glassmorphism / blur. Toggle accesible desde ajustes.
- **Haptics** consistentes: tap suave en botones, doble vibración cuando la IA empieza a responder, success en "Go" del input de YouTube, rolling continuo en el dado del Roleplay.

## Diseño Visual
- **Tema:** Dark mode por defecto para menos fatiga visual, fondo desenfocado (Glassmorphism / Blur effects). Light mode disponible con misma estética glass.
- **Animaciones:** Ondas sonoras tenues (Sound waves) en el centro que reaccionan a la voz en tiempo real cuando la IA procesa o cuando el usuario habla.

## Pantallas Principales

0. **Onboarding (primer arranque)**

   Se muestra una sola vez cuando `user_settings.onboarding_completed = false`. Flujo de pasos secuenciales, sin scroll, estética glass:

   - **Paso 1 — Idioma nativo:** Selector de idioma nativo del usuario (ej. Español, Inglés, Francés). Se guarda en `user_settings.native_language`.
   - **Paso 2 — Idiomas a practicar:** Toggle multi-select (MVP: EN 🇺🇸 y/o DE 🇩🇪). El usuario puede elegir uno o ambos simultáneamente.
   - **Paso 3 — Nivel por idioma:** Selector de nivel CEFR (A1 / A2 / B1 / B2 / C1) para cada idioma elegido. Por defecto: EN → B2, DE → A1.
   - **Paso 4 — Tour de funciones clave:** 3-4 tarjetas swipeables que muestran: botón central (conversación libre + modos Free/Roleplay/Guided), swipe izq (Vocabulary Hub), swipe der (SRS Flashcards).
   - **Paso 5 — Conectar GitHub (opcional):** Instrucciones para obtener un Personal Access Token + ingresar nombre del repo de Obsidian. Se puede omitir con "Ahora no" y configurar después desde Ajustes.
   - **Finalizar:** Marca `onboarding_completed = true` y navega directamente al Home.

1. **Pantalla Home (Core)**
   - **Header:**
     - Botón selector fluido de Idioma (🇪🇸/🇺🇸 EN B2 \/ 🇩🇪 DE A1) arriba a la derecha. Tap → modal de selección de idioma + nivel CEFR.
     - Streak/Racha sutil (🔥 14) en la esquina superior izquierda. **Long-press (600ms)** → toggle dark/light theme (no hay botón dedicado para reducir clutter).
   - **Centro:**
     - Botón circular masivo. Tap-toggle (no press-and-hold, decisión documentada en [CONVERSATION_LIFECYCLE.md](CONVERSATION_LIFECYCLE.md)). Cambia de estado: "Tap to Speak", "Listening… tap to send", "Processing…", "Speaking…".
     - Interacciones hápticas (vibración suave al presionar, doble vibración cuando la IA empieza a responder).
   - **Selector de modo** (compacto, arriba del botón principal):
     - Pill selector: `[Free]` `[Roleplay]` `[🎯 Guided]`. El modo activo se resalta; tap cambia sin navegar a otra pantalla.
     - El sub-label del botón principal cambia según modo: `"Free conversation"` / `"Choose a scenario"` / `"chips after the warm-up"`.
     - Al seleccionar **Guided** → bottom-sheet de config (aparece una sola vez antes del primer turno de la sesión):
       - Foco: `[ Mis errores ]` `[ Vocabulario B2 ]` `[ Mixto ]`
       - Duración soft-target: `5 min` / `10 min`
     - Al seleccionar **Roleplay** → abre flujo de selección de escenario con dado 🎲 (igual que antes, ahora iniciado desde Home). Detalle en [ROLEPLAY.md](ROLEPLAY.md).
   - **Bottom:** 
     - Input text con "borde radius alto" (forma de píldora). Placeholder: "Paste a YouTube link...".
     - Al tocarlo: El fondo hace overlay oscuro (Blur), el teclado se levanta y se permite pegar el link. Al darle "Go" -> Haptic feedback sutil (success) e indicador visual de "Context Loaded".

### 1.1 Focus Mode (durante conversación activa)

Cuando el usuario está conversando, la UI **gradualmente** se concentra en el mic central para evitar gestos accidentales y reforzar el "modo flow". Ver el detalle de estados y transiciones en [CONVERSATION_LIFECYCLE.md](CONVERSATION_LIFECYCLE.md).

**Tres niveles de focus (fade progresivo):**

| Nivel | Cuándo | Visual |
|---|---|---|
| **Normal** | Estado `idle`, sin sesión activa | UI completa: pills, swipes, edge buttons (🎭 📚), YouTube píldora |
| **Focus parcial** | Tap 1 → mientras se graba o procesa el primer turno | Edge buttons + swipes fade a `opacity: 0.3`, gestos swipe bloqueados. Pills siguen visibles. |
| **Focus completo** | Después de la primera respuesta de IA recibida → sesión persistida (`isActive = true`) | Edge buttons, swipes y YouTube píldora ocultos. Aparecen: botón **End conversation** (footer, glass danger) + botón **Back ←** (top-left, descartar sesión con confirmación si ≥2 turnos). Pills minimizadas opcionalmente. |

**Salida del focus:**
- "End conversation" → trigger del flujo `closing → summary` (loader → FeedbackScreen)
- "Back" → modal de confirmación → discard sin guardar feedback
- IA detecta despedida via tool call → cierre automático (ver [CONVERSATION_LIFECYCLE.md](CONVERSATION_LIFECYCLE.md) §3)

**Animación:** fade progresivo de 250ms easing `ease-out` entre niveles. Reversible: si el audio se descarta (<2s) sin haber persistido un turno, vuelve suavemente a Normal.
   
2. **Vocabulary Hub (Vista Izquierda)** — accesible por swipe izquierdo desde Home + botón fallback.
   - **Header:** "Vocabulary Hub" + contador total de entradas en el idioma activo.
   - **Tab interno [📚 Catálogo]:**
     - Search bar + filtros: `[ All ]` `[ Phrasal ]` `[ Words ]` `[ Idioms ]` + selector CEFR level.
     - Cards con: expression, nivel CEFR, definición corta, badge de origen y estado.
     - Badges por estado: `✨` usada post-catálogo · `⚠` activa en práctica · `🎯` graduada desde tracked_items · `🌱` sugerida post-sesión · `✋` manual.
     - **Tap en card** → drawer con definición completa, ejemplos, sesiones relacionadas, campo `user_note` editable y botón "Open deep-dive".
     - **Swipe izquierdo en card** → ocultar (`hidden = true`).
   - **Tab interno [🔁 En práctica]:**
     - Lista de `tracked_items` activos del idioma activo (misma lógica que el SRS actual).
     - Cross-link: si un item cumple criterios de graduación (`weight ≤ 0` + `srs_state.interval ≥ 14d`), aparece CTA inline "→ Agregar al catálogo".
   - Detalle completo en [VOCABULARY_CATALOG.md](VOCABULARY_CATALOG.md).

> **Roleplay** ya no ocupa un slot de swipe — vive en el selector de modo del Home. Seleccionarlo abre el flujo de selección de escenario con dado 🎲 igual que antes. Detalle en [ROLEPLAY.md](ROLEPLAY.md).

### 2.1 Componente Guided Practice Chips

Aparecen debajo de la última burbuja de la IA cuando `session.mode = 'guided'` y la Edge Function `guided-chips` decide emitirlos. El LLM decide por turno si emitir o no según contexto (ver [GUIDED_PRACTICE.md §3](GUIDED_PRACTICE.md)).

- **Layout:** 4 chips en fila; wrapping a 2×2 si no caben. Usan el componente `<Pill>` existente con variante visual `guided-chip`.
- **Badge superior por chip:** `🎯 SRS` · `✨ B2` · `🌱 contextual` — indica al usuario por qué se lo propone.
- **Tap corto** → tooltip con `hint_short`.
- **Tap largo** → modal flotante con `hint_example` + speaker icon (TTS del ejemplo vía pipeline existente de TTS).
- **Animación de aparición:** stagger uno a uno (~80-100ms entre chips), fade-in + slide-up (`translateY: 12px → 0`), easing `cubic-bezier(0.22, 1, 0.36, 1)` (out-expo). Total ~400ms. Ver [ELASTIC_UI.md](ELASTIC_UI.md).
- **Re-prompt suave:** si el usuario habla sin usar ningún chip, la IA invita a reformular y los chips originales se vuelven a destacar sin llamada adicional al backend.
- **Cooldown:** si el usuario ignora chips 2 turnos seguidos, se pausan por 2 turnos para evitar sensación de acoso.

3. **Pantalla de Feedback** (post-sesión) — detalle completo en [FEEDBACK.md](FEEDBACK.md).
   - Burbujas de chat glassmórficas estilo iMessage con la transcripción completa.
   - **Color coding** sobre los spans de las intervenciones del usuario:
     - 🔴 Rojo = error grave (rompe contexto / fallo estructural).
     - 🟡 Amarillo = advertencia / estrategia horizontal (circunlocución; existe upgrade).
     - 🔵 Azul = mejora / alternativa más natural.
   - **Tap en span** → tooltip preview con explicación corta.
   - **Tap en preview** → expande a pantalla de **deep-dive** dedicada (voz↔voz) sobre esa palabra/frase.
   - **Minimizar el deep-dive** → un **circulito flotante** (draggable) queda en una esquina. **Solo 1 activo a la vez**: abrir otro reemplaza el actual (confirmación si tiene > N turnos).
   - **Post-sesión guiada — sección "Guided Practice Summary"** (solo si `session.mode = 'guided'`, al tope del FeedbackScreen):
     - Chips ofrecidos / usados / % usage rate.
     - Lista de expresiones practicadas con `✓` (usada al menos 1 vez) o `⚠` (ofrecida pero nunca usada).
   - **Post-sesión — sección "New for your catalog"** (si `generate-feedback` detecta candidatos B2+):
     - Lista de ≤5 palabras/expresiones que la IA usó en la sesión y el usuario aún no tiene en su catálogo.
     - Checkboxes para seleccionar cuáles agregar + botones "Agregar seleccionadas" / "Saltar".
     - Si no hay candidatos relevantes, la sección no aparece.

4. **Pantalla de Histórico** — lista de cards con sesiones pasadas, cada card con título / fecha / duración / tags / contadores por color. Tap → reabre el feedback navegable. Detalle en [FEEDBACK.md](FEEDBACK.md).

5. **Pantalla SRS + Shadow Reading (EN-only)** — accesible por swipe derecho desde Home + botón fallback. Tiene dos modos:
   - **SRS Phrasal Verbs:** Cards estilo Anki ordenadas por peso × recencia. Detalle en [FEEDBACK.md](FEEDBACK.md).
   - **Shadow Reading:** Sub-sección dentro de la misma pantalla (tab o toggle). La IA lee una frase en TTS → el usuario la repite en voz → Whisper transcribe → LLM evalúa. Muestra: % de palabras correctas, velocidad (palabras/min), naturalidad. Frases generadas desde los `tracked_items` del usuario.

6. **Pantalla de Feedback** ya incluye dos mejoras adicionales:
   - **Pronunciation badge:** Cada burbuja de turno del usuario puede mostrar un pequeño badge con el score de pronunciación (0-100). Se carga de forma asíncrona sin bloquear la pantalla.
   - **Burbuja de Error Pattern (Pattern Insight):** Si el sistema detectó que el usuario repitió el mismo error 3+ veces en distintas sesiones, aparece una tarjeta destacada en la **parte superior** del FeedbackScreen. Ejemplo: "Llevas 4 sesiones confundiendo 'make' vs 'do' — ¿quieres practicarlo ahora?" con botón para abrir deep-dive directo. Solo aparece si hay patrones detectados; no es intrusiva si no los hay.

## Funcionalidad Background (Audio)
La aplicación debe hacer uso de las APIs del sistema operativo para mantener activa la sesión de micrófono (siempre y cuando se configure como PTT - Push To Talk - o detección de voz estilo "Hey Siri"). 
- El flujo ideal para audífonos es que al presionar el botón del audífono se active el Speech-to-Text, o usar Voice Activation Detection (VAD) para escuchar en ráfagas.

