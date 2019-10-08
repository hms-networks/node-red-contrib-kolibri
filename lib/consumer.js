/**
 * Copyright 2016-2019 Beck IPC GmbH, https://www.beck-ipc.com
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

const util = require('util');
const events = require('events');

const WebSocket = require('ws');

const ec = require('./errorcode.js');
const jsonRpc = require('./jsonrpc.js');

//------------------------------------------------------------------------------
// KolibriConsumerConnection class
//------------------------------------------------------------------------------
class KolibriConsumerConnection {
    constructor(url, options) {
        let self = this;

        this.address = url;

        // WebSocket sub-protocol
        this.wsProtocol = 'kolibri';

        // WebSocket options
        this.wsOptions = {
            protocolVersion: 13,
            perMessageDeflate: false,
            ca: options.ca || [],
            rejectUnauthorized: options.rejectUnauthorized || false,
            maxPayLoad: options.maxPayload || 1 * 1024 * 1024
        };

        // Connection related properties and methods
        this.connection = {
            retries: options.connectRetries || 0,
            minRetryInterval: options.connectMinRetryInterval || 5,
            maxRetryInterval: options.connectMaxRetryInterval || 300,
            cid: options.cid || 0,
            sid: 0,
            tid: 0,
            counter: 0,
            interval: 0,
            handler: null,

            nextSid: function () {
                this.sid = this.sid === 65535 ? 1 : this.sid + 1;
                return this.sid;
            },

            nextTid: function () {
                this.tid = this.tid === 65535 ? 1 : this.tid + 1;
                return this.tid;
            },

            resetInterval: function () {
                if (this.handler) {
                    clearTimeout(this.handler);
                    this.handler = null;
                }
                this.counter = this.retries;
                this.interval = this.minRetryInterval;
            },

            updateInterval: function () {
                this.counter--;
                this.interval *= 2;
                if (this.interval > this.maxRetryInterval) {
                    this.interval = this.maxRetryInterval;
                }
            },

            connect: function () {
                let selfc = this;
                // Install connection retry handler
                if (selfc.counter > 0) {
                    if (selfc.handler) {
                        clearTimeout(selfc.handler);
                    }
                    selfc.handler = setTimeout(function () {
                        selfc.connect();
                    }, selfc.interval * 1000);
                    selfc.updateInterval();
                }
                else if (selfc.retries > 0) {
                    selfc.handler = setTimeout(function () {
                        self.emit('close');
                    }, selfc.interval * 1000);
                }
                // Create WebSocket connection
                self.ws = new WebSocket(self.address, self.wsProtocol, self.wsOptions);
                // Setup WebSocket event handlers
                self.ws.on('error', self.wsOnError);
                self.ws.on('ping', self.wsOnPing);
                self.ws.on('pong', self.wsOnPong);
                self.ws.on('open', self.wsOnOpen);
                self.ws.on('close', self.wsOnClose);
                self.ws.on('message', self.wsOnMessage);
            },

            start: function () {
                this.resetInterval();
                this.connect();
            }
        };

        // Keep-alive related properties and methods
        this.keepalive = {
            interval: options.keepaliveInterval || 240,
            timeout: options.keepaliveTimeout || 60,
            handler: null,
            start: function () {
                let selfc = this;
                if (selfc.interval === 0) {
                    return;
                }
                if (selfc.handler) {
                    clearTimeout(selfc.handler);
                }
                selfc.handler = setTimeout(function () {
                    self.ws.close(ec.WS_CLOSE_KEEPALIVE);
                }, (selfc.interval + selfc.timeout + 2) * 1000);
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
            // WebSocket connection successfully established
            self.connection.resetInterval();
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
            self.ws.send(JSON.stringify(rpc), {
                binary: false,
                mask: false
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

        // Open WebSocket connection
        this.connection.start();
    }

    //------------------------------------------------------------------------------
    // KolibriConsumerConnection methods
    //------------------------------------------------------------------------------
    connect() {
        this.connection.start();
    }

    close(code) {
        code = code || 1000;
        this.ws.close(code);
    }

    nextTid() {
        return this.connection.nextTid();
    }

    sendRpcRequest(method, params, server) {
        let sid = this.connection.nextSid();
        let rpc = jsonRpc.request(method, sid, params, server);
        this.wsSendRpc(rpc, this.pending.addRequest);
        return sid;
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

util.inherits(KolibriConsumerConnection, events.EventEmitter);

module.exports = KolibriConsumerConnection;
