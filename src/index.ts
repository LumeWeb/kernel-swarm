// @ts-ignore
import DHT from "@lumeweb/dht-web";
import type { ActiveQuery } from "libkmodule";
import { addHandler, getSeed, handleMessage } from "libkmodule";
import { handlePresentSeed as handlePresentSeedModule } from "libkmodule/dist/seed.js";
import type { Buffer } from "buffer";
import { hexToBuf } from "libskynet";

interface DhtConnection {
  dht: number;
  conn: any;
}

const connections = new Map<number, DhtConnection>();
const dhtInstances = new Map<number, DHT>();

let defaultDht: DHT;

let moduleReadyResolve: Function;
let moduleReady: Promise<void> = new Promise((resolve) => {
  moduleReadyResolve = resolve;
});

onmessage = handleMessage;
function idFactory(start = 1, step = 1, limit = 2 ** 32) {
  let id = start;

  return function nextId() {
    const nextId = id;
    id += step;
    if (id >= limit) id = start;
    return nextId;
  };
}

const nextId = idFactory(1);

addHandler("presentSeed", handlePresentSeed);
addHandler("openDht", handleOpenDht);
addHandler("closeDht", handleCloseDht);
addHandler("connect", handleConnect);
addHandler("listenSocketEvent", handleListenSocketEvent, {
  receiveUpdates: true,
});
addHandler("socketExists", handleSocketExists);
addHandler("close", handleCloseSocketEvent);
addHandler("write", handleWriteSocketEvent);
addHandler("addRelay", handleAddRelay);
addHandler("removeRelay", handleRemoveRelay);
addHandler("clearRelays", handleClearRelays);
addHandler("getRelays", handleGetRelays);
addHandler("getRelayServers", handleGetRelayServers);
addHandler("ready", handleReady);

async function handlePresentSeed(aq: ActiveQuery) {
  const keyPair = aq.callerInput.myskyRootKeypair;
  handlePresentSeedModule({ callerInput: { seed: keyPair } } as ActiveQuery);
  if (!defaultDht) {
    defaultDht = dhtInstances.get(await createDht()) as DHT;
  }
  moduleReadyResolve();
}

async function handleOpenDht(aq: ActiveQuery) {
  const id = await createDht();
  aq.respond({ dht: id });
}

async function handleCloseDht(aq: ActiveQuery) {
  const { dht = null } = aq.callerInput;

  if (!dht) {
    aq.reject("Invalid DHT id");
    return;
  }

  if (dht === defaultDht) {
    aq.reject("Cannot close default DHT");
    return;
  }

  dhtInstances.delete(dht);
  Array.from(connections.values())
    .filter((item) => item.dht === dht)
    .forEach((item) => {
      item.conn.end();
    });

  aq.respond();
}

async function createDht(): Promise<number> {
  const dhtInstance = new DHT({ keyPair: await getSeed() });
  const id = nextId();
  dhtInstances.set(id, dhtInstance);
  return id;
}

async function handleConnect(aq: ActiveQuery) {
  const { pubkey, options = {} } = aq.callerInput;

  let socket: any;

  const dht = await getDht(aq);

  try {
    // @ts-ignore
    socket = await dht.connect(
      typeof pubkey === "string" ? hexToBuf(pubkey).shift() : pubkey,
      options
    );
  } catch (e: any) {
    aq.reject(e);
    return;
  }

  const id = nextId();

  socket.on("open", () => {
    let dhtId: any = [...dhtInstances.entries()].filter(
      (item) => item[1] === dht
    );
    dhtId = dhtId.shift()[0];

    setDhtConnection(id, dhtId as number, socket);
    aq.respond({ id });
  });

  socket.on("end", () => {
    deleteDhtConnection(id);
  });

  socket.on("error", (e: any) => {
    deleteDhtConnection(id);
    aq.reject(e);
  });
}

function handleListenSocketEvent(aq: ActiveQuery) {
  const { event = null } = aq.callerInput;

  const socket = validateConnection(aq);

  if (!socket) {
    return;
  }

  if (!event) {
    aq.reject("Invalid event");
    return;
  }

  const cb = (data: Buffer) => {
    aq.sendUpdate(data);
  };

  socket.on(event, cb);
  socket.on("close", () => {
    socket.off(socket, cb);
    aq.respond();
  });

  aq.setReceiveUpdate?.((data: any) => {
    switch (data?.action) {
      case "off":
        socket.off(socket, cb);
        aq.respond();
        break;
    }
  });
}

async function handleSocketExists(aq: ActiveQuery) {
  const { id = null } = aq.callerInput;

  aq.respond(hasDhtConnection(Number(id)));
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

  if (!id || !hasDhtConnection(id)) {
    aq.reject("Invalid connection id");
    return false;
  }

  return getDhtConnection(id)?.conn;
}

async function getDht(aq: ActiveQuery): Promise<DHT> {
  await moduleReady;
  let dht;
  if ("callerInput" in aq && aq.callerInput) {
    dht = aq.callerInput.dht ?? null;

    if (dht && !dhtInstances.has(dht)) {
      const error = "Invalid DHT id";
      aq.reject(error);
      throw new Error(error);
    }
  }

  if (!dht) {
    return defaultDht;
  }

  return dhtInstances.get(dht) as DHT;
}

async function handleAddRelay(aq: ActiveQuery) {
  const { pubkey = null } = aq.callerInput;

  if (!pubkey) {
    aq.reject("invalid pubkey");
    return;
  }

  const dht = await getDht(aq);

  aq.respond(await dht.addRelay(pubkey));
}

async function handleRemoveRelay(aq: ActiveQuery) {
  const { pubkey = null } = aq.callerInput;

  if (!pubkey) {
    aq.reject("invalid pubkey");
    return;
  }

  const dht = await getDht(aq);

  aq.respond(dht.removeRelay(pubkey));
}

async function handleClearRelays(aq: ActiveQuery) {
  const dht = await getDht(aq);

  dht.clearRelays();

  aq.respond();
}

async function handleGetRelays(aq: ActiveQuery) {
  aq.respond(await (await getDht(aq)).relays);
}
async function handleGetRelayServers(aq: ActiveQuery) {
  aq.respond(await (await getDht(aq)).relayServers);
}

async function handleReady(aq: ActiveQuery) {
  await (await getDht(aq)).ready();
  aq.respond();
}

function setDhtConnection(id: number, dht: number, conn: any) {
  connections.set(id, { dht, conn });
}

function getDhtConnection(id: number) {
  return connections.get(id);
}

function hasDhtConnection(id: number) {
  return connections.has(id);
}

function deleteDhtConnection(id: number) {
  connections.delete(id);
}
