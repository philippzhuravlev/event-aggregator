// Minimal DOMException shim that forwards to the global if available
class DOMExceptionShim extends Error {
  constructor(message, name) {
    super(message);
    this.name = name || 'DOMException';
    if (Error.captureStackTrace) Error.captureStackTrace(this, DOMExceptionShim);
  }
}

module.exports = typeof globalThis.DOMException !== 'undefined' ? globalThis.DOMException : DOMExceptionShim;
