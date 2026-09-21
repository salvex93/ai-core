'use strict';

// Cada regla: patron que dispara el bloqueo + patron de excepcion (alternativa
// ya segura que no debe bloquearse) + motivo mostrado al operador.
const REGLAS = [
  {
    nombre: 'rm -rf',
    // Cubre combinada corta (-rf/-fr), formas largas (--recursive --force en
    // cualquier orden) y mezcla corta+larga (-r --force, --recursive -f) --
    // hallazgo de auditoria 2026-08-14: solo se cubria la forma corta combinada.
    // Flag /i agregado (hallazgo red-team 2026-08-15): "RM -rf" en
    // mayusculas evadia el bloqueo -- el nombre del comando no distingue
    // seguridad por case, a diferencia de flags como git branch -D/-d.
    disparo: /\brm\s+.*(?:(?:-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\b)|(?:-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*\b)|(?:(?:-r\b|--recursive\b).*(?:-f\b|--force\b))|(?:(?:-f\b|--force\b).*(?:-r\b|--recursive\b)))/i,
    excepcion: null,
    breakGlass: true,
    motivo: 'borrado recursivo forzado -- irreversible, sin papelera de reciclaje.',
  },
  {
    nombre: 'git push --force',
    disparo: /\bgit\s+push\b.*(--force\b|(?<!--force-with-lease)\s-f\b)/i,
    excepcion: /--force-with-lease/i,
    motivo: 'sobreescribe el historial remoto sin verificar si alguien mas pusheo -- usar --force-with-lease en su lugar.',
  },
  {
    nombre: 'git reset --hard',
    disparo: /\bgit\s+reset\s+.*--hard\b/i,
    excepcion: null,
    breakGlass: true,
    motivo: 'descarta cambios locales sin posibilidad de recuperacion (working tree + index).',
  },
  {
    nombre: 'git clean -f',
    disparo: /\bgit\s+clean\s+.*-[a-zA-Z]*f/i,
    excepcion: null,
    breakGlass: true,
    motivo: 'borra archivos no trackeados de forma irreversible -- puede incluir trabajo en progreso nunca commiteado.',
  },
  {
    nombre: 'git branch -D',
    disparo: /\bgit\s+branch\s+.*-D\b/,
    excepcion: null,
    breakGlass: true,
    motivo: 'borra una rama sin verificar si esta mergeada -- usar -d (minuscula) si la rama ya esta integrada.',
  },
  {
    // La palabra TRUNCATE/DROP TABLE dentro de un patron de busqueda (grep,
    // rg, findstr, ag) no ejecuta nada contra una base de datos -- es texto
    // a buscar, no DDL real. Sin esta exclusion, "grep TRUNCATE archivo.sql"
    // se bloqueaba igual que un TRUNCATE TABLE real ejecutado por psql/mysql.
    // La excepcion exige que la herramienta de busqueda aparezca ANTES del
    // patron destructivo en el comando (mismo lado del pipe/`;` que la
    // palabra) para no eximir un comando encadenado real como
    // "grep foo; psql -c TRUNCATE TABLE x", donde el TRUNCATE real esta en
    // otro comando distinto separado por ; o &&.
    nombre: 'DROP TABLE / TRUNCATE sin filtro',
    disparo: /\b(DROP\s+TABLE|TRUNCATE(\s+TABLE)?)\b/i,
    excepcion: /IF\s+EXISTS.*--\s*intencional|--\s*confirmado|\b(grep|rg|findstr|ag)\b[^;&|]*(DROP\s+TABLE|TRUNCATE)/i,
    breakGlass: true,
    motivo: 'elimina datos o estructura de tabla de forma irreversible sin backup verificado en el propio comando.',
  },
  {
    nombre: 'kubectl delete --all',
    disparo: /\bkubectl\s+delete\b.*(--all\b|--all-namespaces\b)/,
    excepcion: /--dry-run/,
    motivo: 'elimina todos los recursos del tipo/namespace indicado -- verificado contra kubernetes.io: "may result in inconsistency or data loss". Usar --dry-run=server primero para confirmar el alcance.',
  },
  {
    nombre: 'terraform destroy',
    disparo: /\bterraform\s+(destroy\b|apply\s+.*-destroy\b)/,
    excepcion: /-target\b/,
    motivo: 'destruye infraestructura viva -- HashiCorp recomienda "terraform plan -destroy" primero para revisar el alcance, o -target para acotar a un recurso especifico.',
  },
  {
    nombre: 'terraform apply -auto-approve',
    disparo: /\bterraform\s+apply\b.*-auto-approve\b/,
    excepcion: null,
    breakGlass: true,
    motivo: 'omite la revision interactiva del plan antes de aplicar -- HashiCorp advierte verificar que nada mas pueda cambiar la infraestructura fuera de este flujo.',
  },
  {
    nombre: 'docker system prune --volumes',
    disparo: /\bdocker\s+system\s+prune\b.*--volumes\b/,
    excepcion: null,
    breakGlass: true,
    motivo: 'borra volumenes anonimos ademas de contenedores/imagenes/redes -- docker no los borra por defecto justamente para evitar perdida de datos.',
  },
  {
    nombre: 'docker volume rm',
    disparo: /\bdocker\s+volume\s+rm\b/,
    excepcion: null,
    breakGlass: true,
    motivo: 'elimina un volumen de datos de forma irreversible -- confirmar que no contiene datos que no esten respaldados en otro lugar.',
  },
  {
    nombre: 'git push --delete (borrado de rama remota)',
    // Sintaxis moderna --delete/-d, y la antigua "origin :rama" (equivalentes
    // segun git-scm.com) -- el lado izquierdo de ":" debe estar vacio para
    // que sea un borrado; "origin HEAD:main" (refspec normal) no debe matchear.
    disparo: /\bgit\s+push\s+\S+\s+(--delete\b|-d\b|:\S+)/,
    excepcion: null,
    breakGlass: true,
    motivo: 'elimina una rama del repositorio remoto -- confirmar que no es una rama protegida (main/master/develop) antes de reintentar.',
  },
  {
    nombre: 'git push --no-verify (omite el marco de calidad)',
    // El hook pre-push de .githooks/ ejecuta scripts/quality-gate.js; saltarlo
    // publica cambios sin pasar limite de lineas, skills, agentes ni tests.
    disparo: /\bgit\s+push\b.*--no-verify\b/i,
    excepcion: null,
    breakGlass: true,
    motivo: 'omite el hook pre-push con el marco de calidad (scripts/quality-gate.js) -- corregir lo que falla en vez de saltar la verificacion.',
  },
  {
    nombre: 'DELETE/UPDATE sin WHERE',
    // Ancla al verbo DML destructivo (nunca a SELECT) y exige ausencia de
    // WHERE en toda la sentencia, no solo al final -- evita el falso
    // positivo de "DELETE FROM tabla WHERE id = $1" (uso rutinario).
    disparo: /\b(DELETE\s+FROM\s+\S+|UPDATE\s+\S+\s+SET\s+.+?)(;|"|$)/i,
    excepcion: /\bWHERE\b/i,
    motivo: 'modifica o elimina filas sin condicion -- afecta la tabla completa. Agregar WHERE para acotar el alcance, o confirmar explicitamente si el alcance total es intencional.',
  },
  {
    nombre: 'DROP DATABASE',
    disparo: /\bDROP\s+DATABASE\b/i,
    excepcion: /IF\s+EXISTS.*--\s*intencional|--\s*confirmado/i,
    breakGlass: true,
    motivo: 'elimina una base de datos completa de forma irreversible sin backup verificado en el propio comando.',
  },
  {
    // Equivalente nativo de Windows cmd.exe a "rm -rf" -- ausente hasta ahora
    // pese a que destructive-op-guard.js corre igual en Windows (settings.json
    // se genera y ejecuta en la misma maquina, ver hooks-definition.js).
    nombre: 'del /f /s /q (cmd.exe)',
    disparo: /\bdel\s+(\/[a-zA-Z]\s+)*\/[fF](\s+\/[a-zA-Z])*\s+\/[sS]\b|\bdel\s+(\/[a-zA-Z]\s+)*\/[sS](\s+\/[a-zA-Z])*\s+\/[fF]\b/,
    excepcion: null,
    breakGlass: true,
    motivo: 'borrado forzado y recursivo de archivos via cmd.exe -- equivalente Windows de "rm -rf", irreversible.',
  },
  {
    // Equivalente nativo de PowerShell a "rm -rf".
    // Alias reales de Remove-Item verificados contra learn.microsoft.com/
    // powershell/module/microsoft.powershell.management/remove-item
    // (2026-08-15, vigente 5.1/7+): ri, rd, rmdir, del, erase (ademas de
    // Remove-Item y rm ya cubiertos). Hallazgo red-team: "ri -Recurse
    // -Force" evadia el bloqueo porque solo el nombre completo del cmdlet
    // y "rm" estaban en el patron.
    nombre: 'Remove-Item -Recurse -Force (PowerShell, incluye alias reales)',
    disparo: /\b(Remove-Item|rm|ri|rd|rmdir|erase)\b.*(-Recurse\b.*-Force\b|-Force\b.*-Recurse\b)/i,
    excepcion: null,
    breakGlass: true,
    motivo: 'borrado forzado y recursivo de archivos via PowerShell (o su alias real) -- equivalente Windows de "rm -rf", irreversible.',
  },
];

module.exports = { REGLAS };
