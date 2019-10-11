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

module.exports = function (RED) {
    'use strict';
    const ec = require('../lib/errorcode.js');
    const tools = require('../lib/tools.js');
    const KolibriConsumerConnection = require('../lib/consumer.js');

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
            this.register = function (kolibriNode) {
                node.users[kolibriNode.id] = kolibriNode;
                if (Object.keys(node.users).length === 1) {
                    node.connect();
                }
            };
            this.deregister = function (kolibriNode, done) {
                delete node.users[kolibriNode.id];
                if (node.closing) {
                    return done();
                }
                if (Object.keys(node.users).length === 0) {
                    if (node.client && node.client.connected) {
                        return node.client.end(done);
                    }
                    else {
                        node.client.end();
                        return done();
                    }
                }
                done();
            };
            this.retry = {
                interval: node.options.connectMinRetryInterval,
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
            this.connect = function () {
                if (!node.connected && !node.connecting) {
                    node.connecting = true;
                    node.consumer = new KolibriConsumerConnection(node.brokerurl, node.options);
                    node.consumer.connect();
                    node.consumer.on('error', function (error) {
                        node.log('Kolibri error: ' + error.message);
                    });
                    node.consumer.on('open', function () {
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
                    node.consumer.on('close', function (code, message) {
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
                        if (node.options.connectRetries > 0) {
                            // Reconnect
                            node.log('Kolibri: Trying to reconnect...');
                            node.connect();
                        }
                    });
                    node.consumer.on('rpc-request', function (rpc) {
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
                    node.consumer.on('rpc-result', function (rpc) {
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
                                    // Successful login, reset retry interval
                                    node.retry.resetInterval();
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
                                    for (config in p.params) {
                                        if (node.subscriptions.hasOwnProperty(config.path) &&
                                            typeof node.subscriptions[config.path] === 'object') {
                                            node.subscriptions[config.path].subscribed = true;
                                        }
                                    }
                                    break;
                                case 'kolibri.unsubscribe':
                                    for (config in p.params) {
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
                    node.consumer.on('rpc-error', function (rpc) {
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
            };
            this.subscribe = function (path, callback) {
                if (!node.subscriptions.hasOwnProperty(path) ||
                    typeof node.subscriptions[path] !== 'object') {
                    node.subscriptions[path] = {
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
                    node.subscriptions[path].subscribe = true;
                }
                if (node.connected && !node.subscriptions[path].subscribed) {
                    this.sendRpcRequestRetry('kolibri.subscribe', [{ path: path }]);
                }
            };
            this.unsubscribe = function (path) {
                if (!node.subscriptions.hasOwnProperty(path) ||
                    typeof node.subscriptions[path] !== 'object') {
                    node.subscriptions[path] = {
                        subscribe: false,
                        subscribed: false
                    };
                }
                else {
                    node.subscriptions[path].subscribe = false;
                }
                if (node.connected && node.subscriptions[path].subscribed) {
                    this.sendRpcRequestRetry('kolibri.unsubscribe', [{ path: path }]);
                }
            };
            this.write = function (pointstate) {
                if (node.connected) {
                    node.consumer.sendRpcRequestRetry('kolibri.write', { nodes: [pointstate] });
                }
            };
            this.on('close', function (done) {
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
    }

    RED.nodes.registerType('kolibri-broker', KolibriBrokerNode, {
        credentials: {
            user: { type: 'text' },
            password: { type: 'password' }
        }
    });
};