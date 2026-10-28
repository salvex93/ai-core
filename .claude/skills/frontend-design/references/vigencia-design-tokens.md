# Vigencia del estandar de design tokens (DTCG)

### Verificar antes de usar, no asumir por analogia

El nombre "Tokens W3C" es impreciso y no debe repetirse sin la aclaracion: la especificacion vive en el **Design Tokens Community Group (DTCG)**, un Community Group de W3C, no en el W3C Standards Track. Verificado contra fuente oficial 2026-08-03 (`w3.org/community/design-tokens`, `designtokens.org`): la especificacion alcanzo su primera version estable **2025.10** el 28 de octubre de 2025, respaldada por 24+ organizaciones (Adobe, Google, Meta, Figma). Sigue evolucionando como living draft en `designtokens.org/TR/drafts` — no esta congelada, y una version futura puede cambiar el formato de `$value`/`$type` usado en los ejemplos de este archivo.

**Antes de declarar cualquier version o capacidad del spec de tokens como vigente:**
- Confirmar contra `designtokens.org/tr/` (spec) o `w3.org/community/design-tokens` (anuncios), nunca solo contra un blog de terceros o un curso.
- Si la version citada en este archivo (2025.10) ya fue reemplazada, actualizar el numero de version Y revisar si el formato JSON de ejemplo del Modulo 2 sigue siendo compatible antes de reusarlo — no asumir que un token nuevo sigue el mismo `$type` que la version anterior.

### Prohibido — afirmaciones de vigencia sin verificar

- Citar "estandar W3C" sin la aclaracion de Community Group vs Standards Track — confunde el nivel de formalidad real del spec ante un cliente o equipo tecnico.
- Declarar que una herramienta (Figma, Style Dictionary, Tokens Studio) "soporta el spec DTCG" sin verificar la version exacta que soporta esa herramienta en el momento del proyecto — el soporte de tooling va detras del spec y varia por version.
- Congelar el paradigma estetico (tabla de la Declaracion de Identidad Visual) o el vocabulario de motion como si fueran definitivos — son un punto de partida 2026, no un techo; un paradigma nuevo que aparezca despues de esta fecha se evalua con el mismo criterio anti-plantilla, no se descarta por no estar en la tabla.

### Gate de vigencia — medible, no solo declarativo

| Verificacion | Umbral | Metodo |
|---|---|---|
| Version de spec DTCG citada en handoff | Coincide con la version actual en `designtokens.org/tr/` al momento de la entrega | WebFetch a `designtokens.org/tr/` antes de finalizar el design system |
| Antiguedad de la ultima verificacion de vigencia registrada en este archivo | <= 90 dias antes de iniciar un design system nuevo | Comparar fecha de este modulo contra la fecha del proyecto |
| Herramienta de tokens propuesta al cliente | Confirmada como activa (ultimo commit/release < 12 meses) | Revisar changelog o releases del repositorio oficial de la herramienta |
