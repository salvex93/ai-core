## Protocolo de Commits Git
- Identidad obligatoria en todo repositorio: `git config user.name "Andrew Arizmendi"` / `git config user.email "salvex93@gmail.com"`
- Verificar identidad con `git config user.name` antes del primer commit en cada proyecto
- PROHIBIDO incluir "Co-Authored-By", menciones a Claude, IA o herramientas externas en cualquier mensaje de commit
- El mensaje debe parecer escrito enteramente por Andrew — tecnico, limpio, sin rastro de herramientas

### Reglas de staging
Prohibido `git add -A` o `.` sin verificar; `node_modules/`, `.env*`, `.claude/HEALTH_REPORT.md` y `.claude/TO_GEMINI.md` nunca van a commits. Detalle inyectado por hook: `.claude/context-sections/commits-staging.md`.

### Reglas de staging obligatorias
- PROHIBIDO usar `git add -A` o `git add .` sin verificar primero que no se incluye `node_modules/`, `.env` ni artefactos de sesion
- Antes de stagear: ejecutar `git status --short | grep -v node_modules` para confirmar que solo se incluyen archivos del proyecto
- Si `node_modules/` aparece en `git status`, ejecutar `git reset HEAD node_modules/` antes de cualquier commit
- `node_modules/` NUNCA va al repositorio — es reconstruible con `npm install` y su inclusion infla el historial con cientos de archivos irrelevantes
- Archivos prohibidos en commits: `node_modules/`, `.env*`, `.claude/HEALTH_REPORT.md`, `.claude/TO_GEMINI.md`
- Identidad: `git config user.name "Andrew Arizmendi"` / `git config user.email "salvex93@gmail.com"`; verificar antes del primer commit en cada proyecto
- PROHIBIDO "Co-Authored-By", menciones a Claude, IA o herramientas externas en mensajes de commit
