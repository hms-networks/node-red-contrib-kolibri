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

const tools = require('../lib/tools.js');

module.exports = function (RED) {
    function KolibriOutNode(config) {
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

    RED.nodes.registerType('kolibri out', KolibriOutNode);
};
