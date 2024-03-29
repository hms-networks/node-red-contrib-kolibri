/*
* Copyright 2021 HMS Industrial Networks AB
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http: //www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/


import { ClientConfig, KolibriClient, KolibriClientFactory, LoginParams, LoginResult, SubscribeParams, SubscribeResult, UnsubscribeParams, WriteParams } from '@hms-networks/kolibri-js-client';
import { NodeInitializer, Node } from 'node-red';
import { IKolibriBrokerNode, KolibriBrokerNodeDef, Subscription } from './modules/types';

const nodeInit: NodeInitializer = (RED): void => {
    class KolibriBrokerNode implements IKolibriBrokerNode {
        name: string;
        broker: string;
        port: number;
        project: string;
        path: string;
        brokerUrl: string;
        connected: boolean;
        connecting: boolean;
        closing: boolean;
        user: string;
        password: string;
        nodes: Map<string, Node>;
        subscriptions: Map<string, Subscription>;
        client: KolibriClient;
        useProxy: boolean;
        proxyHost: string;
        proxyPort: number;
        proxyProtocol: string;
        clientId: string;
        private lazyThis: Node<{ user: string, password: string }> & IKolibriBrokerNode; ;
        constructor(config: KolibriBrokerNodeDef) {
            this.lazyThis = this as unknown as Node<{ user: string, password: string }> & IKolibriBrokerNode;

            RED.nodes.createNode(this.lazyThis, config);

            // Configuration options passed by Node-RED
            this.name = config.name;
            this.broker = config.broker;
            this.port = config.port;
            this.project = config.project;
            this.path = config.path ? config.path : '/';
            this.useProxy = config.useProxy;
            this.proxyHost = config.proxyHost;
            this.proxyPort = config.proxyPort;
            this.proxyProtocol = config.proxyProtocol;
            this.clientId = config.clientId;

            // Config node state
            this.brokerUrl = 'wss://' + this.broker + ':' + this.port;
            this.connected = false;
            this.connecting = false;
            this.closing = false;

            this.user = this.lazyThis.credentials.user;
            this.password = this.lazyThis.credentials.password;

            this.nodes = new Map();
            this.subscriptions = new Map();

            // Subscribe to closing node event of Node-RED
            this.lazyThis.on('close', (done: any) => {
                this.closing = true;

                if (typeof done === 'function') {
                    done();
                }
            });
            const kolibriConfig: ClientConfig = {
                host: this.brokerUrl,
                project: this.project,
                path: this.path,
                reconnect: {
                    maxReconnects: 99,
                    maxReconnectDelay: 15
                }
            };

            if (config.useProxy) {
                kolibriConfig.proxy = {
                    host: config.proxyHost,
                    port: config.proxyPort,
                    protocol: config.proxyProtocol
                };
            }
            this.client = KolibriClientFactory.create(kolibriConfig);

            this.client.addOnDisconnectListener(async () => {
                if (this.connected || this.connecting) {
                    this.connected = false;
                    this.connecting = false;

                    this.nodes.forEach((node: any) => {
                        node.status({
                            fill: 'red',
                            shape: 'ring',
                            text: 'node-red:common.status.disconnected'
                        });
                    });
                }
            });

            this.client.addOnWriteListener(async (data: any) => {
                data.forEach((node: any) => {
                    const subscription = this.subscriptions.get(node.path);
                    if (subscription) {
                        subscription.handler(node.path, node.timestamp, node.quality, node.value);
                    }
                });
            });

            this.client.addOnReconnectListener(async () => {
                this.connecting = false;
                this.connected = true;
                this.lazyThis.log('Logged in');

                this.nodes.forEach((node) => {
                    node.status({
                        fill: 'green',
                        shape: 'dot',
                        text: 'node-red:common.status.connected'
                    });
                });

                this.subscriptions.forEach((_subscription: any, key: string) => {
                    this.client.subscribe([{ path: key }]);
                });
            });
        }

        async connect() {
            if (this.connected || this.connecting) {
                return;
            }

            this.connecting = true;

            this.nodes.forEach((node: Node) => {
                node.status({
                    fill: 'yellow',
                    shape: 'ring',
                    text: 'node-red:common.status.connecting'
                });
            });

            try {
                await this.client.connect();
            }
            catch (e: any) {
                this.lazyThis.error(e?.message || 'unknown error');
                this.connected = false;
                this.connecting = false;
                this.nodes.forEach((node: any) => {
                    node.status({
                        fill: 'red',
                        shape: 'ring',
                        text: e?.message || 'unknown error'
                    });
                });
                return;
            }

            try {
                const loginParams: LoginParams = {
                    user: this.user,
                    password: this.password,
                    interval: 15,
                    timeout: 5
                };

                if (this.clientId) {
                    loginParams.client = this.clientId as string;
                }
                else {
                    const uuid = this.lazyThis.context().global.get('client-' + this.lazyThis.id);
                    if (uuid) {
                        loginParams.client = uuid as string;
                    }
                }

                const loginResult: LoginResult = await this.client.login(loginParams);

                if (!this.clientId) {
                    this.lazyThis.context().global.set('client-' + this.lazyThis.id, loginResult.client);
                }

                this.connecting = false;
                this.connected = true;
                this.lazyThis.log('Logged in');

                this.nodes.forEach((node: any) => {
                    node.status({
                        fill: 'green',
                        shape: 'dot',
                        text: 'node-red:common.status.connected'
                    });
                });
            }
            catch (e: any) {
                this.lazyThis.error('Login failed: ' + e?.message || 'unknown error');
                this.connected = false;
                this.connecting = false;
                if (e?.message === 'Access denied error') {
                    e.message = 'invalid broker settings';
                }

                this.nodes.forEach((node: any) => {
                    node.status({
                        fill: 'red',
                        shape: 'ring',
                        text: e?.message || 'unknown error'
                    });
                });
            }
        }

        async disconnect(): Promise<void> {
            if (!this.connected) {
                return;
            }
            this.lazyThis.log('Closing connection');
            this.connected = false;
            this.connecting = false;
            await this.client.disconnect();
        }

        async register(node: Node) {
            this.nodes.set(node.id, node);
            // Establish the Broker connection when the first node is registered
            if (this.nodes.size === 1) {
                await this.connect();
            }
        }

        async deregister(node: any): Promise<void> {
            this.nodes.delete(node.id);
            if (this.nodes.size === 0) {
                await this.disconnect();
            }
        }

        async subscribe(subscribeParams: SubscribeParams): Promise<void> {
            const subscription = this.subscriptions.get(subscribeParams.path);

            if (!this.connected || subscription?.subscribed) {
                return;
            }

            try {
                const results = await this.client.subscribe([subscribeParams]);

                results.forEach((result: SubscribeResult) => {
                    const subscriptionToUpdate = this.subscriptions.get(result.path);
                    if (subscriptionToUpdate) {
                        subscriptionToUpdate.subscribed = true;
                    }
                });
            }
            catch (e: any) {
                this.lazyThis.error('Subscription failed: ' + e?.message || 'unknown error' + ' ' + subscribeParams.path);

                // Change status for node
                this.nodes.forEach((node: any) => {
                    if (node.path === subscribeParams.path) {
                        node.status({
                            fill: 'yellow',
                            shape: 'ring',
                            text: e?.message || 'unknown error'
                        });
                    }
                });
            }
        }

        addSubscribeListener(path: string, listener: (path: string, ts: number, qual: number, value: any) => void): void {
            if (this.subscriptions.has(path)) {
                return;
            }

            this.subscriptions.set(path, {
                subscribed: false,
                handler: (mpath: any, mts: any, mqual: any, mval: any) => {
                    if (mpath === path) {
                        listener(mpath, mts, mqual, mval);
                    }
                }
            });
        }

        async unsubscribe(unsubscribeParams: UnsubscribeParams): Promise<void> {
            const subscription = this.subscriptions.get(unsubscribeParams.path);

            if (!this.connected || !subscription) {
                return;
            }

            try {
                await this.client.unsubscribe([unsubscribeParams]);

                subscription.subscribed = false;
            }
            catch (e: any) {
                this.lazyThis.warn('Unsubscribe failed ' + e?.message || 'unknown error');
            }
        }

        async write(pointState: { path: string; value: any; timestamp: number; quality: number; }): Promise<void> {
            if (!this.connected) {
                return;
            }
            const writeParams: WriteParams = { nodes: [pointState] };
            try {
                await this.client.write(writeParams);
            }
            catch (e: any) {
                this.lazyThis.error('Write failed: ' + e?.message || 'unknown error' + ' on path: ' + pointState.path);

                this.nodes.forEach((node: any) => {
                    if (node.path === pointState.path) {
                        node.status({
                            fill: 'yellow',
                            shape: 'ring',
                            text: e?.message || 'unknown error'
                        });
                    }
                });
            }
        }
    }
    RED.nodes.registerType('kolibri-broker', KolibriBrokerNode as any, {
        credentials: {
            user: { type: 'text' },
            password: { type: 'password' }
        }
    });
};

module.exports = nodeInit;
export = nodeInit;
