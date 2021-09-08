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


import { NodeInitializer, Node } from "node-red";
import { IKolibriBrokerNode } from "../kolibri-broker/modules/types";
import { IKolibriInNode, KolibriInNodeDef } from "./modules/types";

const nodeInit: NodeInitializer = (RED): void => {
  class KolibriInNode implements IKolibriInNode {
    name: string;
    path: string;
    broker: string;
    brokerConn: IKolibriBrokerNode;
    constructor(config: KolibriInNodeDef) {
      const lazyThis = this as unknown as Node & IKolibriInNode;
      RED.nodes.createNode(lazyThis, config);

      this.name = config.name;
      this.path = config.path;
      this.broker = config.broker;
      this.brokerConn = RED.nodes.getNode(config.broker) as unknown as IKolibriBrokerNode;

      lazyThis.status({
        fill: 'red',
        shape: 'ring',
        text: 'node-red:common.status.disconnected'
      });

      if (!this.brokerConn) {
        lazyThis.error('Kolibri: missing broker configuration');
        return;
      }

      if (!this.path) {
        lazyThis.error('Kolibri: path not defined for node ' + this.name);
        return;
      }

      this.brokerConn.register(this)
        .then(() => {
          this.brokerConn.addSubscribeListener(this.path, (path: string, ts: number, qual: number, value: any) => {
            const msg = {
              path: path,
              timestamp: ts,
              quality: qual,
              payload: value
            };
            lazyThis.send(msg);
          });
          return;
        }).then(() => {
          return this.brokerConn.subscribe(this.path)
        })
        .then(() => {
          if (this.brokerConn.connected) {
            lazyThis.status({
              fill: 'green',
              shape: 'dot',
              text: 'node-red:common.status.connected'
            });
          }
        }).catch((e) => {
          lazyThis.error('Error during node creation: ' + e);
        });

      lazyThis.on('close', (done: any) => {
        if (this.brokerConn) {
          lazyThis.status({
            fill: 'red',
            shape: 'ring',
            text: 'node-red:common.status.disconnected'
          });
          this.brokerConn.unsubscribe(this.path)
            .then(() => {
              return this.brokerConn.deregister(this);
            })
        }
        done();
      });
    }
  }

  RED.nodes.registerType("kolibri-in", KolibriInNode as any);
};

module.exports = nodeInit;
export = nodeInit;