'use strict';

// Cada regla: patron que dispara el bloqueo + patron de excepcion (alternativa
// ya segura que no debe bloquearse) + motivo mostrado al operador.
// `git` admite opciones globales antes del subcomando (-C <ruta>, -c k=v,
// --no-pager...): una regla anclada a "git <subcomando>" se evadia con ellas.
const GIT = String.raw`\bgit(?:\s+(?:-[Cc]\s+\S+|--[\w-]+(?:=\S+)?))*\s+`;

const REGLAS = [
  {
    nombre: 'rm -rf',
    // Cubre combinada corta (-rf/-fr), formas largas (--recursive --force en
    // cualquier orden) y mezcla corta+larga (-r --force, --recursive -f) --
    // hallazgo de auditoria 2026-08-14: solo se cubria la forma corta combinada.
    // Flag /i agregado (hallazgo red-team 2026-08-15): "RM -rf" en
    // mayusculas evadia el bloqueo -- el nombre del comando no distingue
    // seguridad por case, a diferencia de flags como git branch -D/-d.
    // Cada flag se exige como token propio (precedido de espacio y seguido de espacio o fin): sin eso
    // un nombre de archivo como release-for-review.log contenia "-for" y se tomaba por -fr.
    disparo: /\brm\s+(?:\S+\s+)*?(?:(?:-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*(?=\s|$))|(?:-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*(?=\s|$))|(?:(?:-r(?=\s|$)|--recursive\b)(?:\s+\S+)*?\s+(?:-f(?=\s|$)|--force\b))|(?:(?:-f(?=\s|$)|--force\b)(?:\s+\S+)*?\s+(?:-r(?=\s|$)|--recursive\b)))/i,
    excepcion: null,
    breakGlass: true,
    motivo: 'borrado recursivo forzado -- irreversible, sin papelera de reciclaje.',
  },
  {
    nombre: 'git push --force',
    // --force a secas o -f (solo o combinado, ej. -fu): --force-with-lease solo no dispara,
    // y combinado con --force sigue bloqueando porque el --force plano esta presente
    disparo: new RegExp(GIT + String.raw`push\b.*(?:--force(?![-\w])|\s-[a-zA-Z]*f[a-zA-Z]*\b)`, 'i'),
    excepcion: null,
    motivo: 'sobreescribe el historial remoto sin verificar si alguien mas pusheo -- usar --force-with-lease en su lugar.',
  },
  {
    nombre: 'git push +refspec (push forzado)',
    // El prefijo + en un refspec fuerza la actualizacion igual que --force y
    // anula la proteccion de --force-with-lease, por eso no hay excepcion.
    disparo: new RegExp(GIT + String.raw`push\b[^|;&\n]*\s\+[^\s+]`, 'i'),
    excepcion: null,
    motivo: 'un refspec con prefijo + equivale a --force y sobreescribe el historial remoto -- usar --force-with-lease en su lugar.',
  },
  {
    nombre: 'git reset --hard',
    disparo: new RegExp(GIT + String.raw`reset\s+.*--hard\b`, 'i'),
    excepcion: null,
    breakGlass: true,
    motivo: 'descarta cambios locales sin posibilidad de recuperacion (working tree + index).',
  },
  {
    nombre: 'git clean -f',
    // -n/--dry-run en el mismo segmento exime (no borra); "git clean -n; git clean -fd" sigue bloqueando
    disparo: new RegExp(GIT + String.raw`clean\b(?![^;&|\n]*(?:\s-[a-zA-Z]*n[a-zA-Z]*(?=\s|$)|--dry-run\b))[^;&|\n]*(?:\s-[a-zA-Z]*f|--force\b)`, 'i'),
    excepcion: null,
    breakGlass: true,
    motivo: 'borra archivos no trackeados de forma irreversible -- puede incluir trabajo en progreso nunca commiteado.',
  },
  {
    nombre: 'git branch -D',
    disparo: new RegExp(GIT + String.raw`branch\s+.*(?:-D\b|--delete\b.*(?:--force\b|\s-f\b)|--force\b.*--delete\b|\s-[a-z]*d[a-z]*f|\s-[a-z]*f[a-z]*d)`),
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
    disparo: new RegExp(GIT + String.raw`push\b.*(?:\s--delete\b|\s-d(?=\s|$)|\s:[^\s:]\S*)`),
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
    excepcion: /\bWHERE\b(?!\s+(?:1\s*=\s*1|true)\b)/i,
    motivo: 'modifica o elimina filas sin condicion -- afecta la tabla completa. Agregar WHERE para acotar el alcance, o confirmar explicitamente si el alcance total es intencional.',
  },
  {
    nombre: 'DELETE/UPDATE con WHERE tautologico',
    // "WHERE 1=1" o "WHERE true" no acota nada: afecta la tabla completa igual que sin WHERE.
    disparo: /\b(?:DELETE\s+FROM\s+\S+|UPDATE\s+\S+\s+SET\s+.+?)\s+WHERE\s+(?:1\s*=\s*1|true)\b/i,
    excepcion: null,
    motivo: 'la condicion es siempre verdadera: modifica o elimina todas las filas de la tabla.',
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
  {
    // Herramienta de red + referencia a .env, claves privadas o variables de
    // credencial en el mismo comando. GET sin material sensible no dispara.
    nombre: 'egreso de secretos por red',
    // Ambos ordenes (herramienta antes o despues del secreto) para cubrir "cat .env | curl".
    disparo: /(?:\b(?:curl|wget|nc|ncat|Invoke-WebRequest|iwr|Invoke-RestMethod|irm)\b.*(?:(?:^|[\s\/"'=@])\.env(?!\.(?:example|sample|template)\b)(?![\w-])|\bid_(?:rsa|ed25519)\b|\.pem(?![\w.-])|\$\{?\w*(?:KEY|TOKEN|SECRET|PASSWORD|CANARY)\w*\}?)|(?:(?:^|[\s\/"'=@])\.env(?!\.(?:example|sample|template)\b)(?![\w-])|\bid_(?:rsa|ed25519)\b).*\|\s*(?:curl|wget|nc|ncat|iwr|irm)\b)/i,
    excepcion: null,
    breakGlass: true,
    motivo: 'envia o referencia un archivo de secretos o una variable de credencial en una peticion de red -- vector de exfiltracion.',
  },
  {
    // .env.example/.sample/.template se excluyen: son plantillas versionables.
    nombre: 'git add de archivos de secretos',
    disparo: /\bgit\s+add\b.*(?:(?:^|[\s\/"'])\.env(?!\.(?:example|sample|template)\b)(?![\w-])|\bid_(?:rsa|ed25519)\b|\.pem(?![\w.-]))/i,
    excepcion: null,
    breakGlass: true,
    motivo: 'versiona un archivo de secretos -- una vez en el historial de git el secreto queda expuesto aunque se borre despues.',
  },
  {
    nombre: 'git push --mirror',
    // Reemplaza todas las referencias del remoto por las locales: borra ramas y etiquetas remotas.
    disparo: new RegExp(GIT + String.raw`push\b.*--mirror\b`, 'i'),
    excepcion: null,
    breakGlass: true,
    motivo: 'sobreescribe y borra todas las referencias del remoto para igualarlas a las locales -- irreversible para el historial remoto.',
  },
  {
    nombre: 'dd hacia un dispositivo',
    disparo: /\bdd\b[^|;&\n]*\bof=\/dev\//i,
    excepcion: null,
    breakGlass: true,
    motivo: 'escribe directamente sobre un dispositivo de bloques -- destruye su contenido.',
  },
  {
    nombre: 'mkfs (formateo)',
    disparo: /\bmkfs(?:\.\w+)?\b/i,
    excepcion: null,
    breakGlass: true,
    motivo: 'formatea un dispositivo -- destruye el sistema de archivos existente.',
  },
  {
    nombre: 'shred',
    disparo: /\bshred\b/i,
    excepcion: null,
    breakGlass: true,
    motivo: 'sobrescribe el archivo de forma que no se puede recuperar.',
  },
  {
    nombre: 'chmod/chown recursivo sobre la raiz',
    disparo: /\b(?:chmod|chown)\s+(?:-[a-zA-Z]*R[a-zA-Z]*|--recursive)\s+\S+\s+\/(?:\s|$)/i,
    excepcion: null,
    breakGlass: true,
    motivo: 'cambia permisos o propietario de todo el sistema de archivos desde la raiz.',
  },
  {
    nombre: 'find -delete',
    disparo: /\bfind\b[^|;&\n]*\s-delete\b/i,
    excepcion: null,
    breakGlass: true,
    motivo: 'borra todo lo que coincide con la busqueda sin pasar por la papelera -- verificar primero el listado sin -delete.',
  },
  {
    nombre: 'DROP SCHEMA',
    disparo: /\bDROP\s+SCHEMA\b/i,
    excepcion: /--\s*confirmado/i,
    breakGlass: true,
    motivo: 'elimina un esquema y, con CASCADE, todos sus objetos -- irreversible sin backup verificado.',
  },
  {
    nombre: 'kubectl delete namespace',
    disparo: /\bkubectl\s+delete\s+(?:ns|namespaces?)\b/i,
    excepcion: /--dry-run/,
    breakGlass: true,
    motivo: 'elimina un namespace completo con todos sus recursos -- usar --dry-run=server primero.',
  },
  {
    nombre: 'docker volume/system prune forzado',
    disparo: /\bdocker\s+(?:volume|system)\s+prune\b[^|;&\n]*(?:\s-[a-zA-Z]*f|--force\b)/i,
    excepcion: null,
    breakGlass: true,
    motivo: 'elimina sin pedir confirmacion recursos de docker, incluidos volumenes con datos.',
  },
];

module.exports = { REGLAS };
