// @ts-ignore
import DHT from "@lumeweb/dht-web";
import type { ActiveQuery } from "libkmodule";
import { addHandler, getSeed, handleMessage } from "libkmodule";
import { handlePresentSeed as handlePresentSeedModule } from "libkmodule/dist/seed.js";
import { nextId } from "./id";
import type { Buffer } from "buffer";
import {hexToBuf} from "libskynet";

interface DhtConnection {
  dht: number;
  conn: any;
}

const connections = new Map<number, DhtConnection>();
const dhtInstances = new Map()<number, DHT>;

let defaultDht;

onmessage = handleMessage;

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
addHandler("ready", handleReady);

async function handlePresentSeed(aq: ActiveQuery) {
  const keyPair = aq.callerInput.myskyRootKeypair;
  handlePresentSeedModule({ callerInput: { seed: keyPair } });
  if (!defaultDht) {
    defaultDht = await createDht();
  }
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

  const dht = validateDht(aq);

  if (!dht) {
    return;
  }

  try {
    // @ts-ignore
    socket = await dht.connect(
      typeof pubkey === "string" ? hexToBuf(pubkey) : pubkey,
      options
    );
  } catch (e: any) {
    aq.reject(e);
    return;
  }

  const id = nextId();

  socket.on("open", () => {
    setDhtConnection(id, dht as number, socket);
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

  return getDhtConnection(id).conn;
}

function validateDht(aq: ActiveQuery): DHT | boolean {
  let { dht = null } = aq.callerInput;

  if (dht && !dhtInstances.has(dht)) {
    aq.reject("Invalid DHT id");
    return false;
  }

  if (!dht) {
    dht = defaultDht;
  }

  return dhtInstances.get(dht);
}

async function handleAddRelay(aq: ActiveQuery) {
  const { pubkey = null } = aq.callerInput;

  const dht = validateDht(aq);

  if (!dht) {
    return;
  }

  if (!pubkey) {
    aq.reject("invalid pubkey");
    return;
  }

  aq.respond(await dht.addRelay(pubkey));
}

function handleRemoveRelay(aq: ActiveQuery) {
  const { pubkey = null } = aq.callerInput;

  const dht = validateDht(aq);

  if (!dht) {
    return;
  }

  if (!pubkey) {
    aq.reject("invalid pubkey");
    return;
  }

  aq.respond(dht.removeRelay(pubkey));
}

function handleClearRelays(aq: ActiveQuery) {
  const dht = validateDht(aq);

  if (!dht) {
    return;
  }

  dht.clearRelays();

  aq.respond();
}

async function handleReady(aq: ActiveQuery) {
  const dht = validateDht(aq);

  if (!dht) {
    return;
  }

  // @ts-ignore
  await dht.ready();
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
