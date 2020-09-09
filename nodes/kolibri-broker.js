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
                connectMaxRetryInterval: 60,
                keepaliveInterval: 30,
                keepaliveTimeout: 30,
                requestTimeout: 30,
                requestRetries: 1,
                ca: [],
                rejectUnauthorized: false,
                maxPayload: 1 * 1024 * 1024
            };

            // Define functions called by Kolibri in and out nodes
            let node = this;
            this.nodes = {};

            this.retry = {
                interval: this.options.connectMinRetryInterval,
                handler: null,
                resetInterval: function () {
                    if (this.handler) {
                        clearTimeout(this.handler);
                        this.handler = null;
                    }
                    this.interval = node.options.connectMinRetryInterval;
                },
                updateInterval: function () {
                    this.interval *= 2;
                    if (this.interval > node.options.connectMaxRetryInterval) {
                        this.interval = node.options.connectMaxRetryInterval;
                    }
                }
            };

            // Subscribe to closing node event of Node-Red
            this.on('close', (done) => {
                this.closing = true;
                if (this.connected) {
                    this.client.once('close', function (done) {
                        done();
                    });
                    this.client.end();
                }
                else if (this.connecting) {
                    this.client.end();
                    done();
                }
                else {
                    done();
                }
            });
        }

        register(kolibriNode) {
            this.nodes[kolibriNode.id] = kolibriNode;
            if (Object.keys(this.nodes).length === 1) {
                this.connect();
            }
        }

        deregister(kolibriNode, done) {
            delete this.nodes[kolibriNode.id];
            if (this.closing) {
                return done();
            }
            if (Object.keys(this.nodes).length === 0) {
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

        disconnect(nodeId) {
            if (this.connected) {
                this.consumer.disconnect(nodeId);
                this.consumer.connected = false;
                if (this.nodes.hasOwnProperty(nodeId)) {
                    this.nodes[nodeId].status({
                        fill: 'red',
                        shape: 'ring',
                        text: 'node-red:common.status.disconnected'
                    });
                }
                this.log('Kolibri: Stopped connection for node ' + nodeId);
            }
        }

        connect() {
            let node = this;
            if (!this.connected) {
                this.connecting = true;
                this.consumer = new KolibriConsumer(this.brokerurl, this.options);
                this.consumer.connect();

                this.consumer.on('error', function (error) {
                    node.log('Kolibri error: ' + error.message);
                    switch (parseInt(error.message))
                    {
                        case ec.WS_CLOSE_KEEPALIVE:
                            node.connected = false;
                            for (let id in node.nodes) {
                                if (node.nodes.hasOwnProperty(id)) {
                                    node.nodes[id].status({
                                        fill: 'red',
                                        shape: 'ring',
                                        text: 'node-red:common.status.disconnected'
                                    });
                                }
                            }
                            break;
                        default:
                            break;
                    }
                });

                this.consumer.on('open', function () {
                    node.connecting = true;
                    for (let id in node.nodes) {
                        if (node.nodes.hasOwnProperty(id)) {
                            node.nodes[id].status({
                                fill: 'yellow',
                                shape: 'ring',
                                text: 'node-red:common.status.connecting'
                            });
                        }
                    }
                    this.sendRpcRequestRetry('kolibri.getChallenge', {});
                });

                this.consumer.on('close', function (code, message) {
                    if (node.connected) {
                        node.connected = false;
                        node.log('Kolibri: Disconnected with code=' + code);
                        for (let id in node.nodes) {
                            if (node.nodes.hasOwnProperty(id)) {
                                node.nodes[id].status({
                                    fill: 'red',
                                    shape: 'ring',
                                    text: 'node-red:common.status.disconnected'
                                });
                            }
                        }
                    }
                    // Reconnect again
                    node.retry.handler = setTimeout(() => {
                        node.connect();
                        node.retry.updateInterval();
                    }, (node.retry.interval * 1000));
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
                                        nn.quality,
                                        nn.value
                                    );
                                }
                            });
                            this.sendRpcResult(rpc.id, 0);
                            break;
                        case 'kolibri.unsubscribed':
                            for (let nn in rpc.params) {
                                if (node.subscriptions.hasOwnProperty(rpc.params[nn].path) &&
                                    typeof node.subscriptions[rpc.params[nn].path] === 'object') {
                                        node.subscriptions[rpc.params[nn].path].subscribe = rpc.params[nn].subscribe;
                                        node.subscriptions[rpc.params[nn].path].subscribed = false;
                                }
                                if (node.connected &&
                                    node.subscriptions.hasOwnProperty(rpc.params[nn].path) &&
                                    node.subscriptions[rpc.params[nn].path].hasOwnProperty('subscribe') &&
                                    node.subscriptions[rpc.params[nn].path].subscribe) {
                                        this.sendRpcRequestRetry('kolibri.subscribe', [
                                            { path: rpc.params[nn].path }
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
                                node.log('Kolibri: logged in');
                                // Successful login, reset retry interval
                                node.retry.resetInterval();

                                for (let id in node.nodes) {
                                    if (node.nodes.hasOwnProperty(id)) {
                                        node.nodes[id].status({
                                            fill: 'green',
                                            shape: 'dot',
                                            text: 'node-red:common.status.connected'
                                        });
                                    }
                                }
                                // Re-subscribe to stored data points
                                for (let s in node.subscriptions) {
                                    if (node.subscriptions.hasOwnProperty(s) &&
                                        typeof node.subscriptions[s] === 'object' &&
                                        node.subscriptions[s].hasOwnProperty('subscribe') &&
                                        node.subscriptions[s].subscribe) {
                                            this.sendRpcRequestRetry('kolibri.subscribe', [{path: s}]);
                                    }
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
                    let invalidPath;
                    let p = this.pending.getRequest(rpc.id);
                    if (p) {
                        switch (p.method) {
                            case 'kolibri.login':
                                node.log('Kolibri: login failed: ' + rpc.error.message);
                                node.connected = false;
                                node.connecting = false;
                                if (rpc.error.message === 'access denied') {
                                    rpc.error.message = 'invalid broker settings';
                                }
                                for (let id in node.nodes) {
                                    if (node.nodes.hasOwnProperty(id)) {
                                        node.nodes[id].status({
                                            fill: 'red',
                                            shape: 'ring',
                                            text: rpc.error.message
                                        });
                                    }
                                }
                                break;
                            case 'kolibri.subscribe':
                                invalidPath = p.params[0].path;
                                node.log('Kolibri: subscription failed: ' + rpc.error.message + ' ' + invalidPath);

                                // Change status for node
                                for (let id in node.nodes) {
                                    if (node.nodes.hasOwnProperty(id)) {
                                        if (node.nodes[id].path === invalidPath){
                                            node.nodes[id].status({
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
                                node.log('Kolibri: write failed: ' + rpc.error.message + ' ' + invalidPath);

                                for (let id in node.nodes) {
                                    if (node.nodes.hasOwnProperty(id)) {
                                        if (node.nodes[id].path === invalidPath){
                                            node.nodes[id].status({
                                                fill: 'yellow',
                                                shape: 'ring',
                                                text: rpc.error.message
                                            });
                                        }
                                    }
                                }
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
