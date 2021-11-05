# Node-RED Kolibri Nodes

There are two types of Node-RED nodes, __kolibri in__ and __kolibri out__, which can be used to exchange data with a Kolibri Broker (e.g. HMS Hub).

## Attention: 
Since version the plugin version 1.0.0 we only support the Kolibri Protocol V3.2. Logging in with a Kolibri Version v3.2 to a Kolibri Broker will convert the user to a new format introduced in v2.0. After that it is not possible to use the original ('kolibri') protocol version with that user. If you want to continue using the older Kolibri Protocol version please use the plugin version 0.4.1.

Please also keep in mind that the timestamp resolution changed since the kolibri protocol v2.0 to microseconds resolution.

For more details about changes in v1.0.0 please see CHANGELOG.md or the release logs.

## Nodes Overview

### Kolibri in

This node can subscribe to the specified data point path of the connected Kolibri Broker.
The __kolibri in__ has the following properties.

Required:

- Kolibri broker
- Data Point Path: Path to the data variable

Optional:

- Name: Node name that is displayed in the Node-RED flow
- Resume: if true, all data values from last successful request will be
          included. The client must login with the same clientId from the
          session that should be resumed.

### Kolibri out

This node can publish to the specified data point path of the connected Kolibri Broker.
The __kolibri out__ has the following properties.

Required:

- Kolibri broker
- Data Point Path: Path to the data variable

Optional:

- Name: Node name that is displayed in the Node-RED flow

## Getting started

Add a node to a Node-RED flow. Edit the node configurations, deploy it.

### Node Configuration

On the edit page you can adjust three properties.

Kolibri Broker: Add or choose a Broker connection. New Broker connections require the following properties.

Required:

- Server URL
- Server Port
- Username
- Password
- Path: Login path
- Kolibri protocol version
- Project

Optional:

- Name: Node name that is displayed in the Node-RED flow
- Enable Proxy
- Proxy Server
- Proxy Port
- ClientId: Client name or uuid of the connecting client (required if **resume** is set on the **Kolibri In Node**)

After deploying the flow the Nodes are trying to connect to the configured Broker(s). If the connections are established successfully a green "connected" label is displayed. If the connection is closed a red "disconnected" label is displayed.
