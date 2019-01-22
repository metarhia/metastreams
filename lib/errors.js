'use strict';

class InvalidArgTypeError extends TypeError {
  constructor(name, expected, actual) {
    super(
      `The "${name}" argument must be one of type ${expected}. ` +
        `Received type ${typeof actual}`
    );
    this.code = 'ERR_INVALID_ARG_TYPE';
    this.name += ` [${this.code}]`;
  }
}

class StreamNullValuesError extends TypeError {
  constructor() {
    super('May not write null values to stream');
    this.code = 'ERR_STREAM_NULL_VALUES';
    this.name += ` [${this.code}]`;
  }
}

class MethodsNotImplementedError extends Error {
  constructor() {
    super('_write() and _vritev() methods are not implemented');
    this.code = 'ERR_METHOD_NOT_IMPLEMENTED';
    this.name += ` [${this.code}]`;
  }
}

class StreamDestroyedError extends Error {
  constructor() {
    super('Cannot call write after a stream was destroyed');
    this.code = 'ERR_STREAM_DESTROYED';
    this.name += ` [${this.code}]`;
  }
}

class StreamWriteAfterEndError extends Error {
  constructor() {
    super('write after end');
    this.code = 'ERR_STREAM_WRITE_AFTER_END';
    this.name += ` [${this.code}]`;
  }
}

class UnknownEncodingError extends TypeError {
  constructor(encoding) {
    super(`Unknown encoding ${encoding}`);
    this.code = 'ERR_UNKNOWN_ENCODING';
    this.name += ` [${this.code}]`;
  }
}

class OutOfRangeError extends RangeError {
  constructor(name, range, actual) {
    super(
      `The value of ${name} is out of range. It must be ${range}. ` +
        `Received ${actual}`
    );
    this.code = 'ERR_OUT_OF_RANGE';
    this.name += ` [${this.code}]`;
  }
}
module.exports = {
  OutOfRangeError,
  InvalidArgTypeError,
  StreamDestroyedError,
  UnknownEncodingError,
  StreamNullValuesError,
  MethodsNotImplementedError,
  StreamWriteAfterEndError,
};
