/*---------------------------------------------------------------------------------------------
 *  COPYRIGHT NOTIFICATION (c) 2021 HMS Industrial Networks AB
 * --------------------------------------------------------------------------------------------
 *  Licensed under the Apache License, Version 2.0.
 *  See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const EventEmitter = require('events');
const Connection = require('./connection.js');
const ec = require('./errorcode.js');
const jsonRpc = require('./jsonrpc.js');

//------------------------------------------------------------------------------
// KolibriConsumer class
//------------------------------------------------------------------------------
class KolibriConsumer extends EventEmitter {
    constructor(url, options, version) {
        super();
        let self = this;
        this.version = version;
        this.connection = new Connection(url, options, version);

        // Keep-alive related properties and methods
        this.keepalive = {
            interval: options.keepaliveInterval || 240,
            timeout: options.keepaliveTimeout || 60,
            handler: null,
            start: function () {
                if (this.interval === 0) {
                    return;
                }
                if (this.handler) {
                    clearTimeout(this.handler);
                }
                this.handler = setTimeout(function () {
                    self.disconnect(ec.WS_CLOSE_KEEPALIVE);
                }, (this.interval + this.timeout) * 1000);
            },
            stop: function () {
                if (this.handler) {
                    clearTimeout(this.handler);
                    this.handler = null;
                }
            }
        };

        // Pending requests related properties and methods
        this.pending = {
            timeout: options.requestTimeout || 60,
            retries: options.requestRetries || 5,
            requests: {},

            addRequest: function (rpc) {
                this.requests[rpc.id] = {
                    rpc: rpc,
                    handler: null,
                    retries: 0
                };
            },
            getRequest: function (id) {
                return this.requests.hasOwnProperty(id) ? this.requests[id].rpc : null;
            },
            setRequestHandler: function (id, handler) {
                if (this.requests.hasOwnProperty(id)) {
                    this.requests[id].handler = handler;
                }
            },
            getRequestRetries: function (id) {
                return this.requests.hasOwnProperty(id) ? this.requests[id].retries : -1;
            },
            incrementRequestRetries: function (id) {
                if (this.requests.hasOwnProperty(id)) {
                    this.requests[id].retries++;
                }
            },
            deleteRequest: function (id) {
                if (this.requests.hasOwnProperty(id)) {
                    if (this.requests[id].handler) {
                        clearTimeout(this.requests[id].handler);
                    }
                    delete this.requests[id];
                }
            }
        };

        // WebSocket event handlers
        this.wsOnError = function (error) {
            self.emit('error', error);
        };

        this.wsOnPing = function () {
            self.keepalive.start();
        };

        this.wsOnPong = function () {
            self.keepalive.start();
        };

        this.wsOnOpen = function () {
            self.keepalive.start();
            self.emit('open');
        };

        this.wsOnClose = function (code) {
            self.keepalive.stop();
            self.emit('close', code);
        };

        this.wsOnMessage = function (data) {
            self.keepalive.start();
            // Skip binary WebSocket messages which are not used by consumers.
            if (Buffer.isBuffer(data)) {
                return;
            }
            let rpc;
            try {
                rpc = jsonRpc.parse(data);
            }
            catch (e) {
                self.emit('rpc-invalid', data);
                return;
            }
            switch (jsonRpc.getType(rpc)) {
                case jsonRpc.type.REQUEST:
                    self.emit('rpc-request', rpc);
                    break;
                case jsonRpc.type.NOTIFICATION:
                    break;
                case jsonRpc.type.RESULT:
                    self.emit('rpc-result', rpc);
                    break;
                case jsonRpc.type.ERROR:
                    self.emit('rpc-error', rpc);
                    break;
                case jsonRpc.type.REQUEST_ROUTED:
                    self.emit('rpc-request-routed', rpc);
                    break;
                case jsonRpc.type.NOTIFICATION_ROUTED:
                    self.emit('rpc-notification-routed', rpc);
                    break;
                case jsonRpc.type.RESULT_ROUTED:
                    self.emit('rpc-result-routed', rpc);
                    break;
                case jsonRpc.type.ERROR_ROUTED:
                    self.emit('rpc-error-routed', rpc);
                    break;
                case jsonRpc.type.INVALID:
                    self.emit('rpc-invalid', rpc);
                    break;
            }
        };

        // WebSocket send RPC method
        this.wsSendRpc = function (rpc, cb) {
            this.connection.ws.send(JSON.stringify(rpc), {
                binary: false
            }, function (error) {
                if (error) {
                    error.data = rpc;
                    self.emit('error', error);
                    return;
                }
                if (typeof cb === 'function') {
                    cb(rpc);
                }
            });
        };
    }

    //------------------------------------------------------------------------------
    // KolibriConsumer methods
    //------------------------------------------------------------------------------
    connect() {
        this.connection.start();

        if (this.connection.ws !== null) {
            // Register WebSocket event listeners
            this.connection.ws.on('error', this.wsOnError);
            this.connection.ws.on('ping', this.wsOnPing);
            this.connection.ws.on('pong', this.wsOnPong);
            this.connection.ws.on('open', this.wsOnOpen);
            this.connection.ws.on('close', this.wsOnClose);
            this.connection.ws.on('message', this.wsOnMessage);
        }
    }

    disconnect(code) {
        if (code === ec.WS_CLOSE_KEEPALIVE) {
            this.connection.terminate();
        }
        else {
            if (this.version == 'v1.0.kolibri') {
                this.sendRpcRequestRetry('kolibri.close', {});
            }
            else {
                this.sendRpcRequestRetry('kolibri.close');
            }
        }
    }

    nextTid() {
        return this.connection.nextTid();
    }

    sendRpcRequestRetry(method, params, server) {
        let self = this;
        let sid = this.connection.nextSid();
        let rpc = jsonRpc.request(method, sid, params, server);
        // Delete pending RPC request with the same rpc.id
        if (self.pending.getRequest(rpc.id)) {
            self.pending.deleteRequest(rpc.id);
        }
        // Add new request to the pending RPC list
        self.pending.addRequest(rpc);
        // RPC request callback function handles retries
        let cb = function (rpc1) {
            let retries = self.pending.getRequestRetries(rpc1.id);
            if (retries < 0) {
                return;
            }
            if (retries < self.pending.retries) {
                // Send the RPC request again if the response times out
                self.pending.setRequestHandler(rpc1.id, setTimeout(function (rpc2) {
                    self.pending.incrementRequestRetries(rpc2.id);
                    self.wsSendRpc(rpc2, cb);
                }, self.pending.timeout * 1000, rpc1));
            }
            else {
                // Maximum retries hit, give up if the response times out
                self.pending.setRequestHandler(rpc1.id, setTimeout(function (rpc2) {
                    self.pending.deleteRequest(rpc2.id);
                }, self.pending.timeout * 1000, rpc1));
            }
        };
        // Send the RPC request
        self.wsSendRpc(rpc, cb);
        return sid;
    }

    sendRpcResult(id, result, server) {
        let rpc = jsonRpc.result(id, result, server);
        this.wsSendRpc(rpc);
    }

    sendRpcError(id, error, server) {
        let err = {
            code: error.code,
            message: error.message
        };
        if (error.hasOwnProperty('data')) {
            err.data = error.data;
        }
        // Map Kolibri errors to the reserved custom RPC error codes.
        if (err.code >= 0 && err.code < 100) {
            err.code = -(31900 + err.code);
        }
        let rpc = jsonRpc.error(id, err, server);
        this.wsSendRpc(rpc);
    }
}

module.exports = KolibriConsumer;
