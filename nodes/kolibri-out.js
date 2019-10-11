/*---------------------------------------------------------------------------------------------
 *  Copyright (c) HMS Networks. All rights reserved.
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
            if (this.brokerConn) {
                this.status({
                    fill: 'red',
                    shape: 'ring',
                    text: 'node-red:common.status.disconnected'
                });
                // Respond to inputs....
                this.on('input', function (msg) {
                    if (this.brokerConn.connected) {
                        node.status({
                            fill: 'green',
                            shape: 'dot',
                            text: 'node-red:common.status.connected'
                        });
                    }
                    let ps = {
                        path: node.path,
                        value: msg.payload
                    };
                    ps.timestamp = msg.timestamp || tools.currentTimestamp();
                    ps.quality = msg.quality || 1;
                    node.brokerConn.write(ps);
                });
                this.on('close', function () {
                    // Called when the node is shutdown - eg on redeploy.
                    // Allows ports to be closed, connections dropped etc.
                    // eg: node.client.disconnect();
                });
            }
        }
    }

    RED.nodes.registerType('kolibri out', KolibriOutNode);
};
