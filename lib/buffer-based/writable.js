'use strict';

const common = require('metarhia-common');

const Stream = require('stream');

const Writable = function(options) {
  if (!(this instanceof Writable)) return new Writable(options);
  Stream.Writable.call(this, options);

  delete this._writableState.bufferedRequest;
  delete this._writableState.bufferedRequestCount;
  delete this._writableState.lastBufferedRequest;
  delete this._writableState.corkedRequestsFree;

  this._writableState.internalBuffer = Buffer.alloc(this._writableState.highWaterMark);
  this._writableState.bufferOffset = 0;
  this._writableState.callbacks = [];

  this._writableState.onwrite = onwrite.bind(undefined, this);

};

common.inherits(Writable, Stream.Writable);

Writable.prototype.write = function(chunk, encoding, callback) {
  const state = this._writableState;
  const isBuffer = !state.objectMode && Stream._isUint8Array(chunk);

  if (isBuffer && Object.getPrototypeOf(chunk) !== Buffer.prototype) {
    chunk = Stream._uint8ArrayToBuffer(chunk);
  }

  if (typeof encoding === 'function') {
    callback = encoding;
    encoding = null;
  }

  if (isBuffer) {
    encoding = 'buffer';
  } else if (!encoding) {
    encoding = state.defaultEncoding;
  }

  if (typeof callback !== 'function') {
    callback = function() {};
  }

  if (state.ending) {
    writeAfterEnd(this, callback);
    return false;
  }

  if (isBuffer || isChunkValid(this, state, chunk, callback)) {
    state.pendingcb++;
    return writeOrBuffer(this, state, isBuffer, chunk, encoding, callback);
  }

  return false;
};

Writable.prototype.end = function(chunk, encoding, callback) {
  const state = this._writableState;

  if (typeof chunk === 'function') {
    callback = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    callback = encoding;
    encoding = null;
  }

  if (chunk !== null && chunk !== undefined)
    this.write(chunk, encoding);

  if (state.corked) {
    state.corked = 1;
    this.uncork();
  }

  if (!state.ending) {
    endWritable(this, state, callback);
  }

  return this;
};

Writable.prototype.cork = function() {
  this._writableState.corked++;
};

Writable.prototype.uncork = function() {
  const state = this._writableState;

  if (state.corked) {
    state.corked--;

    if (
      !state.writing &&
      !state.corked &&
      !state.bufferProcessing &&
      state.bufferOffset
    ) {
      clearBuffer(this, state);
    }
  }
};

Writable.prototype.pipe = function() {
  this.emit('error', new Error('Cannot pipe, not readable'));
};

// internal functions

const writeAfterEnd = (stream, callback) => {
  const error = new Error('write after end');

  stream.emit('error', error);
  process.nextTick(callback, error);
};

function isChunkValid(stream, state, chunk, callback) {
  let error;

  if (chunk === null) {
    error = new Error('May not write null values to stream');
  } else if (typeof chunk !== 'string' && !state.objectMode) {
    error = new Error('Chunk must be an instance of Buffer or string');
  } else if (
    state.objectMode &&
    (typeof chunk.valueOf !== 'function' || (chunk.valueOf && chunk.valueOf() === chunk)) &&
    typeof chunk[Symbol.toPrimitive] !== 'function'
  ) {
    error = new Error('Object has to have \'valueOf()\' or \'[Symbol.toPrimitive]()\' methods');
  }
  if (error) {
    stream.emit('error', error);
    process.nextTick(callback, error);
    return false;
  }

  return true;
};

const writeOrBuffer = (stream, state, isBuffer, chunk, encoding, callback) => {
  if (!isBuffer) {
    const newChunk = decodeChunk(state, chunk, encoding);

    if (chunk !== newChunk) {
      isBuffer = true;
      encoding = 'buffer';
      chunk = newChunk;
    }
  }

  const length = state.objectMode ? 1 : chunk.length;
  state.length += length;

  let ret =
    state.length < state.highWaterMark &&
    state.bufferOffset + Buffer.from(chunk).length < state.internalBuffer.length;

  if (!ret) {
    state.needDrain = true;
  }

  if (state.writing || state.corked) {
    if (Buffer.from(chunk).length >= state.internalBuffer.length) {
      if (state.bufferOffset) {
        doWrite(
          stream,
          state,
          !!stream._writev,
          length,
          Buffer.alloc(state.bufferOffset, state.internalBuffer),
          encoding,
          (error, data) => {
            state.callbacks.forEach((cb) => {
              state.pendingcb--;
              cb(error, data);
            });
            state.callbacks = [];
          }
        );
      }
      doWrite(stream, state, false, length, chunk, encoding, callback);
      state.bufferOffset = 0;
    } else if (state.bufferOffset + Buffer.from(chunk).length >= state.internalBuffer.length) {
      doWrite(
        stream,
        state,
        !!stream._writev,
        length,
        Buffer.alloc(state.bufferOffset, state.internalBuffer),
        encoding,
        (error, data) => {
          state.callbacks.forEach((cb) => {
            state.pendingcb--;
            cb(error, data);
          });
          state.callbacks = [];
        }
      );
      Buffer.from(chunk).copy(state.internalBuffer);
      state.bufferOffset = Buffer.from(chunk).length;
      state.callbacks.push(callback);
    } else {
      Buffer.from(chunk).copy(state.internalBuffer, state.bufferOffset);
      state.bufferOffset += Buffer.from(chunk).length;
      state.callbacks.push(callback);
    }
  } else {
    doWrite(stream, state, false, length, chunk, encoding, callback);
  }

  return ret;
};

