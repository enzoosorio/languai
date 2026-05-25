# GUIDED_PRACTICE — Tercer modo conversacional

Modo de conversación **voz↔voz con frases sugeridas dinámicamente**. Coexiste con Free Chat y Roleplay como tercer modo principal. Diseñado para forzar la producción activa de expresiones y palabras B2 que el usuario reconoce pasivamente pero no produce ("show up", "fall behind", "hence", "glance", etc.).

> **Por qué un modo aparte y no una opción dentro de Free Chat:** en conversación libre el usuario no debe estar atado a chips que rompan el flujo. Guided Practice declara explícitamente "vengo a forzarme a usar X", y la UI/UX se diseña en torno a esa intención. Roleplay tampoco encaja: roleplay es inmersión narrativa y los chips romperían el personaje.

---

## 1. Mecánica básica

```
[user habla libre]  →  [IA responde]  →  [App muestra 4 chips de expresión/palabra]
                                              │
                                  ┌───────────┴───────────┐
                                  │                       │
                       [usuario tap chip → ve hint]   [usuario habla]
                                  │                       │
                                  └───────────┬───────────┘
                                              ▼
                          [STT detecta si usó alguno de los 4 chips]
                                              │
                          ┌───────────────────┴───────────────────┐
                          │                                       │
                  [usó uno] ✓                            [no usó ninguno]
                          │                                       │
                          ▼                                       ▼
                  [conversa normal]                  [IA hace re-prompt suave]
                                                                  │
                                                       ┌──────────┴──────────┐
                                                       │                     │
                                                [reformula con chip]  [sigue sin usar]
                                                       │                     │
                                                       ▼                     ▼
                                                [conversa normal]     [marca skip y sigue]
```

**Regla clave:** los chips no aparecen en cada turno. El LLM decide cuándo el contexto lo amerita (ver §3).

---

## 2. Fuente de los 4 chips (modelo híbrido)

Cada vez que el LLM decide emitir chips, la composición típica es:

| Slot | Origen | Por qué |
|---|---|---|
| 1-2 | `tracked_items` del usuario con `weight` alto y `srs_state.due_at` próximo | Refuerza puntos débiles personales en contexto real, no en flashcard descontextualizada |
| 1 | **Corpus B2 curado** (`b2_expressions_corpus` — ver §6) | Expresiones útiles del día a día que el usuario aún no falló (no están en tracked_items) — ej. "show up", "look forward to", "hence" |
| 1 | Generada por LLM al vuelo según contexto de los últimos 2-3 turnos | Mantiene relevancia conversacional; evita chips que no encajan |

La Edge Function `guided-chips` arma el prompt al LLM con:
- Últimos N turnos de la conversación
- Los 1-2 tracked items elegidos
- 5-10 candidatos del corpus B2 filtrados por tag temático de la sesión (si hay tags)
- Instrucción: "elige las 4 expresiones que mejor encajen como continuación natural del usuario y devuélvelas con un hint contextual cada una"

**Output esperado:**
```json
{
  "should_emit_chips": true,
  "chips": [
    {
      "expression": "show up",
      "source": "b2_corpus",
      "hint_short": "to arrive / appear at a place",
      "hint_example": "He didn't show up to the meeting yesterday."
    },
    {
      "expression": "fall behind",
      "source": "tracked_item",
      "tracked_item_id": "uuid",
      "hint_short": "to fail to keep pace with",
      "hint_example": "I fell behind on my workout routine this month."
    },
    { ... },
    { ... }
  ],
  "skip_reason": null
}
```

Si `should_emit_chips: false`, la app sigue al modo libre por ese turno (ver §3).

---

## 3. Cuándo se activan los chips (LLM decide)

El LLM evalúa cada turno de la IA con estos criterios para decidir emitir chips o saltar:

| Situación | Emitir chips |
|---|---|
| Saludo inicial, despedidas, confirmaciones cortas ("ok", "cool", "I see") | ❌ No |
| Usuario hace pregunta muy específica que solo admite respuesta concreta (números, fechas) | ❌ No |
| IA hace pregunta abierta donde caben múltiples expresiones | ✅ Sí |
| IA introduce un tema/escenario nuevo dentro de la conversación | ✅ Sí |
| Conversación con flujo establecido y turno permite producir frase compleja | ✅ Sí |

