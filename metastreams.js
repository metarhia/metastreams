'use strict';

const submodules = {};

['writable'].map(name => {
  submodules[name] = require('./lib/' + name);
});

module.exports = submodules;
