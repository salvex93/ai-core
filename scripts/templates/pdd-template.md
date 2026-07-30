# {{NOMBRE_PRODUCTO}} — Product Definition Document (PDD)
### Versión {{VERSION_PDD}} | Estado: {{ESTADO_DOCUMENTO}}
### Melius GO Product Operating System — Documento interno y confidencial
### Fecha: {{FECHA_VERSION}} | Autor: {{AUTOR_PDD}}

> **Naturaleza del documento:** Este PDD es la fuente única de verdad de {{NOMBRE_PRODUCTO}}. Todo documento derivado (PRD, Playbook de Ventas, Runbook de Implementación, Deck de Demo, Contrato de Servicio) debe ser consistente con las secciones en estado APROBADO. Cualquier contradicción detectada activa una revisión formal del PDD antes de proceder con el artefacto derivado.

---

## 00. Encabezado de Gobernanza del Documento

**Estado del documento:** {{ESTADO_DOCUMENTO}}

### 00.1 Control de Versiones
| Versión | Fecha | Autor | Cambios |
|---------|-------|-------|---------|
| {{VERSION_PDD}} | {{FECHA_VERSION}} | {{AUTOR_PDD}} | Versión inicial |

### 00.2 Revisores y Aprobadores
| Nombre | Rol | Estado | Fecha |
|--------|-----|--------|-------|
| [PENDIENTE — agregar revisores] | — | Pendiente | — |

### 00.3 Documentos Derivados Registrados
| Artefacto | Versión | Responsable | Última sincronización |
|-----------|---------|-------------|----------------------|
| PRD de {{NOMBRE_PRODUCTO}} | — | [PENDIENTE] | No generado |
| Playbook de Ventas | — | [PENDIENTE] | No generado |
| Runbook de Implementación | — | [PENDIENTE] | No generado |

### 00.4 Hipótesis Central del Producto
> {{HIPOTESIS_CENTRAL}}

**Criterio de falsabilidad:** Si la hipótesis es incorrecta, lo sabremos porque [completar con indicador observable].

---

## 01. Resumen Ejecutivo

**ESTADO:** {{ESTADO_DOCUMENTO}}

### 01.1 Definición del Producto
{{NOMBRE_PRODUCTO}} es [completar: qué es en una oración].

{{NOMBRE_PRODUCTO}} **no es** [completar: qué no es — consultoría, licencia de software, agencia, etc.].

### 01.2 Problema Central que Resuelve
**Jobs to Be Done principal:** {{JTBD_PRINCIPAL}}

### 01.3 Para Quién es
**ICP de una línea:** [Tipo de empresa], en {{MERCADO_OBJETIVO}}, que necesita [completar con transformación deseada].

**Dominio:** {{DOMINIO}}
**Geografía:** {{GEOGRAFIA}}

### 01.4 Decisiones Aprobadas como Línea Base
Las siguientes decisiones están aprobadas y no se reabren sin proceso formal de cambio:

1. {{NOMBRE_PRODUCTO}} es un producto [SaaS / sistema operativo / plataforma], no un servicio de consultoría.
2. El mercado inicial de operación es {{GEOGRAFIA}}.
3. El beachhead comercial prioritario es {{BEACHHEAD}}.
4. El producto incluye un componente de IA denominado {{NOMBRE_COMPONENTE_IA}}.
5. [Agregar decisiones aprobadas adicionales]

### 01.5 Naturaleza y Alcance del Documento
Este documento corresponde a la etapa **Definición de Producto** del ciclo de vida Melius GO (Idea → Discovery → Blueprint → **Product Definition** → Packaging → Pricing → Implementation → Go-To-Market → Customer Success → Optimization → Expansion).

El siguiente artefacto que se deriva de este PDD es: **PRD (Product Requirements Document) de {{NOMBRE_PRODUCTO}}**.

---

## 02. Visión, Misión, North Star y Promesa de Marca

**ESTADO:** PROPUESTA NO VALIDADA

### 02.1 Visión del Producto
[Completar: dónde queremos estar en 3-5 años, orientado al impacto en el cliente, no en la tecnología]

### 02.2 Misión del Producto
[Completar: qué hace {{NOMBRE_PRODUCTO}} hoy, para quién, y qué resultado produce]

### 02.3 North Star Metric — Evento Norte
**Estado epistémico:** PROPUESTA NO VALIDADA

**Evento Norte:** {{EVENTO_NORTE}}

*Esta métrica se eligió porque mide [razón]. Sabremos que es verdad cuando [indicador observable].*

**Mecanismo de validación:** [Completar: cómo y cuándo se valida esta métrica con clientes reales]
**Fecha de validación comprometida:** [PENDIENTE]

### 02.4 Justificación del North Star Elegido
**Alternativas consideradas y razón de descarte:**

| Métrica alternativa | Razón de descarte |
|--------------------|-------------------|
| [Alternativa 1] | [Razón] |
| [Alternativa 2] | [Razón] |

### 02.5 Promesa de Marca
**{{NOMBRE_PRODUCTO}}** [completar: qué puede esperar el cliente que siempre será verdad sobre el producto — en una oración].

