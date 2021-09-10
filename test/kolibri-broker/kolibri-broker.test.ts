/*
* Copyright 2021 HMS Industrial Networks AB
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http: //www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/


import testHelper, { TestFlowsItem } from 'node-red-node-test-helper';
import KolibriBrokerNode from '../../src/nodes/kolibri-broker/kolibri-broker';
import { KolibriBrokerNodeDef } from '../../src/nodes/kolibri-broker/modules/types';

type FlowsItem = TestFlowsItem<KolibriBrokerNodeDef>;
type Flows = Array<FlowsItem>;

describe('kolibri-broker node', () => {
    beforeEach((done) => {
        testHelper.startServer(done);
    });

    afterEach((done) => {
        testHelper.unload().then(() => {
            testHelper.stopServer(done);
        });
    });

    it('should be loaded', (done) => {
        const flows: Flows = [
            { id: 'n1', type: 'kolibri-broker', name: 'KolibriBroker' }
        ];
        testHelper.load(KolibriBrokerNode, flows, () => {
            const n1 = testHelper.getNode('n1');
            expect(n1).toBeTruthy();
            expect(n1.name).toEqual('KolibriBroker');
            done();
        });
    });
});
