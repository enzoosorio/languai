# Sistema de Memoria y Conocimiento (Cognitive System)

Este sistema tiene 2 responsabilidades críticas: darle "conciencia prolongada" a la IA (RAG) y exportar conocimiento útil estructurado a tu Baúl de Obsidian.

## 1. Módulo RAG (Retrieval-Augmented Generation)

Para que la IA recuerde "la cena de anoche y el incidente del taxi", requerimos una base de datos vectorial sobre `user_facts` (ver schema en [ARCHITECTURE.md](ARCHITECTURE.md)).

### 1.1 Principio de separación de responsabilidades

**Crítico — no confundir:**

| Componente | Responsabilidad | Lo que NO hace |
|---|---|---|
| **Embeddings (pgvector)** | RETRIEVAL: encontrar facts semánticamente relacionados | No detecta contradicción. "Me gusta X" y "Odio X" son vecinos en el espacio vectorial. |
| **LLM judge (DeepSeek V4 Pro)** | CLASIFICACIÓN: razonar sobre la relación lógica entre facts | No reemplaza al retrieval — necesita los candidatos del paso anterior. |

Comparar floats por similitud vectorial **nunca** te dice si hay contradicción. Solo dice si hay co-mención de tema. La lógica semántica vive en el LLM.

### 1.2 Pipeline de extracción de facts

**Frecuencia de disparo (no esperar al cierre):**

- **Cada 3 turnos del usuario** durante la sesión: dispara `extract-facts` en background (fire-and-forget) sobre los últimos 3 turnos
- **Al cerrar sesión:** pasada final obligatoria sobre todos los turnos (cubre el caso de sesiones cortas <3 turnos)

**Por qué 3 turnos:** balance entre granularidad y costo. Cada-6 pierde detalle de conversaciones cortas; cada-1 satura. Parámetro en config app-wide, ajustable sin redeploy.

**Modelo:** DeepSeek V4 Flash (rápido, asíncrono, no bloquea voice loop).

### 1.3 Pipeline de validación e idempotencia

Cuando un candidate fact se extrae, antes de insertarlo:

```
1. Embed con OpenAI text-embedding-3-small (1536d)
2. pgvector retrieval:
     SELECT * FROM user_facts
     WHERE user_id = ?
       AND embedding <=> $1 < 0.45   -- distancia coseno baja = similar
     ORDER BY embedding <=> $1
     LIMIT 5
3. Si no hay candidatos → INSERT directo (es un fact nuevo, no relacionado a nada previo)
4. Si hay candidatos → LLM judge clasifica con prompt estructurado:
     Old fact: "{old.text}" (saved {old.created_at}, context: {old.session_type})
     New fact: "{new.text}" (saved now, context: {new.session_type})
     
     Output one of: IDEMPOTENT | REFINES | CONTRADICTS | CONTEXT_DEPENDENT | UNRELATED
5. Acción según output:
     - IDEMPOTENT → descartar (ya sabemos esto)
     - REFINES → UPDATE el viejo con el merge del nuevo
     - CONTRADICTS → marcar viejo con superseded_by = nuevo.id, INSERT el nuevo
     - CONTEXT_DEPENDENT → INSERT con needs_clarification = true (no overwrite)
     - UNRELATED → INSERT como fact independiente
```

**Threshold de distancia 0.45** (más permisivo que el típico 0.15) — queremos candidatos borderline, porque contradicciones suelen tener distancia moderada (mismo tema, sentido opuesto).

### 1.4 Categoría `CONTEXT_DEPENDENT` — la clave del sistema

Ejemplo del owner: ayer dijo *"me gusta la ensalada"*, hoy dijo *"no me gustan las verduras"*. ¿Contradicción real o context-dependent (ensalada de frutas, ensalada césar con pollo, etc.)?

Cuando el LLM judge no puede resolver con certeza, **no sobreescribe**. Marca el nuevo fact con `needs_clarification = true`. Esto dispara la feature §1.5.

### 1.5 Feature: el bot pide aclaración naturalmente

Cuando hay un fact con `needs_clarification = true` Y el tema actual de conversación se intersecta con el tópico del fact (vía embedding del último turno del usuario), el `chat-turn` Edge Function **inyecta una nota** en el system prompt:

```
[PENDING CLARIFICATION]
The user previously said: "likes salad" (last week)
And recently implied: "dislikes most vegetables" (today)
If natural in the conversation, ask for clarification — e.g., 
"Wait, I remember you mentioned liking salad. Did you mean fruit salad, 
or has your taste changed?"
Do not force it if the topic is unrelated.
```

El LLM decide si actuar o no. Cuando obtiene respuesta del usuario, otro pipeline async marca el fact como resuelto (`needs_clarification = false`, possibly `superseded_by` el nuevo clarificado).

**Esto es feature crítica — la IA que recuerda Y aclara se siente "viva", diferencia LanguAI de competidores.**

### 1.6 Cambios de schema necesarios (migración futura 006)

