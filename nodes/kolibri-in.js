/*---------------------------------------------------------------------------------------------
 *  COPYRIGHT NOTIFICATION (c) 2020 HMS Industrial Networks AB
 * --------------------------------------------------------------------------------------------
 *  Licensed under the Apache License, Version 2.0.
 *  See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

module.exports = function (RED) {
    class KolibriInNode {
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
                    self.brokerConn.subscribe(self.path, function (path, ts, qual, value) {
                        let msg = {
                            path: path,
                            timestamp: ts,
                            quality: qual,
                            payload: value
                        };
                        self.send(msg);
                    });
                    if (self.brokerConn.connected) {
                        self.status({
                            fill: 'green',
                            shape: 'dot',
                            text: 'node-red:common.status.connected'
                        });
                    }
                }
                else {
                    self.error('Kolibri: path not defined for node ' + self.name);
                }

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

    RED.nodes.registerType('kolibri in', KolibriInNode);
};