**Hardcoded fallback:** los primeros 2 turnos de cada sesión nunca tienen chips (warm-up forzado), aunque el LLM diga `should_emit_chips: true`. Esto es para evitar saturar el saludo.

**Frecuencia objetivo:** ~60-70% de los turnos de la IA emiten chips. El resto son libres. La app puede mostrar al final de la sesión: *"Te ofrecimos chips en 12 de 18 turnos, usaste alguno en 9."*

---

## 4. Interacción con un chip

- **Tap corto en chip** → tooltip con `hint_short`.
- **Tap largo en chip** → modal flotante con `hint_example` + 1-2 ejemplos extra generados por LLM bajo demanda (con cache por chip+sesión para no llamar al LLM dos veces).
- **Speaker icon en el modal** → TTS del ejemplo (reutiliza pipeline TTS existente).

Los chips se renderizan con el mismo componente que los `Pill` ya existentes en el Home / sugerencias de roleplay — **no crear componente nuevo**. Solo variante visual: chips de guided practice llevan un mini-badge superior con el `source` (🎯 SRS, ✨ B2, 🌱 contextual) para que el usuario sepa por qué se lo proponen.

---

## 5. Detección de uso y re-prompt suave

Tras el turno del usuario, STT devuelve el texto. La app hace **fuzzy match** contra las 4 expresiones de chips activas (Levenshtein con normalización por lemma, no exact match — "shown up" debe contar como "show up").

| Resultado | Acción |
|---|---|
| Match ≥ 0.8 con uno de los chips | Marca turno como `constraint_satisfied`, IA responde normal |
| Match < 0.8 con todos | IA responde + añade frase suave invitando a reformular: *"Nice — could you try saying that using one of these?"* La UI vuelve a destacar los 4 chips originales sin pedirlos de nuevo al backend. |

El re-prompt es **opcional para el usuario**: si decide ignorar y seguir hablando, el siguiente turno fluye normal. Solo se marca `constraint_skipped` en `session_turns` para métricas.

**No hay enforcement duro.** El usuario nunca se queda bloqueado.

**Edge case:** si la IA emite chips dos turnos seguidos y el usuario los ignora dos veces seguidas, la app pausa los chips por 2 turnos (cooldown) — evita sensación de acoso.

---

## 6. Corpus B2 curado

Tabla nueva: `b2_expressions_corpus`. Curada manualmente, semilla inicial ~150 expresiones (phrasal verbs + palabras "rare-but-useful" + colocaciones comunes B2). Ejemplos:

| expression | category | tags | difficulty |
|---|---|---|---|
| show up | phrasal_verb | daily, social | B2 |
| fall behind | phrasal_verb | work, study | B2 |
| hence | conjunction | formal, academic | B2 |
| glance at | phrasal_verb | daily, observation | B2 |
| keep up with | phrasal_verb | daily, social, work | B2 |
| pull off | phrasal_verb | achievement | B2 |
| make up for | phrasal_verb | apology, work | B2 |

**Esta tabla es global, no por usuario.** Los usuarios consumen del mismo corpus.

Por usuario se trackea en una tabla auxiliar `user_corpus_exposure`:
- `user_id`, `corpus_id`, `times_offered`, `times_used`, `last_offered_at`
- Permite priorizar al armar chips: "no le ofrezcas otra vez 'show up' si ya lo usó 3 veces correctamente esta semana"

**Mantenimiento:** el corpus se versionea como migración SQL. Crecimiento esperado: +20-30 expresiones cada vez que se identifique una categoría débil.

---

## 7. Selección desde el Home

**La navegación principal sigue siendo por swipe horizontal entre 3 vistas** (ver [UX_UI.md](UX_UI.md)). No se rompe ese paradigma. Los tres modos conversacionales (Free / Roleplay / Guided) viven **dentro del Home como selector compacto**, no como tres pantallas separadas.

### 7.1 Layout del Home (selector compacto)

El Home mantiene su diseño minimalista actual con un selector de modo discreto arriba del botón principal:

```
              ┌─────────────────────────┐
              │  [Free] [Roleplay] [🎯] │   ← pill selector pequeño, scrollable si crece
              └─────────────────────────┘

                       ●  ●  ●
                        TAP TO
                        SPEAK            ← botón principal (mismo, cambia su sub-label
                                            según modo seleccionado)
                       ○  ○  ○

                  "Guided practice ·
                   chips after the warm-up"     ← sub-label dinámico
```