### 02.6 Manifiesto de Producto *(opcional)*
[Completar: principios de identidad del producto en voz activa, si aplica]

---

## 03. Problema y Oportunidad de Mercado

**ESTADO:** PROPUESTA NO VALIDADA

### 03.1 Jobs to Be Done Principal
> Cuando [situación], necesito [motivación] para [resultado esperado].
>
> **{{JTBD_PRINCIPAL}}**

### 03.2 Jobs to Be Done Secundarios
- Cuando [situación 2], necesito [motivación 2] para [resultado 2].
- [Agregar JTBDs secundarios relevantes]

### 03.3 Dolores Actuales del Cliente
*(Consecuencias concretas de no tener el producto: económicas, operativas, de reputación)*

- [Dolor 1 — cuantificar si es posible]
- [Dolor 2]
- [Dolor 3]

### 03.4 Ganancias Esperadas con el Producto
*(Transformación deseada: qué tiene o logra el cliente que hoy no tiene)*

- [Ganancia 1]
- [Ganancia 2]
- [Ganancia 3]

### 03.5 Contexto de Mercado
*(Tendencias relevantes, tamaño de mercado, ventana de oportunidad, por qué ahora)*

**Tendencias que sostienen la oportunidad:**
1. [Tendencia 1]
2. [Tendencia 2]

**Tamaño de mercado:** *(Supuesto declarado — validar antes de usar en materiales que requieran cifras exactas)*

### 03.6 Competidores y Alternativas del Cliente
| Alternativa actual del cliente | Limitación que {{NOMBRE_PRODUCTO}} resuelve |
|-------------------------------|---------------------------------------------|
| [Competidor / solución actual 1] | [Limitación] |
| [No hacer nada] | [Costo del status quo] |

---

## 04. Definición del Cliente

**ESTADO:** PROPUESTA NO VALIDADA

### 04.1 Ideal Customer Profile — ICP
*(Supuesto declarado — validar contra cartera real en primera revisión del PDD)*

- **Industria:** [Completar]
- **Tamaño de empresa:** [Rangos de empleados / facturación]
- **Madurez digital:** [Nivel 1 / 2 / 3 — ver 04.4]
- **Geografía:** {{GEOGRAFIA}}
- **Criterios de exclusión:** [Qué tipo de empresa NO debe comprar {{NOMBRE_PRODUCTO}}]

### 04.2 Buyer Personas
**Persona 1 — [Nombre ficticio]**
- Rol: [Cargo y responsabilidades]
- Objetivos: [Qué quiere lograr]
- Dolores: [Qué le frustra hoy]
- Cómo compra: [Proceso de decisión]
- Qué lo convence: [Argumento de valor principal]

**Persona 2 — [Nombre ficticio]**
- [Completar siguiendo el mismo formato]

### 04.3 User Personas por Rol Operativo
| Rol | Necesidades críticas | Qué ve en {{NOMBRE_PRODUCTO}} |
|-----|---------------------|-------------------------------|
| Usuario final | [Completar] | [Completar] |
| Administrador | [Completar] | [Completar] |
| Tomador de decisiones | [Completar] | [Completar] |

### 04.4 Niveles de Madurez Digital del Cliente
| Nivel | Descripción | Implicación para onboarding | Capacidades de IA recomendadas |
|-------|-------------|----------------------------|-------------------------------|
| Nivel 1 — Informal | Procesos manuales, datos dispersos, sin herramientas digitales | Requiere diseño de proceso antes de tecnología | IA básica de automatización; sin personalización por falta de datos |
| Nivel 2 — Digitalización parcial | Herramientas aisladas, datos no integrados | Requiere integración y estandarización | IA de recomendación con datos existentes |
| Nivel 3 — Datos estructurados | Procesos digitales, datos integrados | Puede aprovechar IA avanzada desde el inicio | IA predictiva y analítica completa |

### 04.5 Beachhead Comercial
- **Segmento prioritario:** {{BEACHHEAD}}
- **Justificación:** [Por qué este segmento es el punto de entrada ideal]
- **Diferencia con mercado potencial total:** El mercado potencial total es [X]; el beachhead es la prioridad de go-to-market, no una limitación técnica del producto.

### 04.6 Criterios de Descalificación
El cliente NO debe comprar {{NOMBRE_PRODUCTO}} si:
- [Criterio de descalificación 1]
- [Criterio de descalificación 2]

---

## 05. Definición del Producto

**ESTADO:** PROPUESTA NO VALIDADA

### 05.1 Categoría de Producto
{{NOMBRE_PRODUCTO}} se categoriza como [categoría propia]. No es [categoría adyacente que explícitamente no es].

Esta distinción importa porque [razón estratégica de la categoría propia].

### 05.2 Posicionamiento
> Para **[ICP]** que necesitan **[trabajo a realizar]**, **{{NOMBRE_PRODUCTO}}** es el único **[categoría]** que **[diferenciador principal]** porque **[prueba del diferenciador]**.

### 05.3 Propuesta de Valor Principal
{{NOMBRE_PRODUCTO}} entrega **[resultado concreto y medible]**, no solo [descripción funcional que confunde con la categoría que no somos].

