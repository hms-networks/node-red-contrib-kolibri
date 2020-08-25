/*---------------------------------------------------------------------------------------------
 *  Copyright (c) HMS Networks. All rights reserved.
 *  Licensed under the Apache License, Version 2.0.
 *  See License in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const EventEmitter = require('events');
const WebSocket = require('ws');
const HttpsProxyAgent = require('https-proxy-agent');

class Connection extends EventEmitter {
    constructor(address, options) {
        super();
        this.address = address;
        this.options = options;
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

        this.cid = options.cid || 0;
        this.sid = 0;
        this.tid = 0;
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
            if(this.options.proxy){
                const agent = new HttpsProxyAgent(this.options.proxy);
                this.wsOptions.agent = agent;
            }
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
