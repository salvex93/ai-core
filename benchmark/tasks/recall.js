'use strict';

// Turnos de solo lectura que dependen de lo hecho antes en la misma sesion
const NO_EDIT = 'Sin editar ningun archivo, responde en una o dos frases: ';

const recall = (id, question, pattern, referenceText) => ({
  id,
  category: 'sesion',
  prompt: NO_EDIT + question,
  build: () => {},
  verify: (dir, usage) => ({ pass: pattern.test((usage && usage.text) || ''), detail: 'respuesta de recuerdo' }),
  referenceText,
  reference: () => {},
});

module.exports = [
  recall('recall-sqli', 'que vulnerabilidad corregiste en repo.js y como?', /sql|inyecci|parametr|prepar/i, 'Una inyeccion SQL, con consulta parametrizada.'),
  recall('recall-log', 'que codigo de error identificaste en el log que analizaste?', /ERR-7741/, 'El codigo ERR-7741.'),
  recall('recall-files', 'que archivos de codigo (no tests) modificaste o creaste en esta sesion?', /(?=[\s\S]*paginate)(?=[\s\S]*lru)/i, 'paginate.js y lru.js, entre otros.'),
  recall('recall-lru', 'que estructura de datos usaste para implementar LruCache?', /map|lista|diccionario|objeto/i, 'Un Map para el orden de uso.'),
  recall('recall-tests', 'cuantos archivos de prueba se tocaron o ejecutaron en esta sesion y cuales?', /\.test\.js/i, 'paginate.test.js y lru.test.js.'),
  recall('recall-last', 'cual fue el ultimo cambio de codigo que hiciste antes de esta pregunta?', /\S{10,}/, 'Movi la configuracion a un modulo comun.'),
];
