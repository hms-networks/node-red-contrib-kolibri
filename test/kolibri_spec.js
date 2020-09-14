/*---------------------------------------------------------------------------------------------
 *  COPYRIGHT NOTIFICATION (c) 2014-2019 Beck IPC GmbH
 *  COPYRIGHT NOTIFICATION (c) 2020 HMS Industrial Networks AB
 * --------------------------------------------------------------------------------------------
 *  Licensed under the Apache License, Version 2.0.
 *  See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const helper = require('node-red-node-test-helper');
const kolibriIn = require('../nodes/kolibri-in.js');
const kolibriOut = require('../nodes/kolibri-out.js');

helper.init(require.resolve('node-red'));

describe('kolibri Node', function () {
    beforeEach(function (done) {
        helper.startServer(done);
    });

    afterEach(function (done) {
        helper.unload();
        helper.stopServer(done);
    });
    it('kolibri in should be loaded', function (done) {
        let flow = [{ id: 'n1', type: 'kolibri in', name: 'test name' }];
        helper.load(kolibriIn, flow, function () {
            let node = helper.getNode('n1');
            node.should.have.property('name', 'test name');
            done();
        });
    });

    it('kolibri out should be loaded', function (done) {
        let flow = [{ id: 'n2', type: 'kolibri out', name: 'test name' }];
        helper.load(kolibriOut, flow, function () {
            let node = helper.getNode('n2');
            node.should.have.property('name', 'test name');
            done();
        });
    });
});