const doWrite = (stream, state, writev, length, chunk, encoding, callback) => {
  state.writelen = length;
  state.writecb = callback;
  state.writing = true;
  state.sync = true;

  if (state.destroyed) {
    state.onwrite(new Error('Cannot call write after a stream was destroyed'));
  } else if (writev) {
    stream._writev(chunk, state.onwrite);
  } else {
    stream._write(chunk, encoding, state.onwrite);
  }

  state.sync = false;
};

const onwrite = (stream, error) => {
  const state = stream._writableState;
  const sync = state.sync;
  const callback = state.writecb;

  if (typeof callback !== 'function') {
    throw new Error('Callback called multiple times');
  }

  onwriteStateUpdate(state);

  if (error) {
    onwriteError(stream, state, sync, error, callback);
  } else {
    const finished = needFinish(state);

    if (
      !finished &&
      !state.corked &&
      !state.bufferProcessing &&
      state.bufferOffset
    ) {
      clearBuffer(stream, state);
    }

    if (sync) {
      process.nextTick(afterWrite, stream, state, finished, callback);
    } else {
      afterWrite(stream, state, finished, callback);
    }
  }
};

const onwriteError = (stream, state, sync, error, callback) => {
  --state.pendingcb;

  if (sync) {
    process.nextTick(callback, error);
    process.nextTick(finishMaybe, stream, state);
    stream._writableState.errorEmitted = true;
    stream.emit('error', error);
  } else {
    callback(error);
    stream._writableState.errorEmitted = true;
    stream.emit('error', error);
    finishMaybe(stream, state);
  }
};

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
};

const afterWrite = (stream, state, finished, callback) => {
  if (!finished) {
    onwriteDrain(stream, state);
  }

  state.pendingcb--;
  callback();
  finishMaybe(stream, state);
};

const onwriteDrain = (stream, state) => {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
};

const clearBuffer = (stream, state) => {
  state.bufferProcessing = true;

  if (state.bufferOffset) {
    doWrite(
      stream,
      state,
      !!stream._writev,
      state.length,
      Buffer.alloc(state.bufferOffset, state.internalBuffer),
      '',
      (error, data) => {
        state.callbacks.forEach((cb) => {
          state.pendingcb--;
          cb(error, data);
        });
        state.callbacks = [];
      }
    );
    state.pendingcb++;
    state.bufferOffset = 0;
  }

  state.bufferProcessing = false;
};

const needFinish = (state) => (
  state.ending &&
  state.length === 0 &&
  state.bufferOffset === 0 &&
  !state.finished &&
  !state.writing
);

const callFinal = (stream, state) => {
  stream._final((error) => {
    state.pendingcb--;

    if (error) {
      stream.emit('error', error);
    }

    state.prefinished = true;
    stream.emit('prefinish');
    finishMaybe(stream, state);
  });
};

const prefinish = (stream, state) => {
  if (!state.prefinished && !state.finalCalled) {
    if (typeof stream._final === 'function' && !state.destroyed) {
      state.pendingcb++;
      state.finalCalled = true;
      process.nextTick(callFinal, stream, state);
    } else {
      state.prefinished = true;
      stream.emit('prefinish');
    }
  }
};

const finishMaybe = (stream, state) => {
  const need = needFinish(state);

  if (need) {
    prefinish(stream, state);
    if (state.pendingcb === 0) {
      state.finished = true;
      stream.emit('finish');
    }
  }

  return need;
};

const endWritable = (stream, state, callback) => {
  state.ending = true;
  finishMaybe(stream, state);

  if (callback) {
    if (state.finished) {
      process.nextTick(callback);
    }
    else {
      stream.once('finish', callback);
    }
  }

  state.ended = true;
  stream.writable = false;
};

const decodeChunk = (state, chunk, encoding) => {
  if (!state.objectMode &&
      state.decodeStrings !== false &&
      typeof chunk === 'string') {
    chunk = Buffer.from(chunk, encoding);
  }

  return chunk;
};

module.exports = Writable;
