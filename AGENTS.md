# AGENTS.md — AI-CORE v3.40.1

Este archivo es la capa de interoperabilidad para herramientas que leen `AGENTS.md` de forma nativa (GitHub Copilot, Cursor, Gemini CLI, OpenCode). Las reglas de comportamiento completas viven en `CLAUDE.md` — este documento resume identidad, comandos y convenciones para que cualquier harness compatible tenga contexto minimo sin necesitar el archivo completo.

## Identidad

AI-CORE: nucleo centralizado de agentes/skills para proyectos de desarrollo. Español estricto, sin emojis, cambios quirurgicos, principios SOLID, maximo 300 lineas por modulo de codigo.

## Comandos esenciales

```bash
npm install                # instalar dependencias
npm test                   # suite completa (Node nativo, sin dependencias externas)
npm run validate-agents     # conformidad de agentes con CLAUDE.md
npm run validate-globals    # conformidad de skills con CLAUDE.md
npm run audit-market -- --only-stale  # vigencia de modelos/SDKs
npm run token-metrics       # metricas de consumo de tokens
```

## Convenciones de codigo

- SOLID estricto, una responsabilidad por modulo.
- Prohibido inventar dependencias no declaradas en `package.json`.
- Comentar el POR QUE, nunca el QUE.
- Errores explicitos con contexto — prohibido `except: pass` / `catch {}` vacio.
- Toda funcion publica con al menos un test de camino feliz y uno de error.
- Prohibido hardcodear credenciales o URLs de produccion.

## Commits

Sin `Co-Authored-By`, sin menciones a IA o herramientas externas. Autoria: Andrew Arizmendi (`salvex93@gmail.com`).

## Referencia completa

Para roles de agente, jerarquia de costo de modelos, gobierno de subagentes, guards de seguridad, protocolo de vigencia tecnologica y todo el detalle operativo: ver `CLAUDE.md` en la raiz de este repositorio.
