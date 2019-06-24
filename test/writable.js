'use strict';

const metatests = require('metatests');
const { Writable } = require('..');

const {
  StreamDestroyedError,
  StreamWriteAfterEndError,
} = require('./../lib/errors');

const createStream = highWaterMark => {
  const writeBuffer = [];
  const stream = new Writable({
    highWaterMark,
    write: (chunk, cb) => {
      if (typeof chunk === 'string') chunk = Buffer.from(chunk);
      writeBuffer.push(chunk);
      cb();
    },
  });
  return [stream, writeBuffer];
};

metatests.testSync('Writable / write', test => {
  const [stream, writeBuffer] = createStream(5);

  stream.write('12');
  stream.write('3456');
  stream.write(Buffer.from('789'));

  const expectedBuffer = Buffer.from('123456789');
  const currentBuffer = Buffer.concat(writeBuffer);

  test.strictSame(currentBuffer, expectedBuffer);
});

metatests.testSync('Writable / cork', test => {
  const [stream, writeBuffer] = createStream(5);

  stream.cork();
  stream.write('12');

  const expectedBuffer = Buffer.from('');
  const currentBuffer = Buffer.concat(writeBuffer);

  test.strictSame(currentBuffer, expectedBuffer);
});

metatests.testSync('Writable / cork and uncork ', test => {
  const [stream, writeBuffer] = createStream(5);

  stream.cork();
  stream.cork();

  stream.write('12');
  stream.write('3456');

  stream.uncork();

  {
    const expectedBuffer = Buffer.from('');
    const currentBuffer = Buffer.concat(writeBuffer);

    test.strictSame(currentBuffer, expectedBuffer);
  }

  stream.uncork();

  {
    const expectedBuffer = Buffer.from('123456');
    const currentBuffer = Buffer.concat(writeBuffer);

    test.strictSame(currentBuffer, expectedBuffer);
  }
});

metatests.testSync('Writable / end', test => {
  test.plan(2);

  const [stream, writeBuffer] = createStream(5);

  stream.on('error', err => {
    test.isError(err, new StreamWriteAfterEndError());
  });

  stream.write('12');
  stream.end('3456');
  stream.write('789');

  const expectedBuffer = Buffer.from('123456');
  const currentBuffer = Buffer.concat(writeBuffer);

  test.strictSame(currentBuffer, expectedBuffer);
});

metatests.testSync('Writable / destroy', test => {
  const [stream] = createStream(5);

  stream.on('error', err => {
    test.isError(err, new StreamDestroyedError());
  });

  stream.destroy();
  stream.write('789');
});

metatests.test('Writable/ end-finish', test => {
  const [stream] = createStream();

  stream.end(() => test.end());
});
