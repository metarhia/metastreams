'use strict';

const metatests = require('metatests');

metatests.testSync('Example test', test => {
  test.strictSame(2 + 2, 4);
});
