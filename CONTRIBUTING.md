# Guia de Contribucion — AI-CORE

Este nucleo lleva semanas ahorrando horas de trabajo real en produccion. Si llegaste hasta aqui es porque ya lo usas, lo entiendes y quieres que sea mejor. Eso es exactamente lo que necesitamos.

La forma mas impactante de contribuir es crear un nuevo `skill`: un perfil de comportamiento tecnico que el agente puede asumir al instante. Ya tenemos 10 skills activos — arquitecto-backend, tech-lead-frontend, qa-engineer, security-auditor y seis mas. Pero el nucleo es framework-agnostico por diseno. Si trabajas con Elixir, Ruby, Kotlin, Dart o cualquier otro stack que el nucleo no cubre todavia, tu skill puede ser la pieza que le faltaba a otro desarrollador.

---

## Prerequisitos

Antes de crear cualquier contribucion, debes internalizar dos documentos:

- `CLAUDE.md` — Las 15 reglas globales inmutables. Ninguna contribucion puede violarlas, sobrescribirlas ni ignorarlas.
- `OPERATIONS.md` — La arquitectura operativa del nucleo y los protocolos de incorporacion.

Un skill que viola la Regla 2 (emojis prohibidos) o ignora la Regla 3 (Lazy Context) sera rechazado en review sin importar la calidad del resto del contenido.

---

## Crear un Nuevo Skill

### Estructura minima

```
.claude/skills/{nombre-en-kebab-case}/
└── SKILL.md
```

El nombre de la carpeta define el identificador del skill. Usar kebab-case exclusivamente: `data-engineer`, `mobile-flutter`, `blockchain-solidity`.

### Frontmatter obligatorio

Todo `SKILL.md` comienza con este bloque YAML:

```yaml
---
name: nombre-del-skill
description: Una frase precisa que describe el dominio tecnico cubierto y cuando activarlo
origin: ai-core
version: 1.0.0
---
```

- `name`: identico al nombre de la carpeta.
- `description`: sera la primera linea que el agente lee al evaluar si debe activar el perfil. Hazla precisa y tecnica.
- `origin: ai-core`: obligatorio. Identifica al skill como parte del nucleo.
- `version`: semantico. Empieza en `1.0.0`.

### Secciones obligatorias del SKILL.md

El cuerpo del archivo debe contener exactamente estas cuatro secciones, en este orden:

**1. Cuando Activar Este Perfil**
Lista concreta de triggers. No generica. Ejemplos: "Al escribir migrations en Ecto", "Al disenar schemas en Prisma con PostgreSQL", "Al revisar queries N+1 en ActiveRecord".

**2. Primera Accion al Activar (Lazy Context)**
Protocolo de exploracion especifico del dominio. El skill debe deducir el entorno antes de emitir recomendaciones. Ejemplo: leer `mix.exs` para Elixir, `Gemfile.lock` para Ruby, `pubspec.yaml` para Flutter.

**3. Directiva de Interrupcion**
Condiciones especificas bajo las cuales el skill debe insertar `[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]` y detener la ejecucion. Ser conservador aqui es preferible a ser laxo.

**4. Restricciones del Perfil**
El skill hereda las 15 reglas globales sin excepcion. Esta seccion solo agrega restricciones adicionales especificas del dominio. Ejemplo: "Nunca emitir codigo de smart contract sin auditoria de seguridad previa en el mismo turno."

### Ejemplo rapido — skill `mobile-flutter`

```yaml
---
name: mobile-flutter
description: Arquitecto de aplicaciones Flutter/Dart. Experto en gestion de estado (Bloc, Riverpod), arquitectura de capas y optimizacion de rendimiento en iOS y Android.
origin: ai-core
version: 1.0.0
---

## Cuando Activar Este Perfil

- Al disenar la arquitectura de widgets o la jerarquia de pantallas en Flutter.
- Al elegir o migrar entre gestores de estado (setState, Provider, Bloc, Riverpod, GetX).
- Al revisar el rendimiento de builds (const constructors, keys, RepaintBoundary).
- Al configurar canales de plataforma (MethodChannel) para integraciones nativas iOS/Android.

## Primera Accion al Activar (Lazy Context)

Leer en este orden antes de emitir cualquier recomendacion:
1. `pubspec.yaml` — versiones de Flutter/Dart, dependencias de estado y plugins.
2. `lib/main.dart` — punto de entrada, configuracion del MaterialApp/CupertinoApp.
3. Estructura de `lib/` — detectar patron de carpetas (feature-first vs layer-first).

## Directiva de Interrupcion

Insertar `[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]` y detener si:
- La tarea implica migrar el gestor de estado con mas de 20 widgets consumidores.
- La tarea requiere implementar canales de plataforma con logica de negocio critica en nativo.
- La tarea involucra un cambio en el esquema de navegacion que afecta deep links existentes.

## Restricciones del Perfil

- Hereda las 15 Reglas Globales de CLAUDE.md sin excepcion.
- Nunca recomendar setState para estado compartido entre pantallas.
- Toda solucion de animacion debe evaluar primero AnimationController antes de paquetes externos.
```

---

## Despues de Crear el Skill

1. Agregar la referencia al skill en `CLAUDE.md` (seccion "Skills Disponibles").
2. Agregar la referencia al skill en `README.md` (seccion "Skills disponibles").
3. Agregar la referencia al skill en `OPERATIONS.md` si aplica.
4. Ejecutar Regla 15:

```bash
git add .
git commit -m "feat(skills): agregar skill {nombre} para dominio {descripcion-breve}"
git push origin main
```

---

## Que mas puedes contribuir

**Mejoras a skills existentes**: Si encuentras un skill que le falta un trigger, una restriccion critica o un protocolo de Lazy Context incompleto, abrelo y propone la mejora. El skill es un documento vivo.

**Mejoras a las Reglas Globales**: Las reglas son inmutables en produccion pero evolucionan entre versiones del nucleo. Si identificas una regla que genera comportamiento no deseado en un caso de uso real, documenta el caso en un issue con evidencia concreta.

**Scripts del nucleo**: `scripts/gemini-bridge.js` e `scripts/init-backlog.js` son Node.js puro. Si tienes un caso de uso que el bridge no cubre (batch processing, streaming, output en formato custom), la contribucion es bienvenida.

---

## Estandares que no son opcionales

- Conventional Commits (Regla 8): `feat`, `fix`, `chore`, `docs`, `refactor`, `test`. Prefijo en ingles, descripcion en español.
- Sin emojis, iconos ni adornos visuales en ningun archivo (Regla 2).
- Todo comentario en codigo explica el "por que", no el "que hace" la linea (Regla 5).
- Sin abstraccion prematura. Si la logica sirve para un solo skill, va en ese skill (Regla 4).

---

El nucleo existe porque alguien decidio sistematizar lo que aprendio usando LLMs en produccion. Tu contribucion extiende ese conocimiento a casos de uso que nosotros no hemos visto todavia. Eso tiene valor real.

*Documentacion operativa completa: `OPERATIONS.md`*
*Reglas globales inmutables: `CLAUDE.md`*
