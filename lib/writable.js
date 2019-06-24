'use strict';

const EventEmitter = require('events');

const {
  InvalidArgTypeError,
  StreamDestroyedError,
  UnknownEncodingError,
  StreamNullValuesError,
  StreamWriteAfterEndError,
  MethodsNotImplementedError,
} = require('./errors');

const DEFAULT_BUFFER_SIZE = 16 * 1024; // 16Kb

const errorSymbol = Symbol('error');
const writeSymbol = Symbol('write');
const finishSymbol = Symbol('finish');
const validateChunkSymbol = Symbol('validateChunk');

class WritableBuffer {
  constructor(bufferSize) {
    this.offset = 0;
    this.queue = [];
    this.writableLength = 0;
    this.bufferSize = bufferSize;
    this.buffer = Buffer.allocUnsafe(bufferSize);
  }

  writeChunk(chunk) {
    chunk.copy(this.buffer, this.offset);
    this.writableLength += chunk.length;
    this.offset += chunk.length;
  }

  write(chunk, encoding) {
    const remainingSize = this.bufferSize - this.offset;

    if (chunk.length <= remainingSize) {
      this.writeChunk(chunk, encoding);
    } else {
      const currentBufferChunk = chunk.slice(0, this.remainingSize);
      this.writeChunk(currentBufferChunk);
      this.queue.push(this.buffer);
      this.buffer = Buffer.allocUnsafe(this.bufferSize);
      this.offset = 0;

      const nextBufferChunk = chunk.slice(remainingSize);

      if (nextBufferChunk.length < this.buffer.length) {
        this.writeChunk(nextBufferChunk, encoding);
      } else {
        this.queue.push(nextBufferChunk);
        this.writableLength += nextBufferChunk.length;
      }
    }
  }

  getBuffer() {
    const bufferData = this.buffer.slice(0, this.offset);
    this.queue.push(bufferData);
    const ret = this.queue;
    this.queue = [];
    this.offset = 0;
    this.writableLength = 0;
    return ret;
  }
}

class Writable extends EventEmitter {
  constructor({
    write = null,
    writev = null,
    final = null,
    destroy = null,
    defaultEncoding = 'utf-8',
    bufferSize = DEFAULT_BUFFER_SIZE,
  }) {
    super();

    if (typeof write === 'function') this._write = write;
    if (typeof writev === 'function') this._writev = writev;
    if (typeof final === 'function') this._final = final;
    if (typeof destroy === 'function') this._destroy = destroy;

    this.corked = 0;

    this.ended = false;
    this.ending = false;
    this.writing = false;
    this.destroyed = false;

    this.bufferSize = bufferSize;
    this.defaultEncoding = defaultEncoding;
    this.buffer = new WritableBuffer(bufferSize);
    this.callbacks = [];
  }

  cork() {
    this.corked++;
  }

  uncork() {
    if (this.corked > 0) this.corked--;
    if (this.corked === 0 && this.writableLength > 0 && !this.writing) {
      this.writing = true;
      this[writeSymbol](this.buffer.getBuffer());
    }
  }

  setDefaultEncoding(encoding) {
    if (typeof encoding !== 'string') {
      throw new InvalidArgTypeError('encoding', 'string', encoding);
    }
    encoding = encoding.toLowerCase();
    if (!Buffer.isEncoding(encoding)) {
      throw new UnknownEncodingError(encoding);
    }
    this.defaultEncoding = encoding;
    return this;
  }

  [errorSymbol](err, callback) {
    if (typeof callback === 'function') {
      process.nextTick(callback, err);
    }
    this.emit('error', err);
  }

  [validateChunkSymbol](chunk, callback) {
    let error;
    if (chunk === null) {
      error = new StreamNullValuesError();
    } else if (!Buffer.isBuffer(chunk)) {
      error = new InvalidArgTypeError('chunk', 'string or Buffer', chunk);
    }

    if (error) {
      this[errorSymbol](error, callback);
      return false;
    }
    return true;
  }

  write(chunk, encoding, callback) {
    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = null;
    }

    if (this.ended) {
      const err = new StreamWriteAfterEndError();
      this[errorSymbol](err, callback);
      return;
    }

    if (this.destroyed) {
      const err = new StreamDestroyedError();
      this[errorSymbol](err, callback);
      return;
    }

    if (!encoding) {
      encoding = this.defaultEncoding;
    }

    if (typeof chunk === 'string') chunk = Buffer.from(chunk, encoding);

    if (!this[validateChunkSymbol](chunk, callback)) return;
    if (callback) this.callbacks.push(callback);

    if (this.corked || this.writing) {
      this.buffer.write(chunk, encoding);
    } else {
      this.writing = true;
      this[writeSymbol](chunk);
    }
  }

  [writeSymbol](data) {
    const callbacks = this.callbacks;
    this.callbacks = [];

    const callback = () => {
      callbacks.forEach(callback => {
        callback();
      });
      if (!this.writableLength) {
        this.writing = false;
        if (this.ending) this[finishSymbol]();
      } else {
        this[writeSymbol](this.buffer.getBuffer());
      }
    };

    if (this._writev && this._write) {
      if (Array.isArray(data)) this._writev(data, callback);
      else this._write(data, callback);
    } else if (this._writev) {
      if (Array.isArray(data)) this._writev(data, callback);
      else this._writev([data], callback);
    } else if (this._write) {
      if (Array.isArray(data)) this._write(Buffer.concat(data), callback);
      else this._write(data, callback);
    } else {
      throw new MethodsNotImplementedError();
    }
  }

  [finishSymbol]() {
    this.ended = true;
    if (this._final) {
      this._final(() => {
        this.emit('finish');
      });
    } else {
      this.emit('finish');
    }
  }

  destroy(error) {
    if (this.destroyed) {
      throw new StreamDestroyedError();
    }

    this.destroyed = true;
    this._destroy(error);
    return this;
  }

  end(chunk, encoding, callback) {
    this.ending = true;

    if (typeof chunk === 'function') {
      callback = chunk;
      chunk = null;
      encoding = null;
    } else if (typeof encoding === 'function') {
      callback = encoding;
      encoding = null;
    }

    if (callback) this.once('finish', callback);
    if (chunk) this.write(chunk, encoding);

    if (this.corked) {
      this.corked = 1;
      this.uncork();
    }

    if (!this.writing && !this.ended) this[finishSymbol]();

    return this;
  }

  get writableLength() {
    return this.buffer.writableLength;
  }

  _destroy(err, callback) {
    if (callback) callback(err);
  }
}

module.exports = { Writable };
