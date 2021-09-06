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


import { EditorRED } from "node-red";
import { KolibriBrokerEditorNodeCredentials, KolibriBrokerEditorNodeProperties } from "./modules/types";

declare const RED: EditorRED;

RED.nodes.registerType<KolibriBrokerEditorNodeProperties, KolibriBrokerEditorNodeCredentials>("kolibri-broker", {
  category: 'config',
  defaults: {
    name: { value: '', required: true },
    broker: { value: '', required: true, validate: RED.validators.regex(/(?:^|[ \t])((?:localhost|[\w-]+(?:\.[\w-]+)+)(\/\S*)?)/i) },
    port: { value: 443, required: true, validate: RED.validators.number() },
    useProxy: { value: false, required: false },
    proxyHost: { value: "localhost", required: false },
    proxyPort: {
      value: 8080, required: false, validate: function (v) {
        const isEnabled = $("#node-config-input-useProxy").is(':checked')
        if (isEnabled) {
          return !isNaN(v as any) && !isNaN((Number.parseInt(v))) && Number.parseInt(v) >= 0;
        }
        return true;
      }
    },
    proxyProtocol: {
      value: 'http', required: true, validate: function (v) {
        const isEnabled = $("#node-config-input-useProxy").is(':checked')
        if (isEnabled) {
          if (v === 'http' || v === 'https') {
            return true;
          }
          return false;
        }
        return true;
      }
    },
    project: { value: '', required: true }
  },
  credentials: {
    user: { type: 'text' },
    password: { type: 'password' }
  },
  label: function () {
    return this.name || 'kolibri-broker';
  },
  oneditprepare: function () {
    const tabs = RED.tabs.create({
      id: 'node-config-kolibri-broker-tabs',
      onchange: function (tab: any) {
        $('#node-config-kolibri-broker-tabs-content').children().hide();
        $('#' + tab.id).show();
      }
    } as any);
    tabs.addTab({
      id: 'kolibri-broker-tab-connection',
      label: 'Connection'
    }, 0);
    tabs.addTab({
      id: 'kolibri-broker-tab-security',
      label: 'Security'
    }, 1);
    setTimeout(() => { tabs.resize(); }, 0);
  }
});