### 05.4 Propuestas de Valor por Tier
| Tier | Propuesta de valor principal |
|------|------------------------------|
| {{TIER_BASE}} | [Completar] |
| {{TIER_MEDIO}} | [Completar si aplica] |
| {{TIER_ALTO}} | [Completar si aplica] |

### 05.5 Framework Metodológico Propio *(si aplica)*
**{{FRAMEWORK_METODOLOGICO}}** — [Descripción en una oración de la metodología y su propósito].

Etapas: [Etapa 1] → [Etapa 2] → [Etapa 3] → [Etapa N]

*[Detalles completos en el Playbook de Implementación, no en este PDD]*

### 05.6 Diferenciadores vs. Competidores
| Diferenciador | Cómo lo resuelve {{NOMBRE_PRODUCTO}} | Por qué el competidor no lo replica fácilmente |
|--------------|--------------------------------------|------------------------------------------------|
| [Diferenciador 1] | [Completar] | [Completar] |
| [Diferenciador 2] | [Completar] | [Completar] |

### 05.7 Arquitectura de Producto: Sistema Base y Componente de IA
- **Sistema base:** {{NOMBRE_PRODUCTO}} Core — [descripción del sistema sin IA]
- **Componente de IA:** {{NOMBRE_COMPONENTE_IA}} — [descripción del componente de IA]
- **Relación:** {{NOMBRE_COMPONENTE_IA}} opera sobre {{NOMBRE_PRODUCTO}} Core; el sistema base funciona completamente sin el componente de IA.
- **Principio de independencia:** Si {{NOMBRE_COMPONENTE_IA}} no está disponible, {{NOMBRE_PRODUCTO}} continúa operando en modo manual con [descripción del modo fallback].

---

## 06. Principios y Casos de Uso de IA

**ESTADO:** PROPUESTA NO VALIDADA

> *Esta sección aplica porque {{NOMBRE_PRODUCTO}} incluye {{NOMBRE_COMPONENTE_IA}} como componente de inteligencia artificial. Si el producto no tuviera componente de IA, esta sección se declararía explícitamente como no aplicable.*

### 06.1 Principios de IA del Producto
Los siguientes principios gobiernan el uso de IA en {{NOMBRE_PRODUCTO}} y son no-negociables bajo el Manifiesto POS de Melius GO:

1. **La IA es habilitadora, nunca el producto en sí.** El valor de {{NOMBRE_PRODUCTO}} es el resultado del cliente, no la tecnología que lo facilita. {{NOMBRE_COMPONENTE_IA}} reduce fricción y costo operativo; no es el diferenciador de categoría.
2. **El proceso siempre tiene un modo manual.** Toda capacidad de {{NOMBRE_COMPONENTE_IA}} tiene un equivalente manual documentado que el cliente puede ejecutar sin asistencia tecnológica.
3. **Ninguna etapa del flujo depende exclusivamente de IA.** Si {{NOMBRE_COMPONENTE_IA}} no está disponible, el producto se degrada gracefully — no se detiene.
4. **La IA no toma decisiones autónomas con consecuencias económicas o legales sin aprobación humana explícita.**
5. **El cliente tiene derecho a saber cuándo interactúa con un modelo probabilístico.** La transparencia sobre la naturaleza de la IA es no-negociable en contextos de consecuencias económicas, laborales o legales.
6. **Los datos del cliente pertenecen al cliente.** No se usan para entrenar o mejorar modelos sin consentimiento explícito, base legal documentada y mecanismo de opt-out operativo.
7. **Independencia de proveedor de IA.** {{NOMBRE_COMPONENTE_IA}} se diseña para poder cambiar de proveedor de LLM en un plazo razonable sin refactoring mayor del sistema base.

### 06.2 Taxonomía de Capacidades de IA
| Capacidad | Tipo | Tier disponible | Estado |
|-----------|------|-----------------|--------|
| [Capacidad 1] | Automatización de flujo / Recomendación / Generación / Predicción | {{TIER_BASE}} | PENDIENTE |
| [Capacidad 2] | [Tipo] | {{TIER_MEDIO}} | PENDIENTE |
| [Capacidad 3] | [Tipo] | {{TIER_ALTO}} | PENDIENTE |

### 06.3 Fichas de Capacidad de IA por Caso de Uso

> *Completar una ficha por cada capacidad listada en 06.2*

**Ficha — [Nombre de la Capacidad]**
- **Tipo de IA:** [Automatización de flujo / Recomendación / Generación de contenido / Análisis predictivo]
- **Descripción:** [Qué hace esta capacidad en términos del resultado para el usuario]
- **Input del modelo:** [Qué datos recibe el modelo — campos, contexto, historial]
- **Output esperado:** [Qué produce el modelo — tipo, formato, estructura]
- **Criterio de éxito:** [Cómo medimos que el modelo funciona bien]
- **Umbral de calidad mínimo:** [Precisión mínima / tasa de error máxima / latencia máxima aceptable]
- **Comportamiento en fallo (fallback):** [Qué hace el producto si el modelo falla o está bajo umbral]
- **Proveedor de LLM asumido:** {{PROVEEDOR_LLM_PRINCIPAL}}
- **Proveedor alternativo documentado:** {{PROVEEDOR_LLM_ALTERNATIVO}}
- **Volumen mínimo de datos del cliente:** [Cantidad de datos históricos necesarios para que funcione de forma confiable]
- **Estado:** PENDIENTE

### 06.4 Comunicación de la IA al Usuario Final
- **¿El usuario sabe cuándo interactúa con IA?** [Sí / No — justificar]
- **Cómo se comunica:** [Indicador visual / texto / tooltip / notificación]
- **Política de baja confianza:** Cuando el modelo tiene confianza < [umbral], [se muestra advertencia / se suprime la sugerencia / se activa fallback].
- **Regulación aplicable en {{DOMINIO}}:** {{NORMAS_APLICABLES}}

### 06.5 Consentimiento y Uso de Datos para IA
- **Datos enviados al proveedor de LLM:** [Lista de tipos de datos — incluir si contienen datos personales]
- **Base legal de procesamiento:** [Consentimiento explícito / Interés legítimo / Ejecución de contrato] — *validar con área legal antes de aprobar esta sección*
- **¿Se usan datos para entrenamiento?** [Sí / No / Parcialmente — especificar]
- **Mecanismo de eliminación:** [Cómo el cliente puede solicitar eliminar sus datos del sistema de IA]
- **Portabilidad de datos de IA:** [Qué datos de IA puede exportar el cliente al cancelar]

### 06.6 Política de Degradación Graceful
| Escenario de fallo | Comportamiento del producto | Comunicación al usuario |
|-------------------|-----------------------------|------------------------|
| Proveedor de LLM no disponible (downtime) | [Completar] | [Completar] |
| Output bajo umbral de calidad | [Completar] | [Completar] |
| Rate limit excedido | [Completar] | [Completar] |
| Datos del cliente insuficientes | [Completar] | [Completar] |

**Modo fallback manual:** [Descripción del proceso que el cliente ejecuta sin IA cuando aplica el fallback]

### 06.7 Gobernanza de Componentes de IA
- **Versionado de prompts:** Los prompts del sistema de {{NOMBRE_COMPONENTE_IA}} se versiona en [repositorio / archivo] con el mismo ciclo de revisión que el código.
- **Proceso de cambio de proveedor de LLM:** [Quién propone / quién aprueba / criterios de evaluación / plazo estimado de migración]
- **Proceso de rollback de prompts:** [Cómo se revierte un prompt que degrada la calidad en producción]
- **Retención de datos operativos vs. entrenamiento:** [Política diferenciada de retención para cada tipo]
- **AI Decision Log:** [Qué decisiones del modelo se registran / qué campos / dónde se almacena / quién tiene acceso]

---

## 07. Arquitectura Comercial

**ESTADO:** PROPUESTA NO VALIDADA

### 07.1 Filosofía de Empaquetamiento
[Completar: lógica que determina el salto de un tier al siguiente — ¿es por madurez del cliente, por volumen, por capacidades de IA disponibles, por complejidad de implementación?]

### 07.2 Definición de Tiers
| Campo | {{TIER_BASE}} | {{TIER_MEDIO}} | {{TIER_ALTO}} |
|-------|--------------|----------------|----------------|
| **Cliente objetivo** | [Completar] | [Completar] | [Completar] |
| **Propósito** | [Completar] | [Completar] | [Completar] |
| **Valor principal** | [Completar] | [Completar] | [Completar] |
| **Límites operativos** | [Completar] | [Completar] | [Completar] |
| **Capacidades incluidas** | [Completar] | [Completar] | [Completar] |
| **Capacidades excluidas** | [Completar] | [Completar] | N/A |
| **Capacidades de IA incluidas** | [Completar — obligatorio] | [Completar — obligatorio] | [Completar — obligatorio] |
| **Precio orientativo** | [PENDIENTE] | [PENDIENTE] | [PENDIENTE] |

### 07.3 Customer Success como Capa Horizontal
**{{RESPONSABLE_SUCCESS}}** opera como capa horizontal en todos los tiers — no es un tier adicional ni una etapa post-venta. El acompañamiento mínimo de éxito está activo desde el primer día de cualquier implementación.

- **Nivel base de Success:** [Completar: revisión periódica, ajustes menores, métricas monitoreadas]
- **Nivel avanzado de Success:** [Completar: optimización activa, expansión de capacidades, acompañamiento estratégico]

### 07.4 Lógica de Upsell y Expansión
- **Desencadenante de upgrade {{TIER_BASE}} → {{TIER_MEDIO}}:** [Señal o condición del cliente que activa la conversación de upgrade]
- **Desencadenante de upgrade {{TIER_MEDIO}} → {{TIER_ALTO}}:** [Completar]
- **{{NOMBRE_COMPONENTE_IA}} como vector de upsell:** [Qué capacidad de IA del tier superior genera un resultado demostrable que justifica el precio del upgrade]

### 07.5 Frontera de Personalización Gobernada
- **Canal de personalización gobernada:** {{CANAL_PERSONALIZACION}}
- **Qué está fuera del producto estándar:** [Lista de tipos de personalización que siempre van al canal externo]
- **Quién aprueba una personalización:** [Rol / proceso]
- **Criterio de estandarización:** Una personalización puede convertirse en estándar del producto cuando [condición].

---

## 08. Alcance: Capacidades Incluidas, Exclusiones y Anti-Objetivos

**ESTADO:** PROPUESTA NO VALIDADA

### 08.1 Capacidades Incluidas en el Producto
*(Por tier — ver tabla completa en sección 07.2)*

**Resumen de capacidades confirmadas:**
- [Capacidad 1]
- [Capacidad 2]
- [Capacidad de IA 1 — indicar tier]

### 08.2 Exclusiones Temporales
*(Capacidades que no están en el producto hoy pero podrían incorporarse en el futuro)*

| Exclusión | Razón de postergación | Posible versión |
|-----------|----------------------|-----------------|
| [Exclusión 1] | [Razón] | v2.0 |
| [Exclusión 2] | [Razón] | Por definir |

### 08.3 Anti-Objetivos Permanentes
*(Capacidades o comportamientos que {{NOMBRE_PRODUCTO}} nunca tendrá, aunque haya presión comercial)*

Melius GO y {{NOMBRE_PRODUCTO}} no ofrecerán nunca:
- [Anti-objetivo 1] — *Razón de principio: [completar]*
- [Anti-objetivo 2] — *Razón de principio: [completar]*

Estas exclusiones son de categoría, no de timing. Incorporarlas diluiría la categoría que {{NOMBRE_PRODUCTO}} busca liderar.

### 08.4 Anti-Objetivos Específicos de IA
La IA en {{NOMBRE_PRODUCTO}} nunca:
- Tomará decisiones autónomas que afecten económica o legalmente al cliente sin aprobación humana explícita.
- Reemplazará el proceso documentado como fuente de valor — la IA asiste el proceso, no lo sustituye.
- [Anti-objetivo de IA adicional específico al dominio {{DOMINIO}}]

### 08.5 Integraciones Incluidas y Excluidas
| Integración | Estado | Tier | Notas |
|-------------|--------|------|-------|
| [Integración 1] | Incluida en producto estándar | {{TIER_BASE}} | — |
| [Integración 2] | Personalización gobernada | — | Vía {{CANAL_PERSONALIZACION}} |
| [Integración 3] | Fuera del alcance | — | — |

---

## 09. Modelo de Entrega y Customer Success

**ESTADO:** PROPUESTA NO VALIDADA

### 09.1 Filosofía de Implementación
[Completar: principios que guían cómo se entrega {{NOMBRE_PRODUCTO}} — secuencia obligatoria, qué no se puede saltar, por qué]

*Si el producto tiene un framework metodológico ({{FRAMEWORK_METODOLOGICO}}), la implementación sigue siempre la secuencia del framework.*

### 09.2 Responsabilidades del Cliente en la Implementación
El cliente debe:
- [Responsabilidad 1: datos, accesos, personas asignadas]
- [Responsabilidad 2]
- [Responsabilidad específica de IA: qué datos históricos debe proveer para habilitar {{NOMBRE_COMPONENTE_IA}}]

### 09.3 Responsabilidades de Melius GO en la Implementación
Melius GO es responsable de:
- [Responsabilidad 1]
- [Responsabilidad 2]
- Melius GO **no es responsable** de [completar con lo que explícitamente no asume].

### 09.4 Socios de Entrega *(si aplica)*
- **Qué puede delegar Melius GO:** [Completar]
- **Certificación requerida:** [Completar]
- **Gobernanza de calidad:** [Cómo se verifica que el socio cumple los estándares de entrega]

### 09.5 Habilitación de Socios de Entrega
*(Componente obligatorio del sistema operativo según el Manifiesto POS)*

- **Materiales de habilitación existentes:** [Lista]
- **Materiales por crear:** [Lista con fecha comprometida]
- **Proceso de certificación de partner:** [Completar o declarar PENDIENTE]

### 09.6 Customer Success como Responsabilidad del Producto
{{RESPONSABLE_SUCCESS}} rastrea activamente:
- [Métrica 1 de éxito del cliente]
- Tasa de aceptación de sugerencias de {{NOMBRE_COMPONENTE_IA}} [como señal de adopción de IA]

**Definición de cliente en riesgo:** [Completar: señales que indican baja adopción o riesgo de churn]

**Criterios de implementación completa:**
Un proyecto {{NOMBRE_PRODUCTO}} está completo cuando el cliente demuestra:
1. [Criterio verificable 1 — proceso que el cliente puede explicar sin ayuda]
2. [Criterio verificable 2 — equipo que opera sin soporte diario]
3. [Criterio verificable 3 — dashboard o reporte que el cliente consulta activamente]

### 09.7 Gestión de Personalizaciones en Entrega
Cuando un cliente solicita algo fuera del estándar durante la implementación:
1. **Registro:** [Cómo se documenta la solicitud]
2. **Evaluación:** [Quién evalúa si cae dentro del producto estándar o del canal gobernado]
3. **Escalación:** Si aplica, escala a {{CANAL_PERSONALIZACION}} con [proceso específico]

