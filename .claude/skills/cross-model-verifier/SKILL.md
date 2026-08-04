---
name: cross-model-verifier
description: Verificacion ciega de diffs con un proveedor de IA distinto al que genero el cambio, para detectar regresiones que el mismo modelo actor no detecta sobre si mismo. Complementa code-reviewer (que corre con el mismo Claude que audita) y subagent-review.js (patrones textuales, sin llamada a otro proveedor). Se activa automaticamente via el hook SubagentStop cuando code-reviewer emite veredicto APROBADO — no requiere invocacion manual. Activa al revisar el mecanismo de verificacion cross-model, al diagnosticar por que un fix rompio algo ya validado, o al configurar proveedores adicionales (OPENAI_API_KEY, DEEPSEEK_API_KEY) en .env.
origin: ai-core
version: 1.0.0
last_updated: 2026-08-04
rol: auditor
---

# Cross-Model Verifier — Segunda Opinion Ciega

Implementa el patron "Writer/Reviewer" recomendado por Anthropic (code.claude.com/docs/en/best-practices): un revisor en contexto fresco, ciego al razonamiento del actor, evalua si el diff cumple la tarea sin romper nada fuera de su alcance. Motivado por el hallazgo de que verificar con el mismo modelo que genero el cambio detecta solo el 9.6% de errores self-consistentes (arXiv 2505.17656) — se requiere proveedor distinto.

Origen: investigacion de estandares de mercado 2026 sobre regresiones silenciosas (ver `docs/OPUSPLAN-cross-model-verifier.md`).

Complementos: `code-reviewer` (agente que produce el veredicto inicial), `subagent-review.js` (hook SubagentStop existente, analisis de patrones textuales sin proveedor externo).

---

## Cuando Activar Este Perfil

- Automaticamente: el hook `SubagentStop` dispara `cross-verify-gate.js` cuando el subagente que termina es `code-reviewer` con veredicto `APROBADO`.
- Manualmente: cuando el usuario pide una segunda opinion explicita sobre un fix ya aplicado.
- Al diagnosticar por que una auditoria previa no detecto una regresion — revisar si el gate estaba activo (proveedor configurado) en ese momento.
- Al configurar `OPENAI_API_KEY` o `DEEPSEEK_API_KEY` en `.env` por primera vez — verificar que `ModelRegistry.listProviders()` los detecta.

## Cuando NO Activar Este Perfil

- El veredicto de `code-reviewer` ya es `REQUIERE_CAMBIOS` o `BLOQUEADO` — no hace falta segunda opinion, ya hay hallazgos que resolver.
- No hay ningun proveedor distinto de Anthropic configurado en `.env` — el gate se omite automaticamente sin bloquear la sesion (no es requisito duro).
- El cambio no toca codigo existente (archivo nuevo sin dependencias) — el riesgo de regresion es minimo.
- Se esta iterando dentro de la misma tarea sin haber llegado a un veredicto `APROBADO` todavia.

## Primera Accion al Activar

**Activacion automatica (hook):** ninguna accion manual — `cross-verify-gate.js` ya se ejecuto al terminar el subagente `code-reviewer` y su resultado esta en el output del hook `SubagentStop`. Leer ese output antes de dar el veredicto por definitivo.

**Activacion manual (diagnostico o segunda opinion explicita):**

```bash
node .claude/bin/cross-verify-gate.js
```

Si retorna exit 0 sin mensaje `[cross-verify] omitido`, la verificacion corrio. Si el mensaje indica proveedor omitido, configurar `OPENAI_API_KEY` o `DEEPSEEK_API_KEY` en `.env` primero.

## Mecanismo

```bash
# Diagnostico manual — replica lo que hace el hook automaticamente
node -e "
const { verificar } = require('./scripts/services/CrossVerifier.js');
verificar({
  diff: require('child_process').execSync('git diff main...HEAD', {encoding:'utf8'}),
  tarea: 'descripcion de la tarea original',
  proveedorActor: 'anthropic',
}).then(r => console.log(JSON.stringify(r, null, 2)));
"
```

`CrossVerifier.seleccionarVerificador()` elige el primer proveedor disponible de `['deepseek', 'openai', 'gemini']` que sea distinto al proveedor que genero el cambio. Si no hay ninguno disponible, lanza error explicito — nunca cae de vuelta al mismo proveedor del actor.

El verificador recibe SOLO el diff y la tarea original — nunca el razonamiento, plan o chain-of-thought de quien hizo el cambio (grading ciego).

## Directiva de Interrupcion

Si `cross-verify-gate.js` retorna `pass: false` sobre un veredicto que `code-reviewer` habia marcado `APROBADO`:

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

El veredicto `APROBADO` original queda revertido a `REQUIERE_CAMBIOS` con los hallazgos del verificador anexados. Detener y presentar los hallazgos al operador antes de dar el cambio por cerrado.

---

## Restricciones del Perfil

> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables.

- Nunca usar el mismo proveedor que genero el cambio como verificador — falla explicito en vez de degradar silenciosamente a autoverificacion.
- El verificador no recibe el razonamiento del actor, solo diff + tarea — mantener el grading ciego.
- Si el output del verificador no es JSON parseable, `CrossVerifier.parsearVeredicto()` falla cerrado (`pass: false`) — nunca asumir exito ante una respuesta ambigua.
- El gate es best-effort: si no hay proveedor configurado, se omite sin bloquear la sesion ni el commit.

---

## Modulo — Vigencia Real de la Verificacion Cruzada

### Principio fundamental

Una verificacion cruzada que corre pero llama al mismo proveedor bajo un alias, o que degrada silenciosamente a un solo verificador cuando el operador cree que hay dos votando, no cumple el objetivo. El listón es que cada veredicto sea trazable a un proveedor real y distinto del actor, con la selección y el resultado del desempate auditables en el output — no una llamada a `ModelRegistry.chat()` con la ilusión de independencia.

### Identidad de verificacion — declarar antes de invocar el gate

Igual que el Modulo 2 de `tech-lead-frontend` exige una `IDENTIDAD:` visual antes de escribir CSS, ningun gate de verificacion cruzada se invoca sin declarar primero:

```
IDENTIDAD DE VERIFICACION:
  Proveedor actor: [anthropic | openai | gemini | deepseek]
  Verificador esperado: [primer proveedor distinto disponible segun PROVEEDORES_VERIFICADOR, o nombre explicito si se fuerza uno]
  Modo: [verificar() single-pass | resolverConDesempate() 2-de-3 solo si la herramienta esta en TAREAS_CRITICAS_CON_DESEMPATE]
  Umbral de confianza: [una linea — ej. "fix de bug aislado, single-pass basta" | "cambio de arquitectura multi-modulo, exige desempate 2-de-3"]
```

Si `.env` no tiene un segundo proveedor configurado (`OPENAI_API_KEY` o `DEEPSEEK_API_KEY`), la identidad debe declararlo explicito como `Verificador esperado: ninguno — gate se omite` en vez de asumir que la verificacion corrio.

### Prohibido — patrones reconocibles de verificacion de plantilla

- Verificador seleccionado sin comparar contra `proveedorActor` (el bug de "verificarme a mi mismo" que el propio `seleccionarVerificador()` ya bloquea en codigo, pero que un prompt manual mal escrito puede reintroducir al invocar `ModelRegistry.chat()` directo).
- Tratar un `pass: false` no parseable como aprobacion por defecto — `parsearVeredicto()` ya falla cerrado; ningun wrapper nuevo debe revertir eso a `pass: true` ante ambiguedad.
- Pasarle al verificador el razonamiento, plan o chain-of-thought del actor junto con el diff — rompe el grading ciego que es la razon de ser del patron Writer/Reviewer.
- Activar `resolverConDesempate()` en tareas que no estan en `TAREAS_CRITICAS_CON_DESEMPATE` — cuadruplica costo sin beneficio medible en el 90% de cambios simples.
- Reportar "verificacion cruzada" cuando el unico proveedor disponible es el mismo que genero el cambio — el gate debe fallar explicito (ver `seleccionarVerificador()`), nunca degradar en silencio a autoverificacion disfrazada de segunda opinion.
- Ignorar el resultado del hook `SubagentStop` (`cross-verify-gate.js`) y declarar un fix cerrado solo porque `code-reviewer` dijo `APROBADO` — el veredicto no es definitivo hasta leer el output del gate.

### Gate de calidad medible

| Metrica | Umbral | Verificacion |
|---|---|---|
| Independencia de proveedor | Verificador != proveedorActor en el 100% de las llamadas | Inspeccionar el campo `proveedor` del retorno de `verificar()`/`resolverConDesempate()` contra el `proveedorActor` pasado |
| Tasa de fallo cerrado ante output ambiguo | `parsearVeredicto()` retorna `pass: false` en el 100% de respuestas no-JSON del verificador | Test unitario con input corrupto/truncado, assert `pass === false` |
| Cobertura de desempate en tareas criticas | `resolverConDesempate()` invoca un segundo proveedor en el 100% de los casos donde el primer verificador retorna `pass: false` sobre una tarea de `TAREAS_CRITICAS_CON_DESEMPATE` | Revisar `votos` en el retorno — debe listar 2 proveedores, no 1, cuando `desempate: true` |
| Omision explicita vs silenciosa | El gate imprime el mensaje `[cross-verify] omitido` cuando no hay segundo proveedor, en el 100% de esos casos | `node .claude/bin/cross-verify-gate.js` con `.env` sin `OPENAI_API_KEY`/`DEEPSEEK_API_KEY`, grep del mensaje en stdout |
| Latencia del gate sobre el flujo de commit | Gate manual completa en < 30s para un diff tipico (< 500 lineas) | Cronometrar `node .claude/bin/cross-verify-gate.js` con `time` o equivalente |

### Vigencia — estandar mas reciente del dominio

El hallazgo citado en este skill (arXiv 2505.17656, "Too Consistent to Detect: A Study of Self-Consistent Errors in LLMs") se reverifico contra el PDF fuente en `arxiv.org/pdf/2505.17656` en esta tarea: el paper confirma que los detectores basados en consistencia caen a AUROC <= 0.5 (peor que azar) sobre errores self-consistentes, y propone un "cross-model probe" que fusiona evidencia de un verificador externo — el mismo mecanismo que implementa `CrossVerifier.js`. Fuente primaria confirmada, dato vigente.

Se verifico ademas contra `code.claude.com/docs/en/code-review` (dominio oficial Anthropic) que Code Review nativo de Claude Code (research preview, planes Team/Enterprise) ya despliega una flota de agentes en paralelo con un paso de verificacion que descarta falsos positivos antes de publicar hallazgos. La documentacion oficial confirma multi-agente y un paso de verificacion contra el comportamiento real del codigo, pero no confirma explicitamente que el verificador use un proveedor de IA distinto de Anthropic (cross-provider) — es multi-agente dentro de la infraestructura de Anthropic, no necesariamente cross-model en el sentido que exige este skill. Tratar este dato como orientativo respecto a si Code Review nativo reemplaza la necesidad de `CrossVerifier.js`: no verificado que sea equivalente, no asumir sustitucion sin confirmar el detalle con el proveedor.

Antes de citar un nuevo pricing, limite o capacidad de `OPENAI_API_KEY`/`DEEPSEEK_API_KEY` como verificador en este modulo, confirmar contra la documentacion oficial de cada proveedor (`platform.openai.com`, `api-docs.deepseek.com`) en el momento del cambio — no interpolar por analogia con los valores ya vigentes en `ModelRegistry.js`.
