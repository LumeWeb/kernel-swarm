// @ts-ignore
import Hyperswarm from "@lumeweb/hyperswarm-web";
import type { ActiveQuery } from "libkmodule";
import { addHandler, getSeed, handleMessage } from "libkmodule";
import { handlePresentSeed as handlePresentSeedModule } from "libkmodule/dist/seed.js";
import type { Buffer } from "buffer";
import * as ed from "@noble/ed25519";
import b4a from "b4a";
import { pubKeyToIpv6 } from "./addr.js";
import { EventEmitter2 as EventEmitter } from "eventemitter2";
import { logErr } from "libkmodule/dist";
// @ts-ignore
import Protomux from "protomux";
import { Mutex } from "async-mutex";
import defer from "p-defer";

const MAX_PEER_LISTENERS = 20;

interface SwarmConnection {
  swarm: number;
  conn: any;
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
addHandler("syncProtomux", handleSyncProtomux, {
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

  const cb = (data: Buffer) => {
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

function handleWriteSocketEvent(aq: ActiveQuery) {
  const socket = validateConnection(aq);

  if (!socket) {
    return;
  }
  const { message = null } = aq.callerInput;

  if (!message) {
    aq.reject("empty message");
    return false;
  }

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

async function handleSyncProtomux(aq: ActiveQuery) {
  const socket = validateConnection(aq);

  if (!socket) {
    return;
  }

  const mux = Protomux.from(socket);
  const mutex: Mutex = mux.mutex ?? new Mutex();
  if (!mux.mutex) {
    mux.mutex = mutex;
  }

  socket.once("close", () => {
    socket.off("syncProtomux", sync);
    aq.respond();
  });

  const send = (mux: any) => {
    aq.sendUpdate({
      remote: Object.keys(mux._remote),
      local: Object.keys(mux._local),
      free: mux._free,
    });
  };

  const sync = () => send(mux);

  if (!mux.syncState) {
    mux.syncState = socket.emit.bind(socket, "syncProtomux");
  }

  socket.on("syncProtomux", sync);

  aq.setReceiveUpdate?.(async (data: any) => {
    await mutex.acquire();

    ["remote", "local"].forEach((field) => {
      const rField = `_${field}`;
      data[field].forEach((item: any) => {
        item = parseInt(item);
        if (typeof mux[rField][item] === "undefined") {
          while (item > mux[rField].length) {
            mux[rField].push(null);
          }
        }
        if (typeof mux[rField][item] === "undefined") {
          mux[rField][item] = null;
        }
      });
    });

    data.free.forEach((index: number) => {
      if (mux._free[index] === null) {
        mux._free[index] = undefined;
      }
    });
    mux._free = mux._free.filter((item: any) => item !== undefined);
    aq.sendUpdate(true);
    socket.emit("syncProtomux");

    mutex.release();
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
