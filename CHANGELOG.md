# [0.1.0-develop.7](https://git.lumeweb.com/LumeWeb/kernel-swarm/compare/v0.1.0-develop.6...v0.1.0-develop.7) (2023-09-02)

# [0.1.0-develop.6](https://git.lumeweb.com/LumeWeb/kernel-swarm/compare/v0.1.0-develop.5...v0.1.0-develop.6) (2023-09-02)

# [0.1.0-develop.5](https://git.lumeweb.com/LumeWeb/kernel-swarm/compare/v0.1.0-develop.4...v0.1.0-develop.5) (2023-07-29)

# [0.1.0-develop.4](https://git.lumeweb.com/LumeWeb/kernel-swarm/compare/v0.1.0-develop.3...v0.1.0-develop.4) (2023-07-24)


### Bug Fixes

* on swarmInstance init, add every relay as an explicit peer ([873bc3d](https://git.lumeweb.com/LumeWeb/kernel-swarm/commit/873bc3da52d206635d7dea5f8090e1a05ccf6828))
* patch dht-relay handshake logic to prevent duplicate processing ([12cb3a3](https://git.lumeweb.com/LumeWeb/kernel-swarm/commit/12cb3a3b5ee16bbda03458627a0ea67f89d7576b))
* patch protomux to use the buffers arraybuffer byteLength ([dcad699](https://git.lumeweb.com/LumeWeb/kernel-swarm/commit/dcad699ae1f5f14e3ffe3844607028a6cd53130e))

# [0.1.0-develop.3](https://git.lumeweb.com/LumeWeb/kernel-swarm/compare/v0.1.0-develop.2...v0.1.0-develop.3) (2023-07-23)


### Features

* add socketSetKeepAlive api method ([ac58773](https://git.lumeweb.com/LumeWeb/kernel-swarm/commit/ac5877385b96b7162a646cadc9b9512759f21bbb))

# [0.1.0-develop.2](https://git.lumeweb.com/LumeWeb/kernel-swarm/compare/v0.1.0-develop.1...v0.1.0-develop.2) (2023-07-23)


### Bug Fixes

* remove unneeded mutex call ([ad4511c](https://git.lumeweb.com/LumeWeb/kernel-swarm/commit/ad4511c3853d6cd3fc5c3f0490012ca34f5c66ce))

# [0.1.0-develop.1](https://git.lumeweb.com/LumeWeb/kernel-swarm/compare/v0.0.2-develop.10...v0.1.0-develop.1) (2023-07-22)


### Features

* add socketListeners api call ([e56cbec](https://git.lumeweb.com/LumeWeb/kernel-swarm/commit/e56cbecbcf6641ea12059868829b9428a3c327c2))
* track what modules are listening on a socket connection by their module id ([39a9114](https://git.lumeweb.com/LumeWeb/kernel-swarm/commit/39a91144de1641ec17ba02888409009310aca67a))

## [0.0.2-develop.10](https://git.lumeweb.com/LumeWeb/kernel-swarm/compare/v0.0.2-develop.9...v0.0.2-develop.10) (2023-07-22)


### Bug Fixes

* remove mutex and don't make cb async to prevent race condition ([04c7292](https://git.lumeweb.com/LumeWeb/kernel-swarm/commit/04c7292e44a9ad272543ff241dad72af4ce5ccaa))

## [0.0.2-develop.9](https://git.lumeweb.com/LumeWeb/kernel-swarm/compare/v0.0.2-develop.8...v0.0.2-develop.9) (2023-07-12)

## [0.0.2-develop.8](https://git.lumeweb.com/LumeWeb/kernel-swarm/compare/v0.0.2-develop.7...v0.0.2-develop.8) (2023-07-11)

## [0.0.2-develop.7](https://git.lumeweb.com/LumeWeb/kernel-swarm/compare/v0.0.2-develop.6...v0.0.2-develop.7) (2023-07-08)


### Bug Fixes

* pin buffer version ([928cff2](https://git.lumeweb.com/LumeWeb/kernel-swarm/commit/928cff2a083e5282d15882b6be05ab42d6e2cab2))

## [0.0.2-develop.6](https://git.lumeweb.com/LumeWeb/kernel-swarm/compare/v0.0.2-develop.5...v0.0.2-develop.6) (2023-07-08)


### Bug Fixes

* need to patch our own sdk for bundling so we don't need to put the hack in directly ([10170bd](https://git.lumeweb.com/LumeWeb/kernel-swarm/commit/10170bd673ccd4070c2ab9e0b444cba81080311d))

## [0.0.2-develop.5](https://git.lumeweb.com/LumeWeb/kernel-swarm/compare/v0.0.2-develop.4...v0.0.2-develop.5) (2023-07-05)


### Bug Fixes

* need to loop over all protomux message args and await any promises ([3a4cfd4](https://git.lumeweb.com/LumeWeb/kernel-swarm/commit/3a4cfd45a6515fac5a4205d0c2503864efbd33bf))

## [0.0.2-develop.4](https://git.lumeweb.com/LumeWeb/kernel-swarm/compare/v0.0.2-develop.3...v0.0.2-develop.4) (2023-07-05)


### Bug Fixes

* add patch-package to postinstall ([5816ab3](https://git.lumeweb.com/LumeWeb/kernel-swarm/commit/5816ab308ada8f489d4f01d6110bf2dd14092412))
* keypair needs to be a private extended key ([57496da](https://git.lumeweb.com/LumeWeb/kernel-swarm/commit/57496da5cc4c0aa4c0fd941d45d32ae4ed798d36))
* need to add browser flag to .presetterrc.json ([2f92782](https://git.lumeweb.com/LumeWeb/kernel-swarm/commit/2f92782995af6a15719325e482a077e87a7b6b6e))
* we need to use the wasm libsodium @screamingvoid/sodium-universal ([411d351](https://git.lumeweb.com/LumeWeb/kernel-swarm/commit/411d35154f6a3176a9ee8c2033ac3ea2877d6be9))

## [0.0.2-develop.3](https://git.lumeweb.com/LumeWeb/kernel-swarm/compare/v0.0.2-develop.2...v0.0.2-develop.3) (2023-07-01)

## [0.0.2-develop.2](https://git.lumeweb.com/LumeWeb/kernel-swarm/compare/v0.0.2-develop.1...v0.0.2-develop.2) (2023-07-01)


### Bug Fixes

* rename var nextId ([99b355f](https://git.lumeweb.com/LumeWeb/kernel-swarm/commit/99b355f7a1e8711d7d475d88cbd09338de0e8f1f))

## [0.0.2-develop.1](https://git.lumeweb.com/LumeWeb/kernel-swarm/compare/v0.0.1...v0.0.2-develop.1) (2023-07-01)
