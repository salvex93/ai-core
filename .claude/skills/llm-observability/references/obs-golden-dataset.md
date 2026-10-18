## Protocolo de Promocion de Traza a Golden Dataset

Las trazas de produccion son la fuente mas valiosa de casos reales para el golden dataset del skill `llm-evals`. Este protocolo define como promover una traza a item del dataset sin romper el protocolo de revision humana obligatorio.

Condiciones de seleccion de una traza candidata:

- La traza exhibe un output inesperadamente bueno que el sistema deberia reproducir de forma consistente.
- La traza exhibe una alucinacion o fallo de calidad documentado, util como caso de fallo esperado en el dataset.
- La traza cubre un caso de uso critico no representado en el golden dataset actual.

Proceso de promocion:

1. Localizar la traza en la plataforma de observabilidad usando su `trace_id`.
2. Extraer los campos: `input.usuario`, `input.contexto` (chunks RAG si aplica), `output` generado, modelo, version de prompt.
3. Crear un item candidato con estado `revisor: pendiente`. El campo `origen_traza` vincula el item a la traza de produccion original.
4. Un revisor humano aprueba o rechaza el candidato: valida el `ground_truth` (si el output fue bueno) o documenta el fallo (si fue un caso negativo).
5. Una vez aprobado, el item se incorpora al golden dataset con `revisor` actualizado y la fecha de `ultima_revision`.

Estructura del item promovido desde una traza:

```json
{
  "id": "eval-from-trace-001",
  "categoria": "resumen_contrato",
  "input": {
    "usuario": "Resume las clausulas de penalizacion",
    "contexto": ["...chunk recuperado 1...", "...chunk recuperado 2..."]
  },
  "ground_truth": "El contrato establece una penalizacion del 10% del valor total.",
  "criterios": ["cita al menos una clausula con porcentaje", "no introduce terminos no presentes en el contexto"],
  "umbral_minimo": 0.80,
  "ultima_revision": "2026-03-28",
  "revisor": "pendiente",
  "origen_traza": "trace_abc123_prod_2026-03-28"
}
```

El campo `origen_traza` es auditoria: permite rastrear de que sesion real provino el caso y comparar el output original del sistema contra las ejecuciones futuras del eval. Sin este campo, la trazabilidad entre produccion y el dataset de evaluacion se pierde.
