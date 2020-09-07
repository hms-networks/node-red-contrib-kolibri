/*---------------------------------------------------------------------------------------------
 *  COPYRIGHT NOTIFICATION (c) 2020 HMS Industrial Networks AB
 * --------------------------------------------------------------------------------------------
 *  Licensed under the Apache License, Version 2.0.
 *  See License in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const tools = require('../lib/tools.js');

module.exports = function (RED) {
    class KolibriOutNode {
        constructor(config) {
            // Create a RED node
            RED.nodes.createNode(this, config);
            // Store local copies of the node configuration (as defined in the .html)
            this.path = config.path;
            this.broker = config.broker;
            this.brokerConn = RED.nodes.getNode(this.broker);
            // Copy "this" object in case we need it in context of callbacks of other functions.
            let node = this;
            this.status({
                fill: 'red',
                shape: 'ring',
                text: 'node-red:common.status.disconnected'
            });

            if (this.brokerConn) {
                if (this.path) {
                    node.brokerConn.register(this);
                    node.status({
                        fill: 'green',
                        shape: 'dot',
                        text: 'node-red:common.status.connected'
                    });
                }
                else {
                    this.error('Kolibri: path not defined for ID ' + this.node.id);
                }

                // Respond to inputs....
                this.on('input', function (msg) {
                    if (this.brokerConn.connected) {
                        if (this.path) {
                            let ps = {
                                path: node.path,
                                value: msg.payload,
                                timestamp: msg.timestamp || tools.currentTimestamp(),
                                quality: msg.quality || 1
                            };
                            node.brokerConn.write(ps);
                        } 
                        else {
                            this.error('Kolibri: path not defined');
                        }
                    }
                });

                this.on('close', (done) => {
                    if (node.brokerConn) {
                        node.brokerConn.unsubscribe(node.path);
                        node.brokerConn.deregister(node, done);
                        node.brokerConn.disconnect(node.id);
                        this.status({
                            fill: 'red',
                            shape: 'ring',
                            text: 'node-red:common.status.disconnected'
                        });
                    }
                    done();
                });
                
            }
            else {
                this.error('Kolibri: missing broker configuration');
            }
        }
    }

    RED.nodes.registerType('kolibri out', KolibriOutNode);
};