```sql
ALTER TABLE user_facts
  ADD COLUMN superseded_by uuid REFERENCES user_facts(id),
  ADD COLUMN confidence float NOT NULL DEFAULT 0.7,    -- 0..1, qué tan seguro el extractor
  ADD COLUMN needs_clarification bool NOT NULL DEFAULT false,
  ADD COLUMN topic_tags text[] NOT NULL DEFAULT '{}';  -- para intersección rápida sin embed
```

**No aplicar ahora** — esta migración va al arrancar Fase 6 (Deep-dive) o Fase 10 (RAG), lo que llegue primero.

### 1.7 Cruce con Tracked Items (Feedback)

Los `tracked_items` con `weight` alto (ver [FEEDBACK.md](FEEDBACK.md) y [ARCHITECTURE.md](ARCHITECTURE.md)) son candidatos a inyectarse en el system prompt como **nudge implícito**: la IA intenta naturalmente exponer al usuario a esas expresiones en conversaciones futuras, sin metacomentarlo. Esto convive con el RAG semántico — son dos canales de "memoria" diferentes:
- RAG = qué pasó / qué siente / qué le importa al usuario.
- Tracked Items = qué expresiones le cuesta producir y debe practicar.

## 2. Módulo de Integración con Obsidian
Se ejecuta de forma asíncrona (cuando apagas la sesión o la pones en pausa para hacer "Stand alone" summarization).

**Estrategia de Prompt de Extracción:**
Se le da la transcripción entera al LLM y se le instruye lo siguiente:
*"Eres un asistente de organización del conocimiento. Extrae de esta transcripción los conceptos recurrentes, los eventos destacables y los temas conversados. Genera un formato en Markdown utilizando Backlinks de Obsidian (e.j `[[tema]]`) para enlazar conceptos."*

**Ejemplo de resultado (Markdown exportado a GitHub/Obsidian Git):**
```md
---
date: 2026-05-12
type: conversation_log
tags: [english_practice, B2]
language: english
---

# Session: El incidente del Taxi y Deportes
*Generated by LanguAI*

## Hechos Clave
- Ayer salimos a cenar con amigos y terminamos jugando en la [[cancha de basketball]].
- El viaje de regreso en [[Taxi]] generó sensación de [[Paranoia]].

## Correcciones Lingüísticas
- **Error:** "I have fear of the taxi." → ver [[phrasal:have_fear_of]]
- **Corrección:** "I was afraid of taking the taxi." o "The taxi ride made me paranoid."

## Resumen de Progreso
Practicaste past tense y descripciones de eventos bajo presión emocional.
```

Los `[[phrasal:...]]` enlazan a notas del vault dedicadas a cada `tracked_item` relevante, permitiendo que el usuario navegue su propia historia de errores y correcciones desde Obsidian igual que en la app.

### Estrategia de sync con GitHub

- **Primario:** `PUT` directo al repo del usuario vía GitHub REST API (`/repos/{owner}/{repo}/contents/{path}`). Crea o actualiza el archivo con un commit automático.
- **Fallback:** Si el PUT falla (conflicto de merge, permisos insuficientes, branch protegido), la Edge Function crea automáticamente un Pull Request con el contenido. El usuario lo mergea cuando quiera desde GitHub o desde la app.
- **Setup:** Durante el onboarding, se muestra un paso paso a paso para conectar el Personal Access Token, el nombre del repo y confirmar que el plugin [Obsidian Git](https://github.com/Vinzent03/obsidian-git) está instalado en el vault.

## 3. Weekly Report (Reporte Semanal)

Cada domingo, una Edge Function cron analiza las sesiones de la semana del usuario y genera un reporte de progreso.

**Output del Weekly Report:**
```md
---
date: 2026-05-18
type: weekly_report
week: 2026-W20
---

# Weekly Report — 12 al 18 de mayo

## Resumen
- 🕐 35 min de práctica (↑ 8 min vs semana anterior)
- 💬 6 sesiones completadas
- 🔴 12 errores · 🟡 18 advertencias · 🔵 9 mejoras

## Errores recurrentes
- "make vs do" — 4 ocurrencias en 3 sesiones
- "I have fear" en vez de "I'm afraid" — 3 ocurrencias

## Mejoras detectadas
- Uso de "run into" aumentó 60% vs semana anterior
- Tiempo promedio de respuesta por turno bajó 0.4s

## Top 3 expresiones practicadas
1. `speak up` (SRS × 5)
2. `pay off` (usado en contexto × 3)
3. `free up` (deep-dive × 1)
```

**Implementación:**
- Edge Function cron (`weekly-report`) se ejecuta cada domingo a las 23:00 UTC.
- Llama al LLM con el resumen de sesiones de la semana (sacado de `session_analytics` / `tracked_items` / `sessions`).
- Pushea el Markdown al repo de GitHub del usuario (mismo pipeline Obsidian, mismo fallback PR).
- También disponible en la pantalla "Stats" de la app (acceso desde ajustes).
