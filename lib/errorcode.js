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

const errorcode = {
    // Kolibri error type
    KolibriError: function (error, data) {
        this.name = 'KolibriError';
        this.message = error.message;
        this.kolibriError = error;
        if (typeof data !== 'undefined') {
            this.kolibriError.data = data;
        }
        else if (this.kolibriError.hasOwnProperty('data')) {
            delete this.kolibriError.data;
        }
    },

    // Get error object from error code
    errorFromCode: function (code) {
        let errors = Object.keys(errorcode).filter(function (member) {
            return errorcode[member].hasOwnProperty('code');
        });
        for (let i = 0, len = errors.length; i < len; i++) {
            if (errorcode[errors[i]].code === code) {
                return errorcode[errors[i]];
            }
        }
        // Error code not found, return GENERAL_ERROR
        return this.GENERAL_ERROR;
    },

    // Kolibri protocol error codes
    GENERAL_ERROR: {
        code: 1,
        message: 'general error'
    },
    INVALID_OPCODE: {
        code: 2,
        message: 'invalid opcode'
    },
    INVALID_OPTION: {
        code: 3,
        message: 'invalid option'
    },
    INVALID_PROTOCOL_VERSION: {
        code: 4,
        message: 'invalid protocol version'
    },
    ACCESS_DENIED: {
        code: 5,
        message: 'access denied'
    },
    INVALID_PATH: {
        code: 6,
        message: 'invalid path'
    },
    INVALID_NODE_TYPE: {
        code: 7,
        message: 'invalid node type'
    },
    INVALID_NODE_INDEX: {
        code: 8,
        message: 'invalid node index'
    },
    INVALID_NODE_PROPERTY: {
        code: 9,
        message: 'invalid node property'
    },
    INVALID_NODE_STATE: {
        code: 10,
        message: 'invalid node state'
    },
    INVALID_SEQUENCE_NUMBER: {
        code: 11,
        message: 'invalid sequence number'
    },
    INVALID_DATA_TYPE: {
        code: 12,
        message: 'invalid data type'
    },
    INVALID_RECIPIENT: {
        code: 13,
        message: 'invalid recipient'
    },
    PROTOCOL_ERROR: {
        code: 14,
        message: 'protocol error'
    },
    MISSING_PARAMETER: {
        code: 15,
        message: 'missing parameter'
    },
    INVALID_PARAMETER: {
        code: 16,
        message: 'invalid parameter'
    },
    INVALID_VALUE: {
        code: 17,
        message: 'invalid value'
    },
    ITEM_NOT_FOUND: {
        code: 18,
        message: 'item not found'
    },
    ITEM_EXISTS: {
        code: 19,
        message: 'item exists'
    },

    // RPC specific error codes
    PARSE_ERROR: {
        code: -32700,
        message: 'parse error'
    },
    INVALID_REQUEST: {
        code: -32600,
        message: 'invalid request'
    },
    METHOD_NOT_FOUND: {
        code: -32601,
        message: 'method not found'
    },
    INVALID_PARAMS: {
        code: -32602,
        message: 'invalid parameters'
    },
    INTERNAL_ERROR: {
        code: -32603,
        message: 'internal error'
    },
    SERVER_ERROR: {
        code: -32000,
        message: 'server error'
    },

    // Kolibri WebSocket close() codes
    WS_CLOSE_KEEPALIVE: 4000,
    WS_CLOSE_SCOPE: 4001,
    WS_CLOSE_USER: 4002,
    WS_CLOSE_RETRY: 4003,
    WS_CLOSE_PROTOCOL: 4004,
    WS_CLOSE_THROTTLE: 4005
};

module.exports = errorcode;
