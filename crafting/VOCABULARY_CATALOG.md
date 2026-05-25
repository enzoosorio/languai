# VOCABULARY_CATALOG — Catálogo personal de palabras y expresiones

Pantalla browsable con todas las palabras y expresiones que el usuario **ha aprendido o adoptado conscientemente** durante el uso de la app. Distinta de `tracked_items` (que son cosas que se usan mal) y distinta del SRS (que es práctica activa de items débiles).

> **Analogía:** si `tracked_items` es "lo que estoy aprendiendo a usar bien" y el SRS es "el gimnasio donde lo entreno", el Vocabulary Catalog es **el armario de trofeos / mi diccionario personal** — lo que ya considero parte de mi vocabulario activo o que quiero adoptar.

---

## 1. Modelo conceptual: catálogo vs tracked_items vs SRS

| | tracked_items | vocabulary_catalog |
|---|---|---|
| **Qué guarda** | Palabras/expresiones mal usadas o no usadas cuando tocaba | Palabras/expresiones que el usuario *conoce* y quiere tener registradas |
| **Cómo entra** | Auto desde feedback de sesión (error/warning) | Tres rutas: promoción desde tracked_items, sugerencia post-sesión, adición manual (ver §3) |
| **Tiene `weight`** | Sí, mutable. Sube con errores, baja con usos correctos | No. Es una entrada permanente |
| **Aparece en SRS** | Sí, hasta dominarlo (`weight ≤ 0` + retención 14d) | No (es referencia, no entrenamiento) |
| **Se puede borrar** | Se archiva automáticamente al cumplir criterios | Permanente; el usuario puede ocultarla manualmente, no borrarla |
| **Si vuelvo a fallar** | Subiría `weight` y se reactiva en SRS | Se crea un *nuevo* `tracked_item` para esa palabra; la entrada en catálogo se mantiene |

**Regla de oro:** una vez que algo entra al catálogo, queda en el catálogo. El catálogo refleja el **vocabulario activo del usuario en el tiempo**, no su rendimiento actual. Los errores futuros sobre una palabra del catálogo se trackean por separado (via `tracked_items`) sin tocar la entrada del catálogo.

---

## 2. Esquema (alto nivel)

Tabla nueva: `vocabulary_catalog`. Detalle SQL final en ARCHITECTURE.md cuando se apruebe.

```sql
CREATE TABLE vocabulary_catalog (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  expression text NOT NULL,                  -- forma textual canónica ("show up", "hence")
  lemma text NOT NULL,                       -- normalizado ("show_up", "hence")
  language text NOT NULL DEFAULT 'en',
  cefr_level text,                           -- A2 | B1 | B2 | C1 (estimado por LLM o curado)
  category text,                             -- phrasal_verb | word | collocation | idiom
  source text NOT NULL,                      -- 'promoted_from_tracked' | 'post_session_suggestion' | 'manual_tap' | 'guided_mastered'
  source_session_id uuid REFERENCES sessions(id),  -- sesión donde se aprendió/aceptó (si aplica)
  source_tracked_item_id uuid,               -- si vino por promoción
  definition text,                           -- generada por LLM al ingresar
  example text,                              -- generado por LLM al ingresar
  user_note text,                            -- nota libre del usuario (opcional)
  tags text[],                               -- ['daily', 'work', 'social']
  added_at timestamptz DEFAULT now(),
  last_seen_at timestamptz,                  -- última sesión donde apareció (usada o detectada)
  times_used_after_catalog int DEFAULT 0,    -- cuántas veces la usaste tras agregarla
  hidden bool DEFAULT false,                 -- el usuario la oculta de la vista principal sin borrarla
  UNIQUE (user_id, lemma, language)          -- una entrada por lemma por idioma
);
```

RLS estándar: solo el dueño ve sus filas.

---

## 3. Rutas de ingreso

### 3.1 Promoción automática desde `tracked_items` (graduación)

Reemplaza la lógica actual de "archivar" descrita en [FEEDBACK.md §Graduación](crafting/FEEDBACK.md). Cuando un `tracked_item` cumple:

- `weight ≤ 0`
- `srs_state.interval ≥ 14` días

…la app muestra la sugerencia suave:
> *"Parece que ya dominas 'run into' — ¿agregarlo a tu catálogo?"*
> [**Agregar al catálogo**] [Seguir practicando]

Al agregar:
- Se crea fila en `vocabulary_catalog` con `source = 'promoted_from_tracked'`, `source_tracked_item_id = <id>`.
- El `tracked_item` original se marca `archived = true`.
- LLM completa `definition` y `example` en background si no están cacheados.

Si después el usuario vuelve a fallar con esa palabra en sesiones futuras: la pipeline de feedback detecta que ya existe en catálogo y crea un **nuevo** `tracked_item` para el error fresco (no reactiva el viejo). El catálogo queda intacto. En la UI del catálogo se muestra un badge sutil "⚠ activo en práctica" para indicar que tiene tracked_item asociado abierto, pero la entrada en sí no cambia.

