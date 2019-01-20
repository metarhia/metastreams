'use strict';

const common = require('metarhia-common');
const { Stream } = require('./stream');

const DEFAULT_HIGH_WATERMARK = 16 * 1024; // 16Kb

const Writable = function({
  highWaterMark = DEFAULT_HIGH_WATERMARK, // Number
  decodeStrings = true, // decode before _write()
  write = null, // Function for this._write()
  writev = null, // Function for this._writev()
  destroy = null, // Function for this._destroy()
  final = null, // Function for this._final()
}) {
  this.writableHighWaterMark = highWaterMark;
  this.writableLength = 0;
  this.decodeStrings = decodeStrings;
  this._write = write;
  this._writev = writev;
  this._destroy = destroy;
  this._final = final;
  this.encoding = 'utf8';
  this.callbacks = [];
  Stream.call(this);
};

// Events: close, drain, error, finish, pipe, unpipe

common.inherits(Writable, Stream);

Writable.prototype.pipe = function() {
  this.emit('error', new Error('Cannot pipe, not readable'));
};

Writable.prototype.write = function(
  chunk, // String or Buffer instance
  encoding, // string, optional, string encoding if chunk is a string
  callback // function
  // Returns: boolean
  //   true - can write more
  //   false - buffer overflow, do not write more
) {
  if (typeof chunk === 'string') chunk = Buffer.from(chunk, encoding);
  if (callback) callback();
};

Writable.prototype.end = function(chunk, encoding, callback) {
  this.write(chunk, encoding, callback);
};

Writable.prototype.destroy = function(error) {
  throw error;
};

Writable.prototype.cork = function() {
  this.corked++;
};

Writable.prototype.uncork = function() {
  if (this.corked) this.corked--;
};

Writable.prototype.setDefaultEncoding = function(encoding) {
  this.encoding = encoding;
};

module.exports = Writable;