El selector son chips/pills usando el componente existente. El modo activo se resalta. Tap cambia el modo sin entrar a otra pantalla.

**Ventaja:** mismo espacio, mismo aire, solo añade 1 componente arriba. No se ocupa el área inferior.

**Modo Guided seleccionado:** antes del primer turno se muestra un mini-config bottom-sheet de una sola vez (no modal grande):
- Foco: `[ Mis errores ] [ Vocabulario B2 ] [ Mixto ]`
- Duración soft-target: 5 / 10 min
- (Tema lo decide el usuario al hablar — no se pregunta upfront)

Roleplay sigue abriendo su flujo de selección de escenario, idéntico al actual.

### 7.2 Vistas laterales (swipe izquierda/derecha)

| Posición | Vista actual | Vista propuesta |
|---|---|---|
| Swipe derecho | Home | **Home** (sin cambios — sigue conteniendo los 3 modos vía selector) |
| Swipe izquierda → | SRS Flashcards | **SRS Flashcards** (sin cambios) |
| Swipe derecha ← | Roleplay (pantalla dedicada) | **Vocabulary Hub** — pantalla con tabs internas: `[ Catálogo ]` y `[ Tracked items / En práctica ]` |

La vista izquierda libera el espacio que ocupaba Roleplay (ahora integrado en Home) y se convierte en el **Vocabulary Hub**: una sola pantalla con dos tabs internas porque, como notaste, ambas son "palabras/expresiones" — solo cambia su estado (en práctica vs dominadas). Cross-link directo: tap en un tracked item dominado ofrece promoverlo al catálogo en línea. Detalle en [VOCABULARY_CATALOG.md §5](crafting/VOCABULARY_CATALOG.md) (UI a unificar con tracked items en una iteración posterior).

> Analíticas e Historial de conversaciones son secciones separadas accesibles desde menú secundario o desde el FeedbackScreen — no consumen un slot de swipe principal. Decisión: priorizar acceso rápido al catálogo (uso frecuente) sobre analíticas (consulta esporádica).

---

## 8. Persistencia (esquema, alto nivel)

Cambios en schema (a detallar en ARCHITECTURE.md cuando se apruebe):

```sql
-- sessions
ALTER TABLE sessions ADD COLUMN mode text NOT NULL DEFAULT 'free'
  CHECK (mode IN ('free', 'roleplay', 'guided'));

-- session_turns
ALTER TABLE session_turns
  ADD COLUMN chips_offered jsonb,          -- array de las 4 expresiones ofrecidas
  ADD COLUMN chips_used text[],            -- las que matchearon (lemma)
  ADD COLUMN constraint_status text;       -- 'satisfied' | 'skipped' | 'no_chips'

-- nuevas tablas
CREATE TABLE b2_expressions_corpus (
  id uuid PRIMARY KEY,
  expression text NOT NULL,
  lemma text NOT NULL,
  category text,                            -- phrasal_verb | conjunction | collocation | adverb
  tags text[],                              -- ['daily', 'work', 'formal']
  difficulty text DEFAULT 'B2',
  example text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE user_corpus_exposure (
  user_id uuid REFERENCES auth.users(id),
  corpus_id uuid REFERENCES b2_expressions_corpus(id),
  times_offered int DEFAULT 0,
  times_used int DEFAULT 0,
  last_offered_at timestamptz,
  PRIMARY KEY (user_id, corpus_id)
);
```

RLS estándar (`user_corpus_exposure` solo el dueño; `b2_expressions_corpus` lectura pública para `authenticated`).

---

## 9. Feedback al final de una sesión guiada

El FeedbackScreen estándar (ver [FEEDBACK.md](crafting/FEEDBACK.md)) se enriquece con una **sección extra "Guided practice summary"** al tope:

```
🎯 Guided Practice — 18 turnos
   Chips ofrecidos:    12
   Usaste al menos 1:  9   (75%)

   Expresiones nuevas que practicaste:
   ✓ show up (×2)
   ✓ fall behind
   ✓ make up for
   ⚠ hence (te lo ofrecimos 2 veces, no lo usaste)
```

Los chips usados ✓ ejecutan automáticamente:
- `user_corpus_exposure.times_used += 1`
- Si la expresión venía de un `tracked_item`, decrementa su `weight` igual que un uso correcto registrado por el LLM en feedback regular.

---

## 10. Integración con Vocabulary Catalog

Las expresiones del corpus B2 que el usuario marca explícitamente como "ya la conozco / la uso bien" desde el FeedbackScreen, pasan al [VOCABULARY_CATALOG.md](crafting/VOCABULARY_CATALOG.md) con `source = 'guided_mastered'`.

Y al revés: si el usuario tiene una palabra en el catálogo con tag B2, puede aparecer como chip slot 3 (origen "catálogo personal") para reforzar su uso activo.

---

## 11. Costos (estimación)

- **Llamada extra al LLM por turno con chips:** ~150 tokens entrada (contexto + candidatos) + ~200 tokens salida (4 chips con hints) ≈ 0.0003 USD por turno con GPT-4o-mini.
- Asumiendo 12 turnos con chips por sesión y 30 sesiones/mes: ~$0.10/mes extra.
- Cabe sobrado en el plan Go de OpenCode. Ver [COSTS.md](crafting/COSTS.md) para actualizar tabla.

---

## 12. Decisiones resueltas

| Tema | Decisión |
|---|---|
| **Seed del corpus B2** | Origen: **Oxford Learner's Dictionary** (lista de phrasal verbs B2) + **Cambridge English** (colocaciones B2). Tamaño inicial: ~150 expresiones. Curación manual durante implementación de la fase Guided. Posible script de scraping puntual (no recurrente) para acelerar la primera carga. |
| **Orden de los chips** | **SRS primero por defecto** (tus tracked items con weight alto en slots 1-2, luego corpus B2, luego LLM contextual). Razón: latencia mínima y consistencia de UX. **Excepción:** si en producción se mide que el orden por relevancia contextual del LLM no añade > 200ms de latencia perceptible, se evalúa migrar a "LLM ordena". Decisión final post-medición. |
| **Animación de aparición de chips** | **Stagger one-by-one** (~80-100ms entre chips). Cada chip aparece con fade-in (`opacity 0 → 1`) + slide-up (`translateY: 12px → 0`). Easing `cubic-bezier(0.22, 1, 0.36, 1)` (out-expo). Reanimated 4 + alineado con principios de [ELASTIC_UI.md](crafting/ELASTIC_UI.md). Total de la entrada: ~400ms. |
| **Multi-idioma del corpus** | **Solo EN-B2 en MVP.** Cuando se sume DE A1/A2 (post-MVP), se crea `b2_expressions_corpus` particionado por `language` o se renombra a `expressions_corpus` con columna `language` (decidir en su momento). |

## 13. KPI de salud del modo (solo sesiones `mode = 'guided'`)

Métricas a registrar y mostrar en la sección de Analytics (no en Home):

| Métrica | Cómo se calcula | Target healthy |
|---|---|---|
| `chip_offer_rate` | turnos con chips / turnos totales de la sesión | 50-70% (señal de que el LLM emite cuando corresponde) |
| `chip_usage_rate` | turnos con `constraint_status='satisfied'` / turnos con chips | ≥ 50% rolling 7d |
| `chip_reformulation_rate` | reformulaciones aceptadas tras re-prompt / re-prompts emitidos | ≥ 30% (mide eficacia del re-prompt suave) |
| `new_expressions_practiced_per_session` | conteo de `b2_expressions_corpus` distintas usadas correctamente | ≥ 3 |
| `cooldown_triggers` | veces que se activó el cooldown de 2 turnos por ignorar chips | < 1 por sesión en promedio (si sube, el modo está saturando) |

**Alerta soft:** si `chip_usage_rate` cae < 30% durante 7 días, la app sugiere en Analytics: *"Parece que los chips no te están funcionando — ¿probamos ajustar el foco?"* con shortcut al config del modo.

## 14. Open issues

- [ ] **Detección automática de subida de nivel CEFR** (post-MVP) — analizar métricas históricas (vocabulario activo del catálogo, error rate, complejidad sintáctica) para advertir al usuario *"tu rendimiento es consistente con C1, considerá tomar un test oficial para confirmarlo"*. **HITL obligatorio:** la app nunca cambia el nivel sola, solo sugiere. Spec a definir junto con la sección de Analytics.
- [ ] **Validar empíricamente** el threshold del 80% de fuzzy match para detección de uso — puede necesitar ajuste por idioma.
