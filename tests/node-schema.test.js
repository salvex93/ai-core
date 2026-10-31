const test = require('node:test');
const assert = require('node:assert');
const { SemanticNodeSchema } = require('../dist/schemas/node.schema.js');

const nodoValido = {
  nid: 'auth_token_01',
  domain: 'SEC',
  invariant: 'El token expira en menos de 15 minutos',
  dependencies: ['session_store'],
  source: 'src/auth/token.ts'
};

test('acepta un nodo semantico valido', () => {
  const resultado = SemanticNodeSchema.safeParse(nodoValido);
  assert.strictEqual(resultado.success, true);
});

test('rechaza nid fuera del patron, dominio invalido e invariante corta', () => {
  const casos = [
    { ...nodoValido, nid: 'NID-Invalido' },
    { ...nodoValido, domain: 'OTRO' },
    { ...nodoValido, invariant: 'corta' },
    { ...nodoValido, source: '' }
  ];
  for (const caso of casos) {
    assert.strictEqual(SemanticNodeSchema.safeParse(caso).success, false);
  }
});
