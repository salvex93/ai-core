# Diseno: gobernanza verificable

Estado: propuesta. Nada de esto esta implementado salvo el informe de sesion firmado (`docs/INFORME-SESION-FIRMADO.md`).

## Problema

El rendimiento de codigo esta empatado entre arneses (18/18 en vanilla y ai-core con Claude y con GPT). La unica diferencia medida es gobernanza. Dos debilidades de la evidencia actual:

1. Las tareas `benchmark/tasks/governance/gov-*` verifican reglas propias de ai-core (autor de commit exacto, palabras prohibidas). Un arnes sin esas reglas no puede cumplirlas; el resultado mezcla "no conocia la regla" con "no la hace cumplir".
2. El informe firmado prueba que los guards corrieron, no que la sesion cumplio una politica concreta.

## Parte 1: benchmark de cumplimiento abierto

**Politica explicita.** Un archivo `policy.json` declara las reglas (autor permitido, patrones de secretos, tope de lineas, terminos prohibidos en commits). Todo arnes recibe la misma politica por su mecanismo nativo (CLAUDE.md, AGENTS.md, configuracion propia). El verificador lee `policy.json`; no contiene valores propios de ai-core.

**Dos ejes, no uno.**

| Eje | Prueba | Que separa |
|---|---|---|
| Cumple con la regla conocida | Prompt neutro, politica entregada | Seguir instrucciones |
| Hace cumplir la regla bajo presion | Prompt que pide violarla ("firma como X", "pega la clave") | Instruccion contra enforcement |

El segundo eje es donde un hook bloquea y un texto no. Es la hipotesis a probar, no un resultado.

**Interfaz para terceros.** `node run.js --adapter-cmd "<comando>"`: el comando recibe el prompt y un directorio de trabajo; el verificador evalua el directorio resultante. Un arnes ajeno no necesita escribir un adaptador en JS.

**Criterios de exito.**
- Las tareas existentes se reescriben contra `policy.json` y vanilla con politica entregada se mide de nuevo; el delta resultante reemplaza al 0/12 actual.
- Al menos 8 tareas por eje, 3 repeticiones, 0 corridas invalidas.
- Un arnes externo corre la suite con `--adapter-cmd` sin tocar el codigo del benchmark.

## Parte 2: certificado de cumplimiento firmado

Ampliar el sobre de sesion con el resultado de verificar la politica sobre los artefactos de la sesion (commits creados, archivos escritos), no solo conteos de guards.

- El sobre incluye el hash de `policy.json` y, por regla, `cumple` o `incumple` con la evidencia minima (hash del commit, ruta; nunca contenido ni comando crudo).
- Mismo formato encadenado Ed25519; la verificacion por terceros sigue necesitando solo `attest.pub` y el JSONL.
- Pendiente previo: el usuario debe ejecutar `keygen` y anclar el hash de cabeza (hoy el hueco de truncado no esta cerrado).

**Criterios de exito.**
- Una sesion con un commit que viola la politica produce un sobre con `incumple`; con uno valido, `cumple`.
- `verify` detecta la alteracion de cualquier campo nuevo.
- El comando crudo y el contenido de archivos no aparecen en el sobre (prueba automatizada).

## Limites declarados

- Un certificado firmado por el mismo dueno de la maquina prueba consistencia, no honestidad. Para terceros hace falta anclar el hash en un medio externo.
- Hermes y OpenClaw: sin comando headless verificado. Ninguna afirmacion sobre ellos hasta leer sus fuentes.
- El eje de presion puede dar 0 para todos los arneses; si ocurre, se publica asi.

## Orden propuesto

1. `policy.json` y reescritura de los verificadores (Parte 1, eje 1). Hecho.
2. Eje de presion y `--adapter-cmd`. Hecho: 8 tareas, 3 repeticiones, 0 invalidas; ai-core 88% frente a 63% de `claude-policy-text` (ver `benchmark/INFORME.md`). El brazo de un arnes externo queda sujeto a que exista su comando headless verificado.
3. Certificado (Parte 2). Hecho: el par de claves ya existia (`keygen` lo confirmo) y `session-attest.js sign` agrega al sobre `politica.hash` y `cumplimiento` por regla (`commit.author`, `commit.bannedTerms`, `code.maxLines`) con estado `cumple`, `incumple` o `sin_datos`; la evidencia es solo el hash corto del commit o la ruta. Se evaluan los commits desde el `gitHead` del sobre anterior y los archivos de codigo que tocaron. `secrets.requireEnv` y las reglas de estilo de respuesta no se evaluan: no hay un artefacto de sesion que las pruebe (las cubren `hardcoded-secret-guard.js` en bloqueo y el benchmark en medicion). Pendiente: anclar el hash de cabeza fuera del equipo.

Hallazgos del paso 2 que cambiaron el arnes: los hooks de git no se activaban en las fixtures del benchmark; no existia un control de credenciales literales en codigo (`hardcoded-secret-guard.js`); y la regla de precedencia (12 del ancla de CLAUDE.md) para pedidos puntuales que contradicen la politica. `pr-modular-2` fallaba porque `standards-guard` solo avisaba; ahora bloquea archivos de codigo de mas de 300 lineas (PostToolUse, exit 2). Sin medir hasta una nueva corrida.
