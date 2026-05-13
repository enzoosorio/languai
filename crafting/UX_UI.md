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
   - **Paso 4 — Tour de funciones clave:** 3-4 tarjetas swipeables que muestran: botón central (conversación libre), swipe izq (Roleplay), swipe der (SRS + Shadow Reading).
   - **Paso 5 — Conectar GitHub (opcional):** Instrucciones para obtener un Personal Access Token + ingresar nombre del repo de Obsidian. Se puede omitir con "Ahora no" y configurar después desde Ajustes.
   - **Finalizar:** Marca `onboarding_completed = true` y navega directamente al Home.

1. **Pantalla Home (Core)**
   - **Header:**
     - Botón selector fluido de Idioma (🇪🇸/🇺🇸 EN B2 \/ 🇩🇪 DE A1) arriba a la derecha. 
     - Streak/Racha sutil (🔥 14) en la esquina superior izquierda.
   - **Centro:**
     - Botón circular masivo. Cambia de estado: "Tap to Speak", "Listening...", "Processing..." o un simple ícono de micrófono.
     - Interacciones hápticas (Vibración suave al presionar, vibración doble cuando la IA empieza a responder).
   - **Bottom:** 
     - Input text con "borde radius alto" (forma de píldora). Placeholder: "Paste a YouTube link...".
     - Al tocarlo: El fondo hace overlay oscuro (Blur), el teclado se levanta y se permite pegar el link. Al darle "Go" -> Haptic feedback sutil (success) e indicador visual de "Context Loaded".
   
2. **Pantalla Roleplay / Scenarios (Navegación Secundaria)** — detalle completo en [ROLEPLAY.md](ROLEPLAY.md).
   - **Acceso doble**: swipe izquierdo desde Home (primario) **+** botón máscara de teatro 🎭 en una esquina (fallback descubrible).
   - **Pantalla de selección**: una frase grande con el setup del roleplay generada por IA (ej. *"You're returning a defective laptop to a store"*) + botón **dado 🎲** que re-sortea con haptic y animación de rolling.
   - La frase es tappable (padding generoso evita misclick con el dado) y equivale a "Aceptar". Botón "Aceptar" explícito como redundancia.
   - **Pantalla de conversación**: idéntica al Home + banner sutil con el escenario + indicador no-agresivo de tiempo hacia el target de 5 min.

3. **Pantalla de Feedback** (post-sesión) — detalle completo en [FEEDBACK.md](FEEDBACK.md).
   - Burbujas de chat glassmórficas estilo iMessage con la transcripción completa.
   - **Color coding** sobre los spans de las intervenciones del usuario:
     - 🔴 Rojo = error grave (rompe contexto / fallo estructural).
     - 🟡 Amarillo = advertencia / estrategia horizontal (circunlocución; existe upgrade).
     - 🔵 Azul = mejora / alternativa más natural.
   - **Tap en span** → tooltip preview con explicación corta.
   - **Tap en preview** → expande a pantalla de **deep-dive** dedicada (voz↔voz) sobre esa palabra/frase.
   - **Minimizar el deep-dive** → un **circulito flotante** (draggable) queda en una esquina. **Solo 1 activo a la vez**: abrir otro reemplaza el actual (confirmación si tiene > N turnos).

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

