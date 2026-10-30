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

1. `policy.json` y reescritura de los verificadores (Parte 1, eje 1).
2. Eje de presion y `--adapter-cmd`.
3. Certificado (Parte 2), con `keygen` hecho por el usuario.