### 3.2 Sugerencia post-sesión (ruta principal para palabras nuevas)

Al final de cada sesión, junto al FeedbackScreen, aparece una sección **"New for your catalog"**:

```
🌱 New for your catalog
   La IA usó algunas expresiones B2+ que quizá quieras guardar:

   [ + ]  hence              "Therefore / for that reason"
   [ + ]  pull off            "To successfully achieve something difficult"
   [ + ]  in hindsight        "Looking back / in retrospect"
   [ + ]  spell out           "Explain very clearly / make explicit"

   [ Agregar seleccionados ]   [ Saltar ]
```

**Cómo se generan los candidatos:**
- La Edge Function `generate-feedback` recibe la transcripción completa.
- Adicionalmente, pide al LLM una lista de palabras/expresiones que **la IA dijo** (no el usuario) y que tienen `cefr_level >= B2` **y** que el usuario no tiene aún en su catálogo (cross-check rápido).
- Devuelve ≤ 5 candidatos por sesión. Si no hay candidatos relevantes, la sección no aparece.

**Importante:** las palabras que el usuario *dijo correctamente* pero son nuevas también pueden aparecer (con badge distinto: "usaste esto por primera vez ✨"). Pero la prioridad son las dichas por la IA — esas son input pasivo que conviene activar.

El usuario marca cuáles aceptar y tap "Agregar seleccionados". Cero entran si no acepta.

### 3.3 Adición manual (tap en cualquier palabra del feedback)

Desde la transcripción del FeedbackScreen o desde el deep-dive, **long-press en cualquier palabra/span** de la IA o del usuario → menú flotante:

```
   [ Add to catalog ]
   [ Mark as known ]
   [ Open deep-dive ]
```

Es el escape hatch para palabras que el LLM no sugirió pero el usuario sí quiere recordar. Se crea entrada con `source = 'manual_tap'`.

### 3.4 Promoción desde Guided Practice

Cuando en una sesión `mode='guided'` el usuario usa correctamente una expresión del corpus B2 **3 veces o más en distintas sesiones** sin disparar tracked_items, se sugiere agregarla al catálogo con `source = 'guided_mastered'`. Misma UI suave que §3.1.

---

## 4. Filtros anti-ruido

Para evitar que el catálogo se llene con basura (palabras súper básicas, vocabulario que el usuario obviamente ya conoce):

- **CEFR floor configurable** en `user_settings.catalog_min_level` (default `B1` para EN; `A1` para DE). Cualquier sugerencia automática por debajo se descarta antes de llegar al usuario.
- **Whitelist por defecto bloqueada:** stopwords + las 1000 palabras más frecuentes del idioma nunca se auto-sugieren. Solo entran via §3.3 (manual).
- **Suppression list por usuario:** si el usuario rechaza una sugerencia 2 veces (`[Saltar]`), esa palabra no se vuelve a sugerir automáticamente en 30 días.

---

## 5. UI — Pantalla Catálogo

Acceso: nueva tab/sección desde el área SRS (junto a SRS y Shadow Reading) o desde menú secundario. Ver [UX_UI.md](crafting/UX_UI.md) para layout exacto.

```
┌─────────────────────────────────────────────────┐
│  🗂  Vocabulary Catalog              [⚙ filter] │
│                                                  │
│  78 entries · 12 added this week                │
│                                                  │
│  [ All ] [ Phrasal ] [ Words ] [ Idioms ]       │
│  [ Recently added ▼ ]                           │
│                                                  │
│  ┌───────────────────────────────────────────┐  │
│  │ show up                          B2 · ✨   │  │
│  │ "To arrive at a place; appear"            │  │
│  │ Used 3 times · added 6 days ago           │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │ hence                            B2  ⚠    │  │
│  │ "Therefore / for that reason"             │  │
│  │ Added today · active in practice          │  │
│  └───────────────────────────────────────────┘  │
│  ...                                            │
└─────────────────────────────────────────────────┘
```

Cada card:
- **Tap** → drawer con definición completa, ejemplos, sesiones donde apareció, botón "Open deep-dive" (reutiliza pipeline existente de [FEEDBACK.md §Deep-dive](crafting/FEEDBACK.md)) y campo `user_note`.
- **Swipe izquierdo** → ocultar (`hidden = true`).
- **Long-press** → menú: editar nota, copiar, compartir.

Badges:
- `✨` usada al menos una vez después de agregarla
- `⚠` tiene tracked_item activo (volviste a fallar con ella)
- `🎯` promovida desde tracked_items (graduada)
- `🌱` agregada por sugerencia post-sesión
- `✋` agregada manualmente

**Búsqueda:** input simple por texto sobre `expression` y `definition`.

**Vista "Hidden":** sección colapsable abajo para ver/desocultar.

---