---

## 10. Modelo de Negocio

**ESTADO:** PENDIENTE — *requiere datos de pricing y costos antes de poder marcarse como APROBADO*

### 10.1 Filosofía de Pricing
*(Este PDD define la filosofía; las cifras específicas son artefactos derivados de Packaging y Pricing)*

El precio de {{NOMBRE_PRODUCTO}} debe reflejar el valor del sistema completo entregado — no el costo de horas de implementación ni el precio de las licencias tecnológicas subyacentes.

### 10.2 Fuentes de Ingreso
| Tipo de ingreso | Descripción | Recurrencia | Tier | Palanca de crecimiento |
|-----------------|-------------|-------------|------|----------------------|
| Implementación inicial | [Completar] | Único | Todos | Volumen de clientes |
| Suscripción de Success | [Completar] | Mensual / Anual | Todos | Retención y expansión |
| Upgrade de tier | [Completar] | Único + recurrente | — | Madurez del cliente |
| [Ingreso adicional] | [Completar] | [Completar] | — | [Completar] |

### 10.3 Ecuación de Rentabilidad por Tier
*(Supuesto declarado — validar con datos reales antes de aprobar)*

| Tier | Ingreso promedio / cliente | Costo de entrega estimado | Margen objetivo |
|------|---------------------------|--------------------------|-----------------|
| {{TIER_BASE}} | [PENDIENTE] | [PENDIENTE] | [PENDIENTE] |
| {{TIER_MEDIO}} | [PENDIENTE] | [PENDIENTE] | [PENDIENTE] |
| {{TIER_ALTO}} | [PENDIENTE] | [PENDIENTE] | [PENDIENTE] |

### 10.4 Expansión de Ingreso por Cliente
- **Ruta de expansión natural:** {{TIER_BASE}} → {{TIER_MEDIO}} → {{TIER_ALTO}}
- **{{NOMBRE_COMPONENTE_IA}} como palanca de upsell:** [Qué resultado demostrable de IA activa la conversación de upgrade]

### 10.5 Ciclo de Vida Económico del Cliente
- **Inversión de onboarding:** [Completar]
- **Punto de break-even:** [Completar]
- **Ingreso acumulado esperado a 12 meses:** [PENDIENTE]
- **Ingreso acumulado esperado a 24 meses:** [PENDIENTE]

### 10.6 Go-To-Market Económico
- **Canales de venta:** [Completar]
- **CAC objetivo:** [PENDIENTE]
- **LTV/CAC objetivo:** [PENDIENTE]

---

## 11. Métricas de Producto y Trazabilidad Normativa

**ESTADO:** PROPUESTA NO VALIDADA

### 11.1 North Star Metric Operacionalizada
- **Evento Norte:** {{EVENTO_NORTE}}
- **Fuente del dato:** [Sistema / herramienta donde se mide]
- **Frecuencia de medición:** [Semanal / Mensual]
- **Responsable de seguimiento:** {{RESPONSABLE_SUCCESS}}

### 11.2 KPIs por Dimensión de Éxito del Manifiesto
*(Las 4 dimensiones se miden de forma independiente — alta adopción con baja renovación es un fracaso parcial)*

| Dimensión | Métrica | Target | Frecuencia |
|-----------|---------|--------|------------|
| **Adopción real** | [Métrica de uso activo del sistema] | [Target] | Mensual |
| **Repetibilidad** | [Métrica de consistencia de entrega entre clientes] | [Target] | Trimestral |
| **Rentabilidad** | [Margen operativo por tier] | [Target] | Mensual |
| **Renovación** | [Tasa de renovación / churn rate] | [Target] | Mensual |

### 11.3 Métricas Específicas de IA
| Métrica de IA | Descripción | Target | Frecuencia |
|---------------|-------------|--------|------------|
| Tasa de aceptación de sugerencias | % de sugerencias de {{NOMBRE_COMPONENTE_IA}} que el usuario acepta | [Target] | Semanal |
| Reducción de tiempo en tarea asistida | Tiempo en tarea con IA vs. sin IA | [Target] | Mensual |
| Tasa de fallback activado | % de veces que se activa el modo manual por fallo de IA | < [Umbral]% | Diario |
| Drift de precisión en producción | Comparación de precisión del modelo en mes actual vs. mes de referencia | < [Umbral de degradación]% | Mensual |
| NPS de funcionalidades de IA | Satisfacción específica con {{NOMBRE_COMPONENTE_IA}} | [Target] | Trimestral |

### 11.4 Dashboard Operativo
- **Revisión semanal (equipo de producto):** [Métricas de adopción y fallback de IA]
- **Revisión mensual (producto + éxito del cliente):** [North Star + 4 dimensiones + métricas de IA]
- **Revisión trimestral (producto + dirección):** [Rentabilidad + renovación + evolución del roadmap]

### 11.5 Trazabilidad Normativa
*(Normas como restricciones de diseño verificables, no como consideraciones legales de último momento)*

