// @ts-ignore
import Hyperswarm from "@lumeweb/hyperswarm-web";
import type { ActiveQuery } from "libkmodule";
import { addHandler, getSeed, handleMessage } from "libkmodule";
import { handlePresentSeed as handlePresentSeedModule } from "libkmodule/dist/seed.js";
import { Buffer } from "buffer";
import * as ed from "@noble/ed25519";
import b4a from "b4a";
import { pubKeyToIpv6 } from "./addr.js";
import { EventEmitter2 as EventEmitter } from "eventemitter2";
import { logErr } from "libkmodule/dist";
// @ts-ignore
import Protomux from "protomux";
import defer, { DeferredPromise } from "p-defer";

const MAX_PEER_LISTENERS = 20;

interface SwarmConnection {
  swarm: number;
  conn: any;
  channels: Map<number, Protomux>;
}

interface SwarmEvents {
  swarm: number;
  events: EventEmitter;
}

const connections = new Map<number, SwarmConnection>();
const swarmInstances = new Map<number, Hyperswarm>();
const swarmEvents = new Map<number, SwarmEvents>();

let defaultSwarm: Hyperswarm;

let moduleReadyResolve: Function;
let moduleReady: Promise<void> = new Promise((resolve) => {
  moduleReadyResolve = resolve;
});

onmessage = handleMessage;

function idFactory(start = 1) {
  let id = start;

  return function nextId() {
    const nextId = id;
    id += 1;
    return nextId;
  };
}

const getSwarmId = idFactory();
const getSocketId = idFactory();
const getChannelId = idFactory();

addHandler("presentSeed", handlePresentSeed);
addHandler("join", handleJoin);
addHandler("getPeerByPubkey", handleGetPeerByPubkey);

addHandler("addRelay", handleAddRelay);
addHandler("removeRelay", handleRemoveRelay);
addHandler("clearRelays", handleClearRelays);
addHandler("getRelays", handleGetRelays);
addHandler("init", handleInit);
addHandler("ready", handleReady);
addHandler("listenConnections", handleListenConnections, {
  receiveUpdates: true,
});
addHandler("socketGetInfo", handleGetSocketInfo);

addHandler("socketExists", handleSocketExists);
addHandler("socketListenEvent", handleSocketListenEvent, {
  receiveUpdates: true,
});
addHandler("socketWrite", handleWriteSocketEvent);
addHandler("socketClose", handleCloseSocketEvent);
addHandler("createProtomuxChannel", createProtomuxChannel, {
  receiveUpdates: true,
});
addHandler("createProtomuxMessage", createProtomuxMessage, {
  receiveUpdates: true,
});

async function handlePresentSeed(aq: ActiveQuery) {
  const pubkey = await ed.getPublicKey(aq.callerInput.rootKey);
  handlePresentSeedModule({
    callerInput: {
      seed: {
        publicKey: await ed.getPublicKey(aq.callerInput.rootKey),
        secretKey: b4a.concat([aq.callerInput.rootKey, pubkey]),
      },
    },
  } as ActiveQuery);

  if (!defaultSwarm) {
    defaultSwarm = swarmInstances.get(await createSwarm()) as Hyperswarm;
  }
  moduleReadyResolve();
}

async function createSwarm(): Promise<number> {
  const swarmInstance = new Hyperswarm({ keyPair: await getSeed() });
  const id = getSwarmId();
  swarmInstances.set(id, swarmInstance);

  swarmInstance.onSelf("init", () => {
    const swarmInstanceEvents = new EventEmitter();
    swarmInstanceEvents.setMaxListeners(MAX_PEER_LISTENERS);
    swarmEvents.set(id, { swarm: id, events: swarmInstanceEvents });
    swarmInstance.on("connection", (peer: any) => {
      const socketId = getSocketId();
      connections.set(socketId, {
        swarm: id,
        conn: peer,
        channels: new Map<number, Protomux>(),
      });

      peer.once("close", () => {
        connections.delete(socketId);
      });

      swarmInstanceEvents.emit("connection", peer);
    });
  });

  swarmInstance.onSelf("close", (...args) => {
    swarmEvents.get(id)?.events.emit("close", ...args);
    swarmEvents.get(id)?.events.removeAllListeners();
    swarmEvents.delete(id);
  });

  return id;
}

function handleSocketListenEvent(aq: ActiveQuery) {
  const { event = null } = aq.callerInput;

  const socket = validateConnection(aq);

  if (!socket) {
    return;
  }

  if (!event) {
    aq.reject("Invalid event");
    return;
  }

  let responded = false;
  const respond = () => {
    if (responded) {
      return;
    }

    responded = true;
    aq.respond();
  };

  const cb = async (data: Buffer) => {
    await socket.mutex?.waitForUnlock();
    if (responded) {
      return;
    }
    aq.sendUpdate(data);
  };

  socket.on(event, cb);
  socket.once("close", () => {
    socket.off(event, cb);
    respond();
  });

  aq.setReceiveUpdate?.(() => {
    socket.off(event, cb);
    respond();
  });
}

