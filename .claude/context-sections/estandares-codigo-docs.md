## Estandares de Documentacion y Codigo
- **Docs .md:** sin emojis ni adornos; un archivo por proposito; prohibido inventar alcance o sistemas del cliente (lo no documentado va como "a definir en discovery"); entregables con criterio de exito medible; documentos internos separados de los de cliente.
- **Comentarios:** sin adornos, explican el POR QUE; max 1 linea inline y 3 por bloque; sin referencias a tareas, tickets, fechas ni herramientas; JSDoc minimo solo en funciones publicas.
- **Codigo:** nombres en ingles, comentarios en español; funciones <= 20 lineas y <= 3 parametros; early return (max 3 niveles); errores explicitos, nunca `catch {}` vacio; datos inmutables; toda funcion publica con test de camino feliz y de error; sin secretos hardcodeados; logs JSON estructurados.

Texto completo: `docs/REFERENCIA-ARNES.md`.
