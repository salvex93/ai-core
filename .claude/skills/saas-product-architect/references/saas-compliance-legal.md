## Compliance B2B: SOC 2 e ISO 27001

Este skill no repite PCI-DSS ni HIPAA — ver `ciso` para esos dos, que ya los cubre con profundidad equivalente.

| Dimension | SOC 2 | ISO 27001 |
|---|---|---|
| Naturaleza | Atestacion (attestation) por CPA licenciado en EE.UU. (o equivalente ICAEW en UK) | Certificacion emitida por organismo de certificacion acreditado |
| Alcance | Controles sobre sistemas o servicios especificos | Sistema de Gestion de Seguridad de la Informacion (SGSI/ISMS) a nivel organizacional completo |
| Geografia/uso | Predomina en Norteamerica, se reporta bajo NDA directamente a clientes (no es sello publico) | Estandar internacional, certificado publicable |
| Prescriptividad | Flexible — la empresa elige que Trust Services Criteria auditar | Prescriptivo, con controles universales de Anexo A |

**SOC 2 — Trust Services Criteria (5, uno obligatorio):** Security (obligatorio en todo reporte SOC 2), Availability, Processing Integrity, Confidentiality, Privacy.

**SOC 2 Tipo I vs Tipo II:**
- Tipo I: evalua el diseno de los controles en un punto especifico del tiempo (point-in-time).
- Tipo II: evalua diseno Y efectividad operativa durante un periodo continuo, tipicamente 6-12 meses.
- **Limite de verificacion declarado:** la distincion textual exacta Tipo I/Tipo II esta confirmada por consenso de multiples fuentes secundarias especializadas en compliance, no contra el texto primario integro de AICPA (el documento oficial esta en PDF, no accesible por fetch de texto plano en esta verificacion). Si esto va a un contrato o propuesta comercial, descargar y citar el PDF oficial de AICPA antes de usarlo como fuente unica.

**Por que un SaaS B2B enterprise lo necesita:** clientes enterprise exigen SOC 2 (usualmente Tipo II) como requisito de procurement/vendor risk assessment antes de firmar contrato — es la evidencia estandar de proteccion de datos auditada, no autodeclarada. AICPA confirma la existencia de mapeos oficiales publicados entre su Trust Services Criteria 2017 e ISO 27001/NIST 800-53, lo que valida que ambos estandares cubren dominios de control comparables aunque con mecanismos de certificacion distintos.

## Terms of Service, Privacy Policy y DPA (orientacion estructural — NO asesoria legal)

Todo el contenido de esta seccion es orientacion estructural general. Un ToS, Privacy Policy o DPA real deben ser redactados o revisados por un abogado con jurisdiccion aplicable antes de publicarse — esto no es un sustituto de asesoria legal formal.

**Terms of Service — elementos tipicos:**
- Limitacion de responsabilidad (cap de danos)
- Condiciones de terminacion del servicio (por ambas partes, con y sin causa)
- Politica de uso aceptable
- Propiedad intelectual y licencia de uso del software
- Resolucion de disputas / ley aplicable

**Privacy Policy — elementos tipicos bajo GDPR/CCPA:**
- Datos personales recolectados y finalidad
- Base legal del procesamiento (Art. 6 GDPR: consentimiento, ejecucion de contrato, interes legitimo, obligacion legal)
- Derechos del interesado: acceso, rectificacion, borrado, portabilidad, oposicion (GDPR); derecho a saber/eliminar/optar por no vender datos (CCPA/CPRA)
- Retencion de datos y transferencias internacionales

**DPA (Data Processing Agreement):** cuando el SaaS procesa datos personales de los usuarios finales de su cliente, el cliente es el controller y el SaaS es el processor. Contenido minimo exigido por Articulo 28(3) GDPR (verificado contra el texto del reglamento):
- Objeto, duracion, naturaleza y finalidad del procesamiento; tipo de datos y categorias de interesados.
- Obligaciones del processor: (a) procesar solo bajo instrucciones documentadas, (b) confidencialidad del personal autorizado, (c) medidas de seguridad conforme Art. 32, (d) condiciones para subcontratar sub-processors, (e) asistir con solicitudes de derechos de los interesados, (f) asistir en notificacion de brechas (Art. 32-36), (g) eliminar o devolver datos al finalizar el servicio, (h) proveer informacion para auditorias del controller.
- El contrato debe ser por escrito, incluida forma electronica.

Esto es orientacion estructural sobre contenido minimo segun el texto del reglamento — no sustituye redaccion legal formal ni el analisis de si aplican Clausulas Contractuales Estandar (SCC) para transferencias internacionales.

