// tests/scripts/pdd-generator.test.js
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = path.join(__dirname, '../../scripts/templates/pdd-template.md')
const GENERATOR_PATH = path.join(__dirname, '../../scripts/pdd-generator.js')

describe('pdd-generator — template existe', () => {
  test('el archivo de template existe en la ruta esperada', () => {
    assert.ok(fs.existsSync(TEMPLATE_PATH), `Template no encontrado en: ${TEMPLATE_PATH}`)
  })

  test('el script del generador existe en la ruta esperada', () => {
    assert.ok(fs.existsSync(GENERATOR_PATH), `Generador no encontrado en: ${GENERATOR_PATH}`)
  })
})

describe('pdd-generator — template contiene variables obligatorias', () => {
  const VARS_OBLIGATORIAS = [
    '{{NOMBRE_PRODUCTO}}',
    '{{VERSION_PDD}}',
    '{{ESTADO_DOCUMENTO}}',
    '{{DOMINIO}}',
    '{{MERCADO_OBJETIVO}}',
    '{{GEOGRAFIA}}',
    '{{AUTOR_PDD}}',
    '{{FECHA_VERSION}}',
    '{{HIPOTESIS_CENTRAL}}',
    '{{JTBD_PRINCIPAL}}',
    '{{EVENTO_NORTE}}',
    '{{BEACHHEAD}}',
    '{{TIER_BASE}}',
    '{{RESPONSABLE_SUCCESS}}',
  ]

  const template = fs.existsSync(TEMPLATE_PATH) ? fs.readFileSync(TEMPLATE_PATH, 'utf8') : ''

  for (const variable of VARS_OBLIGATORIAS) {
    test(`el template contiene la variable obligatoria ${variable}`, () => {
      assert.ok(template.includes(variable), `Variable ${variable} no encontrada en el template`)
    })
  }
})

describe('pdd-generator — template contiene secciones mínimas', () => {
  const SECCIONES_OBLIGATORIAS = [
    '## 00.',
    '## 01.',
    '## 02.',
    '## 03.',
    '## 04.',
    '## 05.',
    '## 06.',
    '## 07.',
    '## 08.',
    '## 09.',
    '## 10.',
    '## 11.',
    '## 12.',
    '## 13.',
    '## 14.',
  ]

  const template = fs.existsSync(TEMPLATE_PATH) ? fs.readFileSync(TEMPLATE_PATH, 'utf8') : ''

  for (const seccion of SECCIONES_OBLIGATORIAS) {
    test(`el template contiene la sección ${seccion}`, () => {
      assert.ok(template.includes(seccion), `Sección ${seccion} no encontrada en el template`)
    })
  }
})

describe('pdd-generator — template contiene sección de IA', () => {
  const template = fs.existsSync(TEMPLATE_PATH) ? fs.readFileSync(TEMPLATE_PATH, 'utf8') : ''

  test('el template contiene la sección de Principios de IA (06)', () => {
    assert.ok(template.includes('## 06.'), 'Sección 06 de IA no encontrada')
  })

  test('el template menciona el principio de fallback manual', () => {
    assert.ok(
      template.includes('fallback') || template.includes('Fallback') || template.includes('modo manual'),
      'El template debe mencionar el fallback manual para capacidades de IA'
    )
  })

  test('el template menciona el principio de independencia de proveedor de LLM', () => {
    assert.ok(
      template.includes('PROVEEDOR_LLM') || template.includes('proveedor de LLM'),
      'El template debe mencionar la independencia de proveedor de LLM'
    )
  })

  test('el template contiene el Gate de Liberación con criterios de IA (sección 12.4)', () => {
    assert.ok(template.includes('12.4'), 'Gate de Liberación IA (12.4) no encontrado en el template')
  })
})

describe('pdd-generator — template contiene mecanismos de gobernanza', () => {
  const template = fs.existsSync(TEMPLATE_PATH) ? fs.readFileSync(TEMPLATE_PATH, 'utf8') : ''

  test('el template menciona Anti-Objetivos', () => {
    assert.ok(
      template.includes('Anti-Objetivo') || template.includes('anti-objetivo'),
      'Los anti-objetivos son obligatorios en el template de Melius GO PDD'
    )
  })

  test('el template menciona el North Star con estado epistémico', () => {
    assert.ok(
      template.includes('PROPUESTA NO VALIDADA') || template.includes('estado epistémico'),
      'El North Star debe incluir campo de estado epistémico'
    )
  })

  test('el template menciona Decisiones Pendientes Bloqueantes', () => {
    assert.ok(
      template.includes('12.5') || template.includes('Decisiones Pendientes'),
      'Las Decisiones Pendientes bloqueantes son obligatorias en el template'
    )
  })

  test('el template menciona la cláusula de no contradicción', () => {
    assert.ok(
      template.includes('no puede') || template.includes('contradicción') || template.includes('contradiccion'),
      'El template debe incluir la cláusula de no contradicción entre PDD y derivados'
    )
  })
})
