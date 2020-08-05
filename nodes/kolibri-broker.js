/*---------------------------------------------------------------------------------------------
 *  Copyright (c) HMS Networks. All rights reserved.
 *  Licensed under the Apache License, Version 2.0.
 *  See License in the project root for license information.
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
            this.broker = config.broker;
            this.port = config.port;
            // Config node state
            this.brokerurl = 'wss://' + this.broker + ':' + this.port + '/';
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
            // Options for passing to the Kolibri.js API
            this.options = {
                connectRetries: 100,
                connectMinRetryInterval: 2,
                connectMaxRetryInterval: 60,
                keepaliveInterval: 60,
                keepaliveTimeout: 30,
                requestTimeout: 30,
                requestRetries: 2,
                ca: [],
                rejectUnauthorized: false,
                maxPayload: 1 * 1024 * 1024
            };
            // Define functions called by Kolibri in and out nodes
            let node = this;
            this.users = {};

            this.retry = {
                interval: node.options.connectMinRetryInterval,
                retries: node.options.connectRetries,
                handler: null,
                resetInterval: function () {
                    if (this.handler) {
                        clearTimeout(this.handler);
                        this.handler = null;
                    }
                    this.interval = node.options.connectMinRetryInterval;
                    this.retries = node.options.connectRetries;
                },
                updateInterval: function () {
                    this.interval *= 2;
                    if (this.interval > node.options.connectMaxRetryInterval) {
                        this.interval = node.options.connectMaxRetryInterval;
                    }
                },
                resetRetries: function () {
                    this.retries = node.options.connectRetries;
                }
            };

            // subscribe to closing node event of Node-Red
            this.on('close', (done) => {
                this.closing = true;
                if (this.connected) {
                    this.client.once('close', function () {
                        done();
                    });
                    this.client.end();
                }
                else if (this.connecting) {
                    node.client.end();
                    done();
                }
                else {
                    done();
                }
            });
        }

        register(kolibriNode) {
            this.users[kolibriNode.id] = kolibriNode;
            if (Object.keys(this.users).length === 1) {
                this.connect();
            }
        }

        deregister(kolibriNode, done) {
            delete this.users[kolibriNode.id];
            if (this.closing) {
                return done();
            }
            if (Object.keys(this.users).length === 0) {
                if (this.client && this.client.connected) {
                    return this.client.end(done);
                }
                else {
                    this.client.end();
                    return done();
                }
            }
            done();
        }

        connect() {
            if (!this.connected && !this.connecting) {
                let node = this;
                this.connecting = true;
                this.consumer = new KolibriConsumer(this.brokerurl, this.options);
                this.consumer.connect();
                this.consumer.on('error', function (error) {
                    node.log('Kolibri error: ' + error.message);
                });
                this.consumer.on('open', function () {
                    node.connecting = true;
                    for (let id in node.users) {
                        if (node.users.hasOwnProperty(id)) {
                            node.users[id].status({
                                fill: 'yellow',
                                shape: 'ring',
                                text: 'node-red:common.status.connecting'
                            });
                        }
                    }
                    // Send getChallenge request
                    this.sendRpcRequestRetry('kolibri.getChallenge', {});
                });
                this.consumer.on('close', function (code, message) {
                    if (node.connected) {
                        node.connected = false;
                        node.log('Kolibri: Disconnected with code=' + code);
                        for (let id in node.users) {
                            if (node.users.hasOwnProperty(id)) {
                                node.users[id].status({
                                    fill: 'red',
                                    shape: 'ring',
                                    text: 'node-red:common.status.disconnected'
                                });
                            }
                        }
                    }
                    else {
                        node.log('Kolibri: connect failed');
                    }
                    if (node.retry.retries > 0) {
                        // Reconnect
                        node.log('Kolibri: Trying to reconnect in ' + node.retry.interval + ' s');
                        setTimeout(() => {
                            node.connect();
                            node.retry.retries--;
                        }, node.retry.interval * 1000);
                    }
                    else {
                        node.log('Kolibri: Timeout');
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
                            rpc.params.nodes.forEach(function (nn) {
                                if (node.subscriptions.hasOwnProperty(nn.path) &&
                                    typeof node.subscriptions[nn.path] === 'object' &&
                                    node.subscriptions[nn.path].hasOwnProperty('handler')) {
                                    node.subscriptions[nn.path].handler(
                                        nn.path,
                                        nn.timestamp,
                                        nn.timestamp_broker,
                                        nn.quality,
                                        nn.value
                                    );
                                }
                            });
                            this.sendRpcResult(rpc.id, 0);
                            break;
                        case 'kolibri.unsubscribed':
                            for (let nn in rpc.params) {
                                if (node.subscriptions.hasOwnProperty(nn.path) &&
                                    typeof node.subscriptions[nn.path] === 'object') {
                                    node.subscriptions[nn.path].subscribe = nn.subscribe;
                                    node.subscriptions[nn.path].subscribed = false;
                                }
                                if (node.connected &&
                                    node.subscriptions.hasOwnProperty(nn.path) &&
                                    node.subscriptions[nn.path].hasOwnProperty('subscribe') &&
                                    node.subscriptions[nn.path].subscribe) {
                                    this.sendRpcRequestRetry('kolibri.subscribe', [
                                        { path: nn.path }
                                    ]);
                                }
                            }
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
                                    node.password,
                                    node.user.toLowerCase(),
                                    node.project.toLowerCase()
                                ], rpc.result);
                                // Send login request
                                this.sendRpcRequestRetry('kolibri.login', {
                                    version: 0,
                                    user: node.user,
                                    password: pwHash.toString('hex'),
                                    interval: node.options.keepaliveInterval,
                                    timeout: node.options.keepaliveTimeout,
                                    pendingTransactions: false
                                });
                                break;
                            case 'kolibri.login':
                                node.connecting = false;
                                node.connected = true;
                                node.log('Kolibri: connected');
                                for (let id in node.users) {
                                    if (node.users.hasOwnProperty(id)) {
                                        node.users[id].status({
                                            fill: 'green',
                                            shape: 'dot',
                                            text: 'node-red:common.status.connected'
                                        });
                                    }
                                }
                                // Successful login, reset retry interval and retries
                                node.retry.resetInterval();
                                node.retry.resetRetries();
                                // Re-subscribe to stored data points
                                let nodes = [];
                                for (let s in node.subscriptions) {
                                    if (node.subscriptions.hasOwnProperty(s) &&
                                        typeof node.subscriptions[s] === 'object' &&
                                        node.subscriptions[s].hasOwnProperty('subscribe') &&
                                        node.subscriptions[s].subscribe) {
                                        nodes.push({ path: s });
                                    }
                                }
                                if (nodes.length > 0) {
                                    this.sendRpcRequestRetry('kolibri.subscribe', nodes);
                                }
                                break;
                            case 'kolibri.write':
                                break;
                            case 'kolibri.subscribe':
                                for (let config in p.params) {
                                    if (node.subscriptions.hasOwnProperty(config.path) &&
                                        typeof node.subscriptions[config.path] === 'object') {
                                        node.subscriptions[config.path].subscribed = true;
                                    }
                                }
                                break;
                            case 'kolibri.unsubscribe':
                                for (let config in p.params) {
                                    if (node.subscriptions.hasOwnProperty(config.path) &&
                                        typeof node.subscriptions[config.path] === 'object') {
                                        node.subscriptions[config.path].subscribed = false;
                                    }
                                }
                                break;
                            default:
                                node.log('Kolibri: received RPC result: ' + rpc.result);
                                break;
                        }
                        // Delete pending RPC
                        this.pending.deleteRequest(rpc.id);
                    }
                    else {
                        node.log('Kolibri: received unsolicited result: ' + rpc);
                    }
                });
                this.consumer.on('rpc-error', function (rpc) {
                    let p = this.pending.getRequest(rpc.id);
                    if (p) {
                        switch (p.method) {
                            case 'kolibri.login':
                                node.log('Kolibri: login failed: ' + rpc.error);
                                node.log('Kolibri: closing connection');
                                this.close();
                                break;
                            default:
                                node.log('Kolibri: received RPC error: ' + rpc.error.message);
                                break;
                        }
                        // Delete pending RPC
                        this.pending.deleteRequest(rpc.id);
                    }
                    else {
                        node.log('Kolibri: received unsolicited error: ' + rpc);
                    }
                });
            }
        }

        subscribe(path, callback) {
            if (!this.subscriptions.hasOwnProperty(path) ||
                typeof this.subscriptions[path] !== 'object') {
                this.subscriptions[path] = {
                    subscribe: true,
                    subscribed: false,
                    handler: function (mpath, mts, mtsb, mqual, mval) {
                        if (mpath === path) {
                            callback(mpath, mts, mtsb, mqual, mval);
                        }
                    }
                };
            }
            else {
                this.subscriptions[path].subscribe = true;
            }
            if (this.connected && !this.subscriptions[path].subscribed) {
                this.sendRpcRequestRetry('kolibri.subscribe', [{ path: path }]);
            }
        }

        unsubscribe(path) {
            if (!this.subscriptions.hasOwnProperty(path) ||
                typeof this.subscriptions[path] !== 'object') {
                this.subscriptions[path] = {
                    subscribe: false,
                    subscribed: false
                };
            }
            else {
                this.subscriptions[path].subscribe = false;
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
