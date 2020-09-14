/*---------------------------------------------------------------------------------------------
 *  COPYRIGHT NOTIFICATION (c) 2020 HMS Industrial Networks AB
 * --------------------------------------------------------------------------------------------
 *  Licensed under the Apache License, Version 2.0.
 *  See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const tools = require('../lib/tools.js');

module.exports = function (RED) {
    class KolibriOutNode {
        constructor(config) {
            // Create a RED node
            RED.nodes.createNode(this, config);

            // Copy "this" object in case we need it in context of callbacks of other functions.
            let self = this;

            // Store local copies of the node configuration (as defined in the .html)
            self.path = config.path;
            self.broker = config.broker;
            self.brokerConn = RED.nodes.getNode(self.broker);

            self.status({
                fill: 'red',
                shape: 'ring',
                text: 'node-red:common.status.disconnected'
            });

            if (self.brokerConn) {
                if (self.path) {
                    self.brokerConn.register(self);
                    self.status({
                        fill: 'green',
                        shape: 'dot',
                        text: 'node-red:common.status.connected'
                    });
                }
                else {
                    self.error('Kolibri: path not defined for node ' + self.name);
                }

                // Respond to inputs...
                self.on('input', function (msg) {
                    if (self.brokerConn.connected) {
                        if (self.path) {
                            let ps = {
                                path: self.path,
                                value: msg.payload,
                                timestamp: msg.timestamp || tools.currentTimestamp(),
                                quality: msg.quality || 1
                            };
                            self.brokerConn.write(ps);
                        }
                        else {
                            self.error('Kolibri: path not defined for node ' + self.name);
                        }
                    }
                });

                self.on('close', (done) => {
                    if (self.brokerConn) {
                        self.status({
                            fill: 'red',
                            shape: 'ring',
                            text: 'node-red:common.status.disconnected'
                        });
                        self.brokerConn.unsubscribe(self.path);
                        self.brokerConn.deregister(self, done);
                    }
                    done();
                });
            }
            else {
                self.error('Kolibri: missing broker configuration');
            }
        }
    }

    RED.nodes.registerType('kolibri out', KolibriOutNode);
};
