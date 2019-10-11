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

const EventEmitter = require('events');
const WebSocket = require('ws');

class Connection extends EventEmitter {
    constructor(address, options) {
        super();
        this.address = address;

        // WebSocket sub-protocol
        this.wsProtocol = 'kolibri';

        // WebSocket options
        this.wsOptions = {
            protocolVersion: 13,
            perMessageDeflate: false,
            ca: options.ca || [],
            rejectUnauthorized: options.rejectUnauthorized || false,
            maxPayLoad: options.maxPayload || 1 * 1024 * 1024
        };

        this.ws = null;

        this.retries = options.connectRetries || 0;
        this.minRetryInterval = options.connectMinRetryInterval || 5;
        this.maxRetryInterval = options.connectMaxRetryInterval || 300;
        this.cid = options.cid || 0;
        this.sid = 0;
        this.tid = 0;
        this.counter = 0;
        this.interval = 0;
        this.handler = null;
    }
    nextSid() {
        this.sid = this.sid === 65535 ? 1 : this.sid + 1;
        return this.sid;
    }

    nextTid() {
        this.tid = this.tid === 65535 ? 1 : this.tid + 1;
        return this.tid;
    }

    connect() {
        // Create WebSocket connection
        try {
            this.ws = new WebSocket(this.address, this.wsProtocol, this.wsOptions);
        }
        catch (error) {
        }
    }

    start() {
        this.connect();
    }
};

module.exports = Connection;
