# Plan de Evolución Arquitectónica y Estandarización Comercial: ai-core

## 1. Diagnóstico del Estado Actual vs. Arquitectura Objetivo
* Configuración Multi-Tenant: Desacople estricto en `~/.ai-core/config.json`.
* Gobernabilidad: Separación en `AGENTS.md`, `MEMORY.md` y `COMMANDS.md`.
* Lazy Loading (Tier 1/Tier 2): Índices `manifest.json` en memoria; reglas en `rules.md`.
* Nodos Semánticos (#NID): Bloques atómicos con invariantes y Zod.
* Antítesis (Red Team): Fuzzing automático antes de commit.

## 2. Fases de Implementación Técnica

### Fase 1: Gobernabilidad y Aislamiento Multi-Tenant (COMPLETADO)

### Fase 2: Integración del Model Context Protocol (MCP)
* Activar Context7/Fetch MCP y GitHub MCP por defecto.

### Fase 3: Desacoplamiento de Skills (Optimización de Contexto)
* Estructura Bi-Nivel (Tier 1 / Tier 2): Extraer `manifest.json` y `rules.md`.
* Crear herramienta `load_skill_context`.

### Fase 4: Protocolo de Nodos Semánticos (#NID)
* Esquema Zod en `src/schemas/node.schema.ts`.
* Compilador/Linker Interno para unir `nodes.json` con delimitadores `/* [@NID:<id>] */`.

### Fase 5: Motor de Antítesis (Verificación Hostil)
* Agente Auditor aislado con Vitest para fuzzing de payloads.
* Bloqueo de integración si no supera aserciones.

### Fase 6: Telemetría y Benchmark Reproducible
* Módulo de Telemetría (`src/telemetry/tracker.ts`).
* Comando `ai-core benchmark --suite=standard`.

## 3. Hoja de Ruta de Ejecución (Sprints)
[Sprint 1: Multi-Tenant & MCP] - HECHO
[Sprint 2: Refactor Estructural y Lazy Loading] - ACTUAL
[Sprint 3: Engine de Antítesis]
[Sprint 4: Loop de Auto-Actualización y Benchmark]

## 4. Reglas de Contención (Seguridad durante Auto-Edición)
1. Sandboxing: Edición en rama efímera.
2. Kernel Lock: Modificar core requiere validación de tests, sino `git reset --hard HEAD`.
3. Restricción de Fallos: Abortar tras 2 intentos fallidos de parcheo.

---
