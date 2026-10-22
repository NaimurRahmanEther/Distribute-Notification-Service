# Architecture change

The current project is a modular monolith. The earlier separate Auth/Notification services and API gateway have been retired.

See the [root architecture and setup](../README.md), [backend reading order](../backend/README.md) and [client contracts](client-contracts.md). The backend owns one PostgreSQL database and uses one Redis instance for rate limits, queues and presence. Nginx only reverse-proxies HTTP/WebSockets. Old database volumes are not automatically imported.