| Norma | Jurisdicción | Implicación para {{NOMBRE_PRODUCTO}} | Estado de cumplimiento |
|-------|-------------|--------------------------------------|------------------------|
| {{NORMAS_APLICABLES}} | {{GEOGRAFIA}} | [Completar: qué decisión de diseño impone esta norma] | PENDIENTE |
| [Norma adicional] | [Jurisdicción] | [Completar] | PENDIENTE |

### 11.6 Marco de Consentimiento para Datos de IA
- **Base legal de procesamiento de datos para {{NOMBRE_COMPONENTE_IA}}:** [Completar — validar con área legal]
- **Mecanismo de consentimiento del usuario:** [Completar]
- **Política de portabilidad:** [Completar]
- **Política de eliminación:** [Completar]

---

## 12. Riesgos, Gate de Liberación y Decisiones Pendientes

**ESTADO:** PROPUESTA NO VALIDADA

### 12.1 Riesgos Generales del Producto
| Riesgo | Probabilidad | Impacto | Mitigación | Responsable | Estado |
|--------|-------------|---------|------------|-------------|--------|
| [Riesgo 1] | Alta/Media/Baja | Alto/Medio/Bajo | [Completar] | [Completar] | Activo |
| [Riesgo 2] | [P] | [I] | [Completar] | [Completar] | Activo |

### 12.2 Taxonomía de Riesgos Específicos de IA
| Riesgo de IA | Descripción para {{NOMBRE_PRODUCTO}} | Mitigación |
|-------------|--------------------------------------|------------|
| Falsos positivos con consecuencias económicas o legales | [Completar para el dominio {{DOMINIO}}] | [Completar] |
| Sesgo del modelo por patrones del beachhead {{BEACHHEAD}} | [Completar] | [Completar] |
| Dependencia de proveedor de LLM único ({{PROVEEDOR_LLM_PRINCIPAL}}) | [Completar] | Proveedor alternativo: {{PROVEEDOR_LLM_ALTERNATIVO}} |
| Degradación silenciosa de precisión en producción (drift) | [Completar] | Monitoreo continuo — ver 11.3 |
| Riesgo regulatorio por uso de datos sin consentimiento | [Completar para {{NORMAS_APLICABLES}}] | Marco de consentimiento — ver 11.6 |

### 12.3 Gate de Liberación — Criterios No-Negociables Generales
Antes de avanzar al PRD, deben cumplirse todos los criterios siguientes con evidencia verificable:

- [ ] Las Decisiones Pendientes de la sección 12.5 están todas resueltas
- [ ] El North Star Metric tiene un mecanismo de medición operativo definido
- [ ] Los criterios de implementación completa (sección 09.6) están documentados y son verificables
- [ ] La ecuación de rentabilidad por tier tiene al menos datos estimados en rangos
- [ ] [Criterio adicional específico del dominio {{DOMINIO}}]

### 12.4 Gate de Liberación — Criterios Específicos de IA
Antes de liberar cualquier capacidad de {{NOMBRE_COMPONENTE_IA}} en producción:

- [ ] Precisión mínima validada en datos reales del cliente del beachhead {{BEACHHEAD}}
- [ ] Fallback manual documentado y ejecutado conceptualmente por el equipo
- [ ] Comportamiento ante fallo del proveedor {{PROVEEDOR_LLM_PRINCIPAL}} probado
- [ ] Base legal de procesamiento de datos confirmada por área legal
- [ ] Comunicación al usuario sobre naturaleza de IA validada en interfaz por al menos [N] usuarios piloto
- [ ] Proveedor alternativo {{PROVEEDOR_LLM_ALTERNATIVO}} evaluado y con plan de migración documentado

### 12.5 Decisiones Pendientes Bloqueantes
*(Estas decisiones deben resolverse antes de que el PDD pueda marcarse como APROBADO)*

| # | Decisión pendiente | Razón del bloqueo | Responsable | Fecha comprometida |
|---|--------------------|-------------------|-------------|-------------------|
| 1 | [Decisión 1] | [Por qué bloquea el avance] | [Nombre] | [Fecha] |
| 2 | [Decisión 2] | [Completar] | [Nombre] | [Fecha] |

### 12.6 Decision Log
| Fecha | Decisión | Alternativas consideradas | Razón de la elección | Aprobador |
|-------|----------|--------------------------|----------------------|-----------|
| {{FECHA_VERSION}} | Inicio del PDD de {{NOMBRE_PRODUCTO}} | — | — | {{AUTOR_PDD}} |

---

## 13. Roadmap y Gobernanza del Producto

**ESTADO:** PROPUESTA NO VALIDADA

### 13.1 Principios de Priorización del Roadmap
*(Ordenados: cuando dos criterios entran en conflicto, el de menor número tiene prioridad)*

1. [Criterio 1 — ejemplo: impacto en el Evento Norte]
2. [Criterio 2 — ejemplo: reducción de riesgo de adopción]
3. [Criterio 3 — ejemplo: frecuencia del caso de uso entre clientes del beachhead]
4. [Criterio 4 — ejemplo: reutilización entre clientes sin rediseño]
5. [Criterio 5 — ejemplo: esfuerzo y costo de soporte]

### 13.2 Jerarquía de Desempate ante Ambigüedad
Cuando los criterios de 13.1 no dan un resultado claro, aplicar en orden:

