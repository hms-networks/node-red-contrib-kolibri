# CHANGELOG

## 1.0.0

### Breaking Change

The nodes establish the connection to the Kolibri Broker with the Kolibri Protocol used in the kolibri-js-client. Currently the Kolibri Consumer Protocol version v3.2 is used. The Kolibri Protocol v1.0 is no longer supported.

Attention: Logging in with a Kolibri Version v3.2 will convert the user a new format introduced in v2.0. After that it is not possible to use the v1.0 ('kolibri') protocol version with that user.
Please keep in mind that the timestamp resolution changed also since the the kolibri protocol v2.0 to microseconds resolution.

### Changes

- Nodes are rewritten in Typescript
- Replaced custom client implementation with @hms-networks/kolibri-js-client to communicate with the Kolibri Broker.
