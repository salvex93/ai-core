---
name: cross-model-verifier
description: Verificacion ciega de diffs con un proveedor de IA distinto al que genero el cambio, para detectar regresiones que el mismo modelo actor no detecta sobre si mismo. Complementa code-reviewer (que corre con el mismo Claude que audita) y subagent-review.js (patrones textuales, sin llamada a otro proveedor). Se activa automaticamente via el hook SubagentStop cuando code-reviewer emite veredicto APROBADO — no requiere invocacion manual. Activa al revisar el mecanismo de verificacion cross-model, al diagnosticar por que un fix rompio algo ya validado, o al configurar proveedores adicionales (OPENAI_API_KEY, DEEPSEEK_API_KEY) en .env.
origin: ai-core
version: 1.0.0
last_updated: 2026-07-10
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
