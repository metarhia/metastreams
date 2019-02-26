'use strict';

const fs = require('fs');
const path = require('path');

const { InvalidArgTypeError, OutOfRangeError } = require('./../lib/errors');

const metatests = require('metatests');
const { WritableFileStream } = require('..');

metatests.testSync('fs-writable / create', test => {
  const TEST_FILENAME = path.join(__dirname, 'create-test');

  new WritableFileStream(TEST_FILENAME);

  test.throws(
    () => new WritableFileStream(),
    new InvalidArgTypeError('path', 'string', undefined)
  );
  test.throws(
    () => new WritableFileStream(1),
    new InvalidArgTypeError('path', 'string', 1)
  );
  test.throws(
    () => new WritableFileStream(true),
    new InvalidArgTypeError('path', 'string', true)
  );

  test.throws(
    () => new WritableFileStream(TEST_FILENAME, { start: -1 }),
    new OutOfRangeError('start', '>= 0', '{start: -1}')
  );

  fs.unlinkSync(TEST_FILENAME);
});

metatests.test('fs-writable / open', test => {
  const TEST_FILENAME = path.join(__dirname, 'open-test');

  test.plan(1);

  const stream = new WritableFileStream(TEST_FILENAME);
  stream.on('open', () => test.pass('open'));

  test.on('done', () => fs.unlinkSync(TEST_FILENAME));
});

metatests.test('fs-writable / open with error', test => {
  const INVALID_TEST_FILENAME = __dirname;

  const stream = new WritableFileStream(INVALID_TEST_FILENAME);
  stream.on(
    'error',
    test.mustCall(error => {
      test.strictSame(error.errno, -21);
      test.end();
    })
  );
});

metatests.test('fs-writable / write', test => {
  const TEST_FILENAME = path.join(__dirname, './write');

  test.plan(1);

  const stream = new WritableFileStream(TEST_FILENAME);

  stream.write('123');
  stream.write('456');
  stream.cork();
  stream.write('7');
  stream.write('8');
  stream.uncork();
  stream.end('9', () => {
    const writeData = fs.readFileSync(TEST_FILENAME).toString();
    fs.unlinkSync(TEST_FILENAME);
    test.strictSame(writeData, '123456789');
  });
});
