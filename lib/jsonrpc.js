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

module.exports = {
    //--------------------------------------------------------------------------
    // JSON-RPC types
    //--------------------------------------------------------------------------
    type: {
        REQUEST: 1,
        NOTIFICATION: 2,
        RESULT: 3,
        ERROR: 4,
        REQUEST_ROUTED: 5,
        NOTIFICATION_ROUTED: 6,
        RESULT_ROUTED: 7,
        ERROR_ROUTED: 8,
        INVALID: 9
    },

    //--------------------------------------------------------------------------
    // Function: getType(rpc)
    //--------------------------------------------------------------------------
    getType: function (rpc) {
        // JSON-RPC 2.0
        if (typeof rpc !== 'object' || !rpc.hasOwnProperty('jsonrpc') || rpc.jsonrpc !== '2.0') {
            return this.type.INVALID;
        }

        // Request or notification
        if (rpc.hasOwnProperty('method')) {
            if (rpc.hasOwnProperty('result') || rpc.hasOwnProperty('error')) {
                return this.type.INVALID;
            }
            if (rpc.hasOwnProperty('params') && typeof rpc.params !== 'object') {
                return this.type.INVALID;
            }
            if (rpc.hasOwnProperty('_server')) {
                return rpc.hasOwnProperty('id')
                    ? this.type.REQUEST_ROUTED
                    : this.type.NOTIFICATION_ROUTED;
            }
            else {
                return rpc.hasOwnProperty('id') ? this.type.REQUEST : this.type.NOTIFICATION;
            }
        }

        // Successful response
        if (rpc.hasOwnProperty('result')) {
            if (rpc.hasOwnProperty('error')) {
                return this.type.INVALID;
            }
            return rpc.hasOwnProperty('_server') ? this.type.RESULT_ROUTED : this.type.RESULT;
        }

        // Error response
        if (rpc.hasOwnProperty('error')) {
            if (
                typeof rpc.error !== 'object' ||
                !rpc.error.hasOwnProperty('code') ||
                !rpc.error.hasOwnProperty('message')
            ) {
                return this.type.INVALID;
            }
            return rpc.hasOwnProperty('_server') ? this.type.ERROR_ROUTED : this.type.ERROR;
        }

        return this.type.INVALID;
    },

    //--------------------------------------------------------------------------
    // Function: request(method, id, [params], [server])
    //--------------------------------------------------------------------------
    request: function (method, id, params, server) {
        let rpc = {
            jsonrpc: '2.0',
            method: method,
            id: id
        };
        if (server) {
            rpc._server = server;
        }
        if (params) {
            rpc.params = params;
        }
        return rpc;
    },

    //--------------------------------------------------------------------------
    // Function: result(id, result)
    //--------------------------------------------------------------------------
    result: function (id, result, server) {
        let rpc = {
            jsonrpc: '2.0',
            id: id,
            result: typeof result === 'undefined' ? null : result
        };
        if (server) {
            rpc._server = server;
        }
        return rpc;
    },

    //--------------------------------------------------------------------------
    // Function: error(id, error, [server])
    //--------------------------------------------------------------------------
    error: function (id, error, server) {
        let rpc = {
            jsonrpc: '2.0',
            id: id,
            error: error
        };
        if (server) {
            rpc._server = server;
        }
        return rpc;
    },

    //--------------------------------------------------------------------------
    // Function: notification(method, [params], [server])
    //--------------------------------------------------------------------------
    notification: function (method, params, server) {
        let rpc = {
            jsonrpc: '2.0',
            method: method
        };
        if (params) {
            rpc.params = params;
        }
        if (server) {
            rpc._server = server;
        }
        return rpc;
    },

    //--------------------------------------------------------------------------
    // Function: parse(data)
    //--------------------------------------------------------------------------
    parse: function (data) {
        return JSON.parse(String(data));
    }
};
