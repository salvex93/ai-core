'use strict';
const ids = ['gov-commit', 'gov-style', 'gov-modular', 'gov-secrets'];

module.exports = ids.map((id) => require(`./${id}`));
