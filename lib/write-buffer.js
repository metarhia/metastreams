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
