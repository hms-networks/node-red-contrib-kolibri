# Node-RED Kolibri Nodes

**Work in progress!**

There are two types of Node-RED nodes, __kolibri in__ and __kolibri out__, which can be used to exchange data with a Kolibri Broker (e.g. HMS Hub).

## Nodes Overview

### Kolibri in

This node can subscribe to the specified data point path of the connected Kolibri Broker.

### Kolibri out

This node can publish to the specified data point path of the connected Kolibri Broker.

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
- Data Point Path: Path to the data variable
- Kolibri protocol version
- Project (only for versions >v1.0.kolibri)

Attention: Logging in with a Kolibri Version >v1.0.kolibri will lock the user to this version. It is not possible to use v1.0.kolibri afterwards.

Optional:

- Name: Node name that is displayed in the Node-RED flow
- Enable Proxy
- Proxy Server
- Proxy Port

After deploying the flow the Nodes are trying to connect to the configured Broker(s). If the connections are established successfully a green "connected" label is displayed. If the connection is closed a red "disconnected" label is displayed.