async function handleSocketExists(aq: ActiveQuery) {
  const { id = null } = aq.callerInput;

  aq.respond(connections.has(Number(id)));
}

function handleCloseSocketEvent(aq: ActiveQuery) {
  const socket = validateConnection(aq);

  if (!socket) {
    return;
  }

  socket.end();

  aq.respond();
}

async function handleWriteSocketEvent(aq: ActiveQuery) {
  const socket = validateConnection(aq);

  if (!socket) {
    return;
  }
  const { message = null } = aq.callerInput;

  if (!message) {
    aq.reject("empty message");
    return false;
  }

  await socket.mutex?.waitForUnlock();

  socket.write(message);

  aq.respond();
}

function validateConnection(aq: ActiveQuery): any | boolean {
  const { id = null } = aq.callerInput;

  if (!id || !connections.has(id)) {
    aq.reject("Invalid connection id");
    return false;
  }

  return connections.get(id)?.conn;
}

async function getSwarm(aq: ActiveQuery): Promise<Hyperswarm> {
  await moduleReady;
  let swarm;
  if ("callerInput" in aq && aq.callerInput) {
    swarm = aq.callerInput.swarm ?? null;

    if (swarm && !swarmInstances.has(swarm)) {
      const error = "Invalid swarm id";
      aq.reject(error);
      throw new Error(error);
    }
  }

  if (!swarm) {
    if (defaultSwarm.activeRelay && defaultSwarm.ready) {
      await defaultSwarm.activeRelay.dht._protocol.opened;
    }
    return defaultSwarm;
  }

  if (swarm.activeRelay && swarm.ready) {
    await swarm.activeRelay.dht._protocol.opened;
  }

  return swarmInstances.get(swarm) as Hyperswarm;
}

async function handleAddRelay(aq: ActiveQuery) {
  const { pubkey = null } = aq.callerInput;

  if (!pubkey) {
    aq.reject("invalid pubkey");
    return;
  }

  const swarm = await getSwarm(aq);

  aq.respond(await swarm.addRelay(pubkey));
}

async function handleRemoveRelay(aq: ActiveQuery) {
  const { pubkey = null } = aq.callerInput;

  if (!pubkey) {
    aq.reject("invalid pubkey");
    return;
  }

  const swarm = await getSwarm(aq);

  aq.respond(swarm.removeRelay(pubkey));
}

async function handleClearRelays(aq: ActiveQuery) {
  const swarm = await getSwarm(aq);

  swarm.clearRelays();

  aq.respond();
}

async function handleGetRelays(aq: ActiveQuery) {
  aq.respond(await (await getSwarm(aq)).relays);
}

async function handleJoin(aq: ActiveQuery) {
  const { topic = null } = aq.callerInput;

  const swarm = await getSwarm(aq);

  if (!topic) {
    aq.reject("invalid topic");
    return;
  }
  if (!b4a.isBuffer(topic)) {
    aq.reject("topic must be a buffer");
    return;
  }

  // @ts-ignore
  swarm.join(topic, { server: false });
  aq.respond();
}

async function handleGetPeerByPubkey(aq: ActiveQuery) {
  const { pubkey = null } = aq.callerInput;

  const swarm = await getSwarm(aq);

  if (!pubkey) {
    aq.reject("invalid topic");
    return;
  }

  if (!b4a.isBuffer(pubkey)) {
    aq.reject("pubkey must be a buffer");
    return;
  }

  // @ts-ignore
  if (!swarm._allConnections.has(pubkey)) {
    aq.reject("peer does not exist");
    return;
  }

  // @ts-ignore
  const peer = swarm._allConnections.get(pubkey);

  aq.respond(getSwarmToSocketConnectionId(peer));
}

async function handleInit(aq: ActiveQuery) {
  const swarm = await getSwarm(aq);
  try {
    await swarm.init();
  } catch (e) {
    aq.reject((e as Error).message);
    return;
  }

  aq.respond();
}

async function handleReady(aq: ActiveQuery) {
  const swarm = await getSwarm(aq);

  if (swarm.activeRelay && swarm.ready) {
    aq.respond();
    await swarm.activeRelay.dht._protocol.opened;
    return;
  }
  swarm.once("ready", async () => {
    await swarm.activeRelay.dht._protocol.opened;
    aq.respond();
  });
}

