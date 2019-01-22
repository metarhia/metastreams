'use strict';

const submodules = ['fs-writable', 'writable'].map(path =>
  require('./lib/' + path)
);

module.exports = Object.assign({}, ...submodules);
