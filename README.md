# Node Red Kolibri Nodes
The repository contains two types of Node-Red nodes. Kolibri in and Kolibri out. Both nodes are able to connect to a running instance of the Kolibri Broker. 

## Nodes Overview

##### Kolibri in 
This node can subscribe to a specific data point path of the connected Kolibri Broker.  

##### Kolibri out
This node you can publish to a specific data point path of the connected Kolibri Broker.

## Getting started

#### Installation


#### Node Configuration

Add a node to a node red flow. Edit the node by double click on it. 
On the edit page you can adjust three properties.

- Kolibri Broker: Add or choose a Broker connection. New Broker connection requires the following properties.
    - Server Url
    - Server Port
    - Username
    - Password 
- Data Point Path: Path to the data variable
- Name: Node name, that is displayed in the flow

After deploying the flow. The Nodes are trying to connect to the configured broker. If the connection is established sucessfully a green "connected" label is displayed. If the connection is closed a red "disconnected" is displayed.