# Roleplay Mode

Modo de práctica activa estructurada: la IA propone un escenario, el usuario lo acepta y entran en una conversación voz↔voz con un objetivo narrativo concreto. Complementa el modo libre del Home (ver [PRODUCT.md](PRODUCT.md)).

## Propósito

El modo libre es "abrir y hablar". El modo Roleplay añade **fricción intencional de setup** (elegir escenario) a cambio de **dirección**: el usuario practica situaciones realistas (devolver un producto, una entrevista, conocer gente) con un arco conversacional. Inspirado en los scenarios premium de Speak / ELSA / Duolingo Max, pero gratis y personalizable.

## Flujo de entrada

Desde Home hay **dos vías equivalentes** (coexisten para que se pueda desactivar una en el futuro sin perder la otra):

1. **Swipe izquierdo** desde Home (gesto primario, UX moderna estilo Tinder/Instagram).
2. **Botón máscara de teatro 🎭** en una esquina (fallback explícito y descubrible).

Ambas disparan la misma transición animada hacia la pantalla de selección de tema.

## Pantalla de selección de tema

Layout minimalista, dark/light mode con glassmorphism:

- **Frase principal**: setup del roleplay en una oración grande, centrada. Ej:
  > *"You're returning a defective laptop to a store and the clerk is uncooperative."*
- Área tappable con padding generoso alrededor de la frase (evita misclick con el dado).
- **Botón dado 🎲** debajo de la frase. Al tocar: animación de rolling + haptic + se reemplaza la frase por otra del cache (o se pide una nueva si el cache está vacío).
- **Botón "Aceptar"** explícito (redundancia accesible). Equivalente a tappear la frase.
- **Botón "Atrás" / swipe derecho** vuelve al Home sin penalización.

### Generación de temas (IA)

- Edge Function llama al LLM con un prompt que pide N escenarios cortos, contextuales, al nivel del usuario (B2 EN / A1 DE — ver [PRODUCT.md](PRODUCT.md)).
- El prompt mezcla intereses extraídos del RAG (ver [MEMORY_SYSTEM.md](MEMORY_SYSTEM.md)): si el usuario ha hablado de deportes o cocina, los escenarios tienden suavemente hacia esos tópicos sin saturar.
- **Cache local de N=5 frases pre-generadas** para que el dado se sienta instantáneo. Se rellena en background cuando baja de 2.
- Costo bajo: una llamada al abrir la pantalla genera el batch entero.

## Pantalla de conversación de roleplay

Idéntica al Home en lo central (botón grande, ondas sonoras, voz↔voz), con diferencias:

- **Banner sutil arriba** con el setup del escenario (1 línea, glass, colapsable).
- **Indicador de tiempo no agresivo**: una barra/anillo tenue que progresa hacia los 5 min. No es countdown.
- **Salir**: botón siempre visible. Al pulsar → confirma guardado parcial → dispara el flujo de feedback (ver [FEEDBACK.md](FEEDBACK.md)) con lo que se alcanzó a conversar.

### Cierre narrativo (~5 min)

El system prompt de la IA incluye instrucción de **cerrar el roleplay orgánicamente** alrededor de los 5 min (despedirse, agradecer, concluir la escena). No hay corte forzado: si el usuario quiere seguir, la IA reabre la conversación.

## Métricas por sesión

A registrar (inspirado en lo que Speak / Duolingo Max suelen mostrar — validar números reales en investigación posterior):

- Duración total.
- # turnos del usuario.
- Palabras únicas usadas.
- Errores por severidad (🔴/🟡/🔵, ver [FEEDBACK.md](FEEDBACK.md)).
- Tags temáticos extraídos.
- (Futuro) score de pronunciación si se integra un modelo dedicado.

## Persistencia

Misma capa que el modo libre — ver tablas `sessions`, `session_turns` en [ARCHITECTURE.md](ARCHITECTURE.md). Particularidades del roleplay:

- `sessions.type = 'roleplay'`.
- `sessions.scenario` guarda el setup textual exacto que aceptó el usuario.
- En el histórico (lista de cards, ver [FEEDBACK.md](FEEDBACK.md)), el título de la card es el `scenario` truncado y los tags se muestran como chips.

## Personaje de la IA en Roleplay

**Decisión:** Al aceptar un escenario, la IA adopta automáticamente el rol implícito en el texto del escenario (ej. "the store clerk is uncooperative" → la IA es el clerk, uncooperativa desde el inicio). Este mood y estilo se mantienen fijos durante toda la sesión hasta el cierre narrativo. La IA no rompe el rol salvo que el usuario explícitamente lo pida. El personaje es genérico (sin nombre fijo), definido por el escenario.

En la **conversación genérica** (botón central en Home), la IA no adopta ningún rol — actúa como asistente conversacional libre sin restricción de personaje.

## Open issues / a iterar

- ¿Permitir que el usuario edite la frase del escenario antes de aceptar? Útil pero rompe el flujo zero-friction; defer a post-MVP.
- ¿Modo "continuar roleplay anterior"? Reabrir una sesión previa con contexto. Defer a post-MVP.
