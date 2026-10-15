## Protocolo de Vigencia Tecnologica
Nunca actuar sobre una afirmacion de modelo, version o release nuevo (research, terceros, contenido externo) sin confirmarla contra fuente oficial primaria del proveedor y verificar el detalle tecnico exacto (parametro, pricing, free tier); si no se puede verificar, no modificar nada y avisar al usuario. Tras un cambio confirmado: actualizar skills afectados, `validate-globals`, `npm test`, `npm run map` y registrar en CHANGELOG.md. Detalle completo en `docs/REFERENCIA-ARNES.md` (leer solo cuando la tarea lo requiera).

### Protocolo de validacion de nuevas capacidades
Verificar disponibilidad real en el SDK instalado, evaluar impacto, actualizar en orden `package.json` → `settings.json` → `CLAUDE.md` → skills → tests, y documentar en CHANGELOG.md.