async function handleListenConnections(aq: ActiveQuery) {
  const swarm = await getSwarm(aq);
  const swarmId = getSwarmToSwarmId(swarm);

  const listener = (peer: any) => {
    aq.sendUpdate(getSwarmToSocketConnectionId(peer));
  };

  const swarmEvent = swarmEvents.get(swarmId as number)?.events;

  if (!swarmEvent) {
    logErr("swarm event object is missing");
  }

  swarmEvent?.on("connection", listener);

  aq.setReceiveUpdate?.(() => {
    swarmEvent?.off("connection", listener);
    aq.respond();
  });

  for (const conn of connections) {
    if (conn[1].swarm === swarmId) {
      listener(conn[1].conn);
    }
  }

  const closeCb = () => {
    swarmEvent?.off("connection", listener);
    swarmEvent?.emit("close");
    aq.respond();
  };

  const hookClose = () => {
    swarmEvent?.once("close", closeCb);
  };

  if (swarm.activeRelay) {
    hookClose();
    return;
  }
  swarm.onceSelf("ready", hookClose);
}

async function handleGetSocketInfo(aq: ActiveQuery) {
  const socket = validateConnection(aq);

  if (!socket) {
    return;
  }

  aq.respond({
    remotePublicKey: socket.remotePublicKey,
    publicKey: socket.publicKey,
    rawStream: {
      remoteHost: pubKeyToIpv6(socket.remotePublicKey),
      remotePort: 0,
      remoteFamily: "IPv6",
    },
  });
}

async function createProtomuxChannel(aq: ActiveQuery) {
  const socket = validateConnection(aq);

  if (!socket) {
    return;
  }

  if (!("data" in aq.callerInput)) {
    aq.reject("data required");
    return;
  }

  const mux = Protomux.from(socket);
  const data = aq.callerInput.data;

  const handleCallback = (name: string, enabled: boolean) => {
    if (!enabled && name !== "destroy") {
      return undefined;
    }
    return (...args: any) => {
      args = args.filter(
        (item: any) => item.constructor.name.toLowerCase() !== "channel"
      );

      if (name === "destroy") {
        connections.get(aq.callerInput.id)?.channels.delete(channelId);
        aq.respond();
      }

      if (!enabled) {
        return;
      }

      aq.sendUpdate({
        action: name,
        args,
      });
    };
  };

  aq.setReceiveUpdate?.((data: any) => {
    switch (data.action) {
      case "open":
        channel.open();
    }
  });

  const channel = mux.createChannel({
    protocol: data?.protocol,
    id: data?.id,
    handshake: data?.handshake,
    onopen: handleCallback("onopen", data?.onopen ?? undefined),
    onclose: handleCallback("onclose", data?.onclose ?? undefined),
    ondestroy: handleCallback("ondestroy", data?.ondestroy ?? undefined),
  });

  if (channel === null) {
    aq.reject("duplicate channel");
    return;
  }

  const channelId = getChannelId();

  connections.get(aq.callerInput.id)?.channels.set(channelId, channel);

  aq.sendUpdate(channelId);
}

async function createProtomuxMessage(aq: ActiveQuery) {
  const socket = validateConnection(aq);

  if (!socket) {
    return;
  }

  if (!("data" in aq.callerInput)) {
    aq.reject("action required");
    return;
  }

  if (!("channelId" in aq.callerInput)) {
    aq.reject("channel id required");
    return;
  }

  const channel = connections
    .get(aq.callerInput.id)
    ?.channels.get(aq.callerInput.channelId);

  if (!channel) {
    aq.reject("invalid channel");
  }

  const data = aq.callerInput.data;

  const defers: { [action: string]: DeferredPromise<any> } = {};

  const handleEncoding = (enabled: boolean) => {
    if (!enabled) {
      return undefined;
    }

    const update = async (action: string, args: any) => {
      await defers[action]?.promise;
      defers[action] = defer();
      aq.sendUpdate({
        action,
        args,
      });

      const ret = await defers[action]?.promise;

      if (ret[1]) {
        args[0].buffer = Buffer.from(ret[1].buffer);
        args[0].start = ret[1].start;
        args[0].end = ret[1].end;
      }

      return ret[0];
    };

    return {
      async preencode(...args: any) {
        return update("preencode", args);
      },
      async encode(...args: any) {
        return update("encode", args);
      },
      async decode(...args: any) {
        return update("encode", args);
      },
    };
  };

  aq.setReceiveUpdate?.((data) => {
    defers[data.action]?.resolve(data.args[0]);
  });

  const message = channel.addMessage({
    encoding: handleEncoding(data.encoding ?? false),
    onmessage: data.encoding ?? undefined,
  });

  aq.sendUpdate({
    action: "created",
  });
}

function getSwarmToSocketConnectionId(socket: any) {
  for (const conn of connections) {
    if (conn[1].conn === socket) {
      return conn[0];
    }
  }

  return false;
}

function getSwarmToSwarmId(swarm: any) {
  for (const swarmInstance of swarmInstances) {
    if (swarmInstance[1] === swarm) {
      return swarmInstance[0];
    }
  }

  return false;
}