1. ¿Esta capacidad hace {{NOMBRE_PRODUCTO}} más **repetible** entre clientes? Si no, no entra.
2. ¿Esta capacidad refuerza la **independencia de plataforma tecnológica**? Si la compromete, requiere aprobación explícita.
3. ¿Esta capacidad mantiene {{NOMBRE_PRODUCTO}} dentro de su **categoría** [categoría propia]? Si lo acerca a una categoría adyacente excluida, es un anti-objetivo.

### 13.3 Roadmap por Horizonte
| Horizonte | Capacidades comprometidas | Estado |
|-----------|--------------------------|--------|
| **H1 — próximos 90 días** | [Completar] | PENDIENTE |
| **H2 — 91 a 180 días** | [Completar] | PROPUESTA |
| **H3 — 181+ días / Visión** | [Completar] | EXPLORACIÓN |

### 13.4 Criterios de Entrada al Roadmap para Capacidades de IA
Una capacidad de {{NOMBRE_COMPONENTE_IA}} no entra al roadmap sin:
- [ ] Datos de entrenamiento disponibles o plan documentado para obtenerlos
- [ ] Umbral de calidad mínimo definido y aceptado por el equipo de producto
- [ ] Fallback manual diseñado
- [ ] Base legal de procesamiento de datos confirmada
- [ ] Proveedor de LLM evaluado con alternativa documentada

### 13.5 Gobernanza de Cambios al Producto
- **Quién puede proponer cambios al PDD:** [Roles autorizados]
- **Quién los aprueba:** [Rol con autoridad de Product Owner]
- **Proceso:** [Breve descripción del proceso de cambio]
- **Cómo se comunican a artefactos derivados:** [Completar]

### 13.6 Registro de Personalizaciones Aprobadas
*(Inventario activo de personalizaciones gobernadas — actualizar con cada nueva personalización aprobada)*

| Cliente | Personalización | Fecha de aprobación | ¿Candidata a estandarización? |
|---------|----------------|---------------------|-------------------------------|
| — | — | — | — |

---

## 14. Apéndice: Supuestos, Glosario y Documentos Derivados

### 14.1 Registro de Supuestos Generales
*(Los supuestos declarados inline en el documento se consolidan aquí para facilitar su revisión)*

| Supuesto | Sección donde se usa | Base del supuesto | Riesgo si es falso | Fecha de revisión | Estado |
|----------|---------------------|-------------------|-------------------|-------------------|--------|
| [Supuesto 1] | [Sección] | [Completar] | [Completar] | [Fecha] | No validado |
| [Supuesto de mercado cuantitativo] | 03.5 | Estimación cualitativa | Sub o sobreestimación de TAM | [Fecha] | No validado |

### 14.2 Registro de Supuestos de IA
| Capacidad de IA | Modelo de LLM asumido | Versión asumida | Tasa de error asumida | Proveedor alternativo | Fecha de validación |
|----------------|-----------------------|-----------------|----------------------|-----------------------|---------------------|
| [Capacidad 1] | {{PROVEEDOR_LLM_PRINCIPAL}} | [Versión] | [Tasa] | {{PROVEEDOR_LLM_ALTERNATIVO}} | [Fecha] |

### 14.3 Glosario del Producto
*(Términos propios de {{NOMBRE_PRODUCTO}} o del dominio {{DOMINIO}} que deben usarse de forma consistente en todos los artefactos derivados)*

| Término | Definición oficial en {{NOMBRE_PRODUCTO}} |
|---------|------------------------------------------|
| {{NOMBRE_COMPONENTE_IA}} | [Definición] |
| {{FRAMEWORK_METODOLOGICO}} | [Definición] |
| [Término del dominio 1] | [Definición] |

### 14.4 Mapa de Documentos Derivados
| Artefacto | Propósito | Responsable | Estado | Secciones del PDD que alimentan al artefacto |
|-----------|-----------|-------------|--------|----------------------------------------------|
| PRD de {{NOMBRE_PRODUCTO}} | Especificación de comportamiento funcional | [Completar] | No iniciado | 05, 06, 07, 08, 12 |
| Playbook de Ventas | Guía de venta consultiva | [Completar] | No iniciado | 01, 03, 04, 05, 07, 08 |
| Runbook de Implementación | Guía de entrega paso a paso | [Completar] | No iniciado | 05, 09 |
| Deck de Demo | Presentación comercial | [Completar] | No iniciado | 01, 03, 05, 07 |
| Plan de Pricing | Precios y empaquetamiento definitivos | [Completar] | No iniciado | 07, 10 |

### 14.5 Fuentes y Referencias
*(Normas, estudios de mercado, entrevistas de discovery, benchmarks que sustentan decisiones del PDD)*

- [Fuente 1: norma, estudio, entrevista]
- {{NORMAS_APLICABLES}}
- [Agregar fuentes adicionales]

---

*Fin del documento — {{NOMBRE_PRODUCTO}} PDD {{VERSION_PDD}}*

*Melius GO Product Operating System — Documento interno y confidencial — Propiedad intelectual de Melius Group*
