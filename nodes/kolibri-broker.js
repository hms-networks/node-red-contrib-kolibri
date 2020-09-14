/*---------------------------------------------------------------------------------------------
 *  COPYRIGHT NOTIFICATION (c) 2020 HMS Industrial Networks AB
 * --------------------------------------------------------------------------------------------
 *  Licensed under the Apache License, Version 2.0.
 *  See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

module.exports = function (RED) {
    'use strict';
    const ec = require('../lib/errorcode.js');
    const tools = require('../lib/tools.js');
    const KolibriConsumer = require('../lib/consumer.js');

    class KolibriBrokerNode {
        constructor(config) {
            RED.nodes.createNode(this, config);
            // Configuration options passed by Node-RED
            this.name = config.name;
            this.broker = config.broker;
            this.port = config.port;

            // Config node state
            this.brokerurl = 'wss://' + this.broker + ':' + this.port + '/';
            this.consumer = null;
            this.connected = false;
            this.connecting = false;
            this.closing = false;
            this.queue = [];
            this.subscriptions = {};
            this.user = this.credentials.user;
            this.password = this.credentials.password;
            this.project = '';

            let splits = this.broker.split('.');
            if (typeof splits[0] === 'string' && splits[0].length > 0) {
                this.project = splits[0];
            }

            // Options for passing to KolibriConsumer
            this.options = {
                connectMinRetryInterval: 1,
                connectMaxRetryInterval: 15,
                keepaliveInterval: 15,
                keepaliveTimeout: 5,
                requestTimeout: 5,
                requestRetries: 1,
                ca: [],
                rejectUnauthorized: false,
                maxPayload: 1 * 1024 * 1024
            };

            let self = this;

            // Define functions called by Kolibri in and out nodes
            this.nodes = {};

            this.retry = {
                interval: this.options.connectMinRetryInterval,
                handler: null,
                resetInterval: function () {
                    if (this.handler) {
                        clearTimeout(this.handler);
                        this.handler = null;
                    }
                    this.interval = self.options.connectMinRetryInterval;
                },
                updateInterval: function () {
                    this.interval *= 2;
                    if (this.interval > self.options.connectMaxRetryInterval) {
                        this.interval = self.options.connectMaxRetryInterval;
                    }
                }
            };

            // Subscribe to closing node event of Node-RED
            this.on('close', (done) => {
                this.closing = true;

                if (typeof done === 'function') {
                    done();
                }
            });
        }

        register(node) {
            this.nodes[node.id] = node;
            // Establish the Broker connection when the first node is registered
            if (Object.keys(this.nodes).length === 1) {
                this.connect();
            }
        }

        deregister(node, done) {
            delete this.nodes[node.id];
            // Close the Broker connection when the last node is deregistered
            if (Object.keys(this.nodes).length === 0) {
                this.disconnect();
            }
        }

        disconnect() {
            if (this.connected) {
                this.log('Closing connection');
                this.connected = false;
                this.connecting = false;
                this.consumer.disconnect();
            }
        }

        connect() {
            let self = this;
            if (!this.connected && !this.connecting) {
                this.log('Connecting');
                this.connecting = true;
                this.consumer = new KolibriConsumer(this.brokerurl, this.options);

                this.consumer.on('error', function (error) {
                    self.error('Connection error: ' + error.message);

                    if (!self.connected && !self.connecting) {
                        // Reconnect again
                        self.retry.handler = setTimeout(() => {
                            self.connect();
                            self.retry.updateInterval();
                        }, self.retry.interval * 1000);
                    }
                });

                this.consumer.on('open', function () {
                    self.connecting = true;
                    for (let id in self.nodes) {
                        if (self.nodes.hasOwnProperty(id)) {
                            self.nodes[id].status({
                                fill: 'yellow',
                                shape: 'ring',
                                text: 'node-red:common.status.connecting'
                            });
                        }
                    }
                    this.sendRpcRequestRetry('kolibri.getChallenge', {});
                });

                this.consumer.on('close', function (code) {
                    if (self.connected || self.connecting) {
                        self.connected = false;
                        self.connecting = false;
                        self.log('Connection closed with code = ' + code);
                        for (let id in self.nodes) {
                            if (self.nodes.hasOwnProperty(id)) {
                                self.nodes[id].status({
                                    fill: 'red',
                                    shape: 'ring',
                                    text: 'node-red:common.status.disconnected'
                                });
                            }
                        }
                    }
                    if (!self.connecting && !self.closing) {
                        // Reconnect again after retry interval
                        self.retry.handler = setTimeout(() => {
                            self.connect();
                            self.retry.updateInterval();
                        }, self.retry.interval * 1000);
                    }
                });

                this.consumer.on('rpc-request', function (rpc) {
                    switch (rpc.method) {
                        case 'kolibri.getRpcInfo':
                            let result = {
                                version: 0,
                                methods: [
                                    'kolibri.getRpcInfo',
                                    'kolibri.write',
                                    'kolibri.unsubscribed'
                                ]
                            };
                            this.sendRpcResult(rpc.id, result);
                            break;
                        case 'kolibri.write':
                            rpc.params.nodes.forEach(function (n) {
                                if (self.subscriptions.hasOwnProperty(n.path) &&
                                    typeof self.subscriptions[n.path] === 'object' &&
                                    self.subscriptions[n.path].hasOwnProperty('handler')) {
                                        self.subscriptions[n.path].handler(
                                            n.path,
                                            n.timestamp,
                                            n.quality,
                                            n.value
                                        );
                                }
                            });
                            this.sendRpcResult(rpc.id, 0);
                            break;
                        case 'kolibri.unsubscribed':
                            rpc.params.forEach(function (n) {
                                if (self.subscriptions.hasOwnProperty(n.path) &&
                                    typeof self.subscriptions[n.path] === 'object') {
                                        if (n.subscribe) {
                                            self.subscriptions[n.path].subscribed = false;
                                            self.consumer.sendRpcRequestRetry('kolibri.subscribe', [
                                                { path: n.path }
                                            ]);
                                        } else {
                                            delete self.subscriptions[n.path];
                                            for (let id in self.nodes) {
                                                if (self.nodes.hasOwnProperty(id)) {
                                                    self.nodes[id].status({
                                                        fill: 'red',
                                                        shape: 'ring',
                                                        text: 'invalid path'
                                                    });
                                                }
                                            }
                                        }
                                    }
                            });
                            this.sendRpcResult(rpc.id, 0);
                            break;
                        default:
                            this.sendRpcError(rpc.id, ec.METHOD_NOT_FOUND);
                            break;
                    }
                });

                this.consumer.on('rpc-result', function (rpc) {
                    let p = this.pending.getRequest(rpc.id);
                    if (p) {
                        switch (p.method) {
                            case 'kolibri.getChallenge':
                                let pwHash = tools.hashPassword([
                                    self.password,
                                    self.user.toLowerCase(),
                                    self.project.toLowerCase()
                                ], rpc.result);
                                // Send login request
                                this.sendRpcRequestRetry('kolibri.login', {
                                    version: 0,
                                    user: self.user,
                                    password: pwHash.toString('hex'),
                                    interval: self.options.keepaliveInterval,
                                    timeout: self.options.keepaliveTimeout,
                                    pendingTransactions: false
                                });
                                self.log('Logging in');
                                break;
                            case 'kolibri.login':
                                self.connecting = false;
                                self.connected = true;
                                self.log('Logged in');
                                // Successful login, reset connection retry interval
                                self.retry.resetInterval();

                                for (let id in self.nodes) {
                                    if (self.nodes.hasOwnProperty(id)) {
                                        self.nodes[id].status({
                                            fill: 'green',
                                            shape: 'dot',
                                            text: 'node-red:common.status.connected'
                                        });
                                    }
                                }
                                // Re-subscribe to stored data points
                                for (let s in self.subscriptions) {
                                    if (self.subscriptions.hasOwnProperty(s) &&
                                        typeof self.subscriptions[s] === 'object') {
                                            this.sendRpcRequestRetry('kolibri.subscribe', [{path: s}]);
                                    }
                                }
                                break;
                            case 'kolibri.subscribe':
                                for (let n in p.params) {
                                    if (self.subscriptions.hasOwnProperty(n.path) &&
                                        typeof self.subscriptions[n.path] === 'object') {
                                        self.subscriptions[n.path].subscribed = true;
                                    }
                                }
                                break;
                            case 'kolibri.unsubscribe':
                                for (let n in p.params) {
                                    if (self.subscriptions.hasOwnProperty(n.path) &&
                                        typeof self.subscriptions[n.path] === 'object') {
                                        self.subscriptions[n.path].subscribed = false;
                                    }
                                }
                                break;
                            case 'kolibri.write':
                                break;
                            case 'kolibri.close':
                                break;
                            default:
                                self.warn('Missing result handler: ' + rpc);
                                break;
                        }
                        // Delete pending RPC
                        this.pending.deleteRequest(rpc.id);
                    }
                    else {
                        self.warn('Received unsolicited result: ' + rpc);
                    }
                });

                this.consumer.on('rpc-error', function (rpc) {
                    let invalidPath;
                    let p = this.pending.getRequest(rpc.id);
                    if (p) {
                        switch (p.method) {
                            case 'kolibri.login':
                                self.error('Login failed: ' + rpc.error.message);
                                self.connected = false;
                                self.connecting = false;
                                if (rpc.error.message === 'access denied') {
                                    rpc.error.message = 'invalid broker settings';
                                }
                                for (let id in self.nodes) {
                                    if (self.nodes.hasOwnProperty(id)) {
                                        self.nodes[id].status({
                                            fill: 'red',
                                            shape: 'ring',
                                            text: rpc.error.message
                                        });
                                    }
                                }
                                break;
                            case 'kolibri.subscribe':
                                invalidPath = p.params[0].path;
                                self.error('Subscription failed: ' + rpc.error.message + ' ' + invalidPath);

                                // Change status for node
                                for (let id in self.nodes) {
                                    if (self.nodes.hasOwnProperty(id)) {
                                        if (self.nodes[id].path === invalidPath){
                                            self.nodes[id].status({
                                                fill: 'yellow',
                                                shape: 'ring',
                                                text: rpc.error.message
                                            });
                                        }
                                    }
                                }
                                break;
                            case 'kolibri.write':
                                invalidPath = p.params.nodes[0].path;
                                self.error('Write failed: ' + rpc.error.message + ' ' + invalidPath);

                                for (let id in self.nodes) {
                                    if (self.nodes.hasOwnProperty(id)) {
                                        if (self.nodes[id].path === invalidPath){
                                            self.nodes[id].status({
                                                fill: 'yellow',
                                                shape: 'ring',
                                                text: rpc.error.message
                                            });
                                        }
                                    }
                                }
                                break;
                            default:
                                self.warn('Missing error handler: ' + rpc);
                                break;
                        }
                        // Delete pending RPC
                        this.pending.deleteRequest(rpc.id);
                    }
                    else {
                        self.warn('Received unsolicited error: ' + rpc);
                    }
                });

                // And finally establish the Kolibri Broker connection
                this.consumer.connect();
            }
        }

        subscribe(path, callback) {
            if (!this.subscriptions.hasOwnProperty(path) ||
                typeof this.subscriptions[path] !== 'object') {
                this.subscriptions[path] = {
                    subscribed: false,
                    handler: function (mpath, mts, mqual, mval) {
                        if (mpath === path) {
                            callback(mpath, mts, mqual, mval);
                        }
                    }
                };
            }
            if (this.connected && !this.subscriptions[path].subscribed) {
                this.sendRpcRequestRetry('kolibri.subscribe', [{ path: path }]);
            }
        }

        unsubscribe(path) {
            if (!this.subscriptions.hasOwnProperty(path) ||
                typeof this.subscriptions[path] !== 'object') {
                this.subscriptions[path] = {
                    subscribed: false
                };
            }
            if (this.connected && this.subscriptions[path].subscribed) {
                this.sendRpcRequestRetry('kolibri.unsubscribe', [{ path: path }]);
            }
        }

        write(pointstate) {
            if (this.connected) {
                this.consumer.sendRpcRequestRetry('kolibri.write', { nodes: [pointstate] });
            }
        };
    }

    RED.nodes.registerType('kolibri-broker', KolibriBrokerNode, {
        credentials: {
            user: { type: 'text' },
            password: { type: 'password' }
        }
    });
};
