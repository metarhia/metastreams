'use strict';

const common = require('metarhia-common');
const EventEmitter = require('events');

const DEFAULT_LENGTH = 16385;

function WriteBuffer(length = DEFAULT_LENGTH, timeout) {
  this.length = length;
  this.writeInterval = timeout || null;
  this.position = 0;
  this.buffer = Buffer.allocUnsafe(length);
  this.writeTimer = null;
}

common.inherits(WriteBuffer, EventEmitter);

WriteBuffer.prototype.write = function(buffer) {
  const freeSize = this.length - this.position;
  const messageLength = buffer.length;
  if (freeSize >= messageLength) {
    this.position += buffer.copy(this.buffer, this.position);
    clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.emit('data', null, Buffer.from(this.buffer.slice(0, this.position)));
    }, this.writeInterval);
  } else {
    clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.emit('data', null, Buffer.from(this.buffer.slice(0, this.position)));
    }, this.writeInterval);
    this.emit('data', null, Buffer.concat([
      this.buffer.slice(0, this.position),
      buffer
    ], this.position + messageLength));
    this.position = 0;
  }
};

WriteBuffer.prototype.drain = function(start = 0, end = this.position) {
  this.emit('drain', null, Buffer.from(this.buffer.slice(start, end)));
  // this.position = 0;
};

module.exports = WriteBuffer;
