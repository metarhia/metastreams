// Copyright Node.js contributors. All rights reserved.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.

'use strict';

const fs = require('fs');

const { Writable } = require('./writable');

const { InvalidArgTypeError, OutOfRangeError } = require('./errors');

const openSymbol = Symbol('open');
const closeStreamSymbol = Symbol('closeStream');

class WritableFileStream extends Writable {
  constructor(
    path,
    {
      fd = null,
      start,
      flags = 'w',
      bufferSize,
      mode = 0o666,
      encoding = null,
      autoClose = true,
    } = {}
  ) {
    super({ bufferSize });

    this.fd = fd;
    this.path = path;

    this.closed = false;
    this.bytesWritten = 0;

    this.autoClose = autoClose;

    if (typeof path !== 'string') {
      throw new InvalidArgTypeError('path', 'string', path);
    }

    if (start !== undefined) {
      if (typeof start !== 'number') {
        throw new InvalidArgTypeError('start', 'number', start);
      }
      if (start < 0) {
        throw new OutOfRangeError('start', '>= 0', `{start: ${start}}`);
      }

      this.pos = start;
    }

    if (encoding) this.setDefaultEncoding(encoding);

    if (this.fd === null) this[openSymbol](flags, mode);
  }

  [openSymbol](flags, mode) {
    fs.open(this.path, flags, mode, (error, fd) => {
      if (error) {
        this.emit('error', error);
        this.emit('close');
        return;
      }

      this.fd = fd;
      this.emit('open', fd);
    });
  }

  [closeStreamSymbol](err, callback) {
    fs.close(this.fd, er => {
      er = er || err;
      this.fd = null;
      this.closed = true;
      if (callback) callback(er);
      if (er) this.emit('error', er);
      this.emit('close');
    });
  }

  _write(data, callback) {
    if (!Buffer.isBuffer(data)) {
      const err = new InvalidArgTypeError('data', 'Buffer', data);
      this.emit('error', err);
      return;
    }

    if (this.fd === null) {
      this.once('open', () => this._write(data, callback));
      return;
    }

    fs.write(this.fd, data, 0, data.length, this.pos, (error, bytes) => {
      if (error) {
        if (callback) callback(error);

        if (!this.ended) {
          if (this.autoClose) {
            this.destroy(error);
          } else {
            this.emit('error', error);
            this.emit('close');
          }
        }
        return;
      }
      this.bytesWritten += bytes;
      if (callback) callback();
    });

    if (this.pos !== undefined) this.pos += data.length;
  }

  _destroy(err, callback) {
    if (this.fd === null) {
      this.once('open', () => this[closeStreamSymbol](err, callback));
      return;
    }
    this[closeStreamSymbol](err, callback);
  }

  _final(callback) {
    if (this.autoClose) this.destroy();
    callback();
  }
}

module.exports = { WritableFileStream };
