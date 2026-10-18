## Modulo — Vanguardia Transversal en Seguridad de Aplicaciones

### Identidad Declarada Antes de Ejecutar

Antes de producir cualquier hallazgo, recomendacion o control de seguridad, completar en una linea:

`IDENTIDAD AUDITORIA: Superficie evaluada: [endpoint especifico / flujo de negocio / pipeline CI-CD / gestor de secretos] | Vector priorizado: [inyeccion / control de acceso / cadena de suministro / criptografia / secretos] | Actor de amenaza asumido: [usuario autenticado malicioso / atacante externo no autenticado / insider con acceso a CI / dependencia comprometida] | Evidencia minima exigida: [ruta:linea exacta / output de herramienta / captura de trafico]`

Sin esta linea completada con valores reales del proyecto auditado, no se emite ningun hallazgo. Un hallazgo sin actor de amenaza definido es especulacion, no auditoria.

### Prohibido — Patrones Reconocibles de Auditoria de Relleno

- Reporte de "buenas practicas generales" sin cita de archivo:linea — un hallazgo que podria pegarse sin cambios en cualquier auditoria de cualquier proyecto.
- Marcar como resuelto un hallazgo de secreto hardcodeado solo porque se movio a `.env`, sin verificar que el secreto expuesto en el historial de Git fue rotado.
- Checklist de OWASP Top 10 copiada y marcada "cumple" en las diez categorias sin evidencia diferenciada por categoria — el mismo veredicto generico repetido diez veces.
- Recomendar una herramienta de escaneo (SAST, dependency scanner, secret scanner) sin verificar si ya existe una configurada en el pipeline del proyecto, duplicando cobertura en vez de cerrar el gap real.
- Politica de contraseñas o CSP citada de memoria sin adaptarla al stack detectado — `default-src *` o un umbral de bcrypt generico repetido sin razonar el contexto especifico.
- Declarar "sin hallazgos criticos" en una auditoria que no incluyo revision de autenticacion, autorizacion ni secretos — el silencio en las tres capas de mayor impacto no es evidencia de ausencia.

### Vigencia — Estandar Mas Reciente del Dominio

Verificado contra `owasp.org/www-project-top-ten/` en esta tarea: la edicion vigente es **OWASP Top 10 2025**, ya adoptada en la seccion "OWASP Top 10 — Verificacion por Capa" de este skill (A01 fusiona SSRF, A02 sube a posicion 2, A03 reemplaza el antiguo A06 con Software Supply Chain Failures, A10 es categoria nueva de manejo de excepciones). No repetir ese detalle aqui — este bloque cubre solo el dato de vigencia adicional para gestion de secretos.

Sobre gestion de secretos: el `OWASP Secrets Management Cheat Sheet` existe como documento vigente y mantenido en `cheatsheetseries.owasp.org` (parte del OWASP Cheat Sheet Series, repositorio oficial `OWASP/CheatSheetSeries` en GitHub), cubriendo ciclo de vida completo del secreto (creacion, almacenamiento, acceso, rotacion, revocacion, auditoria) a traves de CI/CD, proveedores cloud y contenedores — confirmado por fuente oficial. El detalle de cuantas secciones exactas contiene el documento y las recomendaciones de algoritmo especifico (ej. cifrado en reposo) no se verifico linea por linea contra el cheat sheet en si en esta pasada: **orientativo, no verificado contra fuente oficial en el detalle fino** — consultar `cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html` directamente antes de citar una recomendacion tecnica especifica de ese documento como confirmada.
