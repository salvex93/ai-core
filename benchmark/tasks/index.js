'use strict';
const ids = ['bugfix-paginate', 'feature-lru', 'refactor-rename', 'log-analysis', 'security-sqli', 'multifile-config'];

// Orden fijo para que las corridas sean comparables entre arneses
module.exports = ids.map((id) => require(`./${id}`));
