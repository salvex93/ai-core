# Informe de sesion firmado

Cada sesion deja un sobre verificable con el resumen de veredictos de los guards y los desbloqueos break-glass. Los sobres forman una cadena: cada uno incluye el hash del anterior y va firmado con Ed25519.

## Activacion (una vez por maquina)

```
node .claude/bin/session-attest.js keygen
```

Crea `~/.config/ai-core/attest.key` (0600) y `attest.pub`. Sin la clave privada el hook Stop no hace nada. `keygen` no sobrescribe: perder la privada invalida la cadena existente. Respaldar la privada fuera del repo.

## Que registra

- Conteo de veredictos `ok`, `warn` y `blocked`, total y por guard (fuente: reporte de guards de la sesion).
- Break-glass confirmados desde el sobre anterior: solo `id` y `guardId`. El comando crudo (`contexto`) nunca se copia.
- Version del arnes, commit corto y sessionId.

Un sobre nuevo solo se escribe si algo cambio respecto al anterior de la misma sesion; una sesion sin actividad de guards no genera sobre.

## Verificar

```
node .claude/bin/session-attest.js verify
```

Imprime el numero de sobres y el hash de cabeza, o el indice del primer sobre roto (exit 1). Un tercero solo necesita `attest.pub` y `.claude/ATTESTATIONS.jsonl`.

## Limite y como cerrarlo

La cadena detecta alteracion y borrado intermedio. No detecta que se trunque el final ni que el dueno de la clave fabrique una cadena completa nueva. Para cerrar ese hueco hay que anclar el hash de cabeza fuera del equipo: publicarlo en un commit, tag o release. Quien verifique compara ese hash con el que imprime `verify`.

## Archivos

- `.claude/bin/lib/session-attestation.js`: logica pura (firma, hash, cadena).
- `.claude/bin/lib/session-attestation-store.js`: lectura y escritura de disco.
- `.claude/bin/session-attest.js`: CLI y hook Stop (perfil de permisos `repoAtestar`).
- `.claude/ATTESTATIONS.jsonl`: cadena local, ignorada por git.