## 6. Cross-referencias con otros sistemas

| Sistema | Cómo interactúa |
|---|---|
| **SRS** ([FEEDBACK.md](crafting/FEEDBACK.md)) | El catálogo NO entra al SRS por defecto. Pero el usuario puede tappear "Practice this" en una entrada del catálogo → genera mini-drill puntual (no recurrente). |
| **Guided Practice** ([GUIDED_PRACTICE.md](crafting/GUIDED_PRACTICE.md)) | Entradas del catálogo con tag B2 pueden aparecer como slot "contextual" en los chips de guided mode. Y al revés: expresiones del corpus B2 que el usuario domina via guided se promueven al catálogo. |
| **Nudge implícito al LLM** | Entradas del catálogo no se nudgean al LLM (ya las domina). Solo tracked_items activos entran al nudge. |
| **Memory / Obsidian export** ([MEMORY_SYSTEM.md](crafting/MEMORY_SYSTEM.md)) | El export semanal incluye sección "📚 New vocabulary this week" con las entradas agregadas en los últimos 7 días, en formato markdown con backlinks por tag. |
| **YouTube Video Context** | Cuando se analiza un video, las palabras B2+ extraídas del transcript pueden ofrecerse como candidatas al catálogo igual que en §3.2. |

---

## 7. Costos

- **Definición + ejemplo por entrada:** ~300 tokens LLM, una vez. Cacheado por `(language, lemma)` globalmente en una tabla `vocabulary_definitions_cache` para no regenerar lo mismo entre usuarios.
- **Sugerencia post-sesión:** ya se aprovecha la llamada de `generate-feedback`; ~100 tokens extra en el prompt.
- Total estimado: < $0.05/mes adicional. Ver [COSTS.md](crafting/COSTS.md) para actualizar.

---

## 8. Decisiones resueltas

| Tema | Decisión |
|---|---|
| **CEFR floor del usuario** | Se toma del **onboarding** (que ya pregunta nivel por idioma). El nivel declarado se almacena en `user_settings.languages_config` y `catalog_min_level` se deriva: 1 nivel por debajo del declarado (ej. usuario B2 → floor B1 — palabras A1/A2 no se auto-sugieren). El usuario puede ajustarlo manualmente desde settings. **No se infiere** (poca precisión y mala UX). |
| **Multi-idioma** | Confirmado el `UNIQUE(user_id, lemma, language)`. La UI filtra siempre por idioma activo (selector global del Home). Cambiar de idioma muestra otro catálogo. Aplica también para futuros pares (ES/EN, ES/DE, etc.). |
| **Exportar catálogo** | Dos formatos soportados: **Markdown** (un archivo `.md` por entrada o un único `vocabulary.md` con headings — alineado con el export a Obsidian de [MEMORY_SYSTEM.md](crafting/MEMORY_SYSTEM.md)) y **JSON** (dump completo con todos los campos incluyendo metadata). Anki package queda fuera del MVP. |
| **Editar definición autogenerada** | **No editable.** Evita drift de la base de conocimiento generada por LLM. El usuario solo edita `user_note` (texto libre) — pensado para añadir contexto personal ("la usé con Sofía en la conversación de junio"), mnemotécnicas, ejemplos propios. |
| **Conflict resolution con tracked_items activos** | Si una palabra está en `tracked_items` con `archived = false` (sin importar el weight), las sugerencias automáticas del catálogo para ese lemma se **suprimen**. Razón: si todavía está en práctica, no debe presentarse como "ya dominada". La promoción al catálogo es **siempre downstream** de la graduación SRS. La única excepción es §3.3 (adición manual): el usuario puede forzarlo si quiere, pero la UI muestra warning: *"Esta palabra todavía está activa en tu práctica — ¿agregar de todos modos?"*. |
| **Stats / insights de progreso de vocabulario** | **Parte de la sección Analytics general** (no vive en el catálogo). Incluye: gráfica de entradas/semana por CEFR level, conteo total por categoría, **calendario heatmap** estilo GitHub mostrando qué días se practicaron qué palabras (cruza `vocabulary_catalog.last_seen_at` con sesiones). Spec a desarrollar cuando se diseñe la pantalla Analytics. |

## 9. Open issues

- [ ] **Diseño concreto de la sección Analytics** que aloje los stats del catálogo, las métricas de [GUIDED_PRACTICE.md §13](crafting/GUIDED_PRACTICE.md), el calendario heatmap y la futura señal de subida de nivel CEFR. No bloqueante para el MVP del catálogo en sí.
- [ ] **Unificación de la pantalla "Vocabulary Hub"** con tabs `[ Catálogo ]` y `[ Tracked items / En práctica ]` (decisión tomada en [GUIDED_PRACTICE.md §7.2](crafting/GUIDED_PRACTICE.md)). Requiere mover la UI actual de SRS / tracked items y consolidar — definir layout final en [UX_UI.md](crafting/UX_UI.md).
