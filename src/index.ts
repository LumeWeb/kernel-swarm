// @ts-ignore
import DHT from "@lumeweb/dht-web";
import { addHandler, handleMessage } from "libkmodule";
import type { ActiveQuery } from "libkmodule";
import { nextId } from "./id";
import { Buffer } from "buffer";

let dht: DHT;

const connections = new Map();

onmessage = handleMessage;

addHandler("presentSeed", handlePresentSeed);
addHandler("connect", handleConnect);
addHandler("listenSocketEvent", handleListenSocketEvent, {
  receiveUpdates: true,
});
addHandler("close", handleCloseSocketEvent);
addHandler("write", handleWriteSocketEvent);
addHandler("addRelay", handleAddRelay);
addHandler("removeRelay", handleRemoveRelay);
addHandler("clearRelays", handleClearRelays);
addHandler("ready", handleReady);

function handlePresentSeed(aq: ActiveQuery) {
  const keyPair = aq.callerInput.myskyRootKeypair;
  if (!dht) {
    dht = new DHT({ keyPair });
  }
}

async function handleConnect(aq: ActiveQuery) {
  const { pubkey, options = {} } = aq.callerInput;

  let socket: any;

  try {
    // @ts-ignore
    socket = await dht.connect(
      typeof pubkey === "string" ? Buffer.from(pubkey, "hex") : pubkey,
      options
    );
  } catch (e: any) {
    aq.reject(e);
    return;
  }

  const id = nextId();

  socket.on("open", () => {
    connections.set(id, socket);
    aq.respond({ id });
  });

  socket.on("error", (e: any) => {
    connections.set(id, socket);
    aq.reject(e);
  });
}

function handleListenSocketEvent(aq: ActiveQuery) {
  const { event = null } = aq.callerInput;
  const id = validateConnection(aq);

  if (!id) {
    return;
  }

  if (!event) {
    aq.reject("Invalid event");
    return;
  }

  const socket = connections.get(id);
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

function handleCloseSocketEvent(aq: ActiveQuery) {
  const id = validateConnection(aq);

  if (!id) {
    return;
  }

  connections.get(id).end();

  aq.respond();
}

function handleWriteSocketEvent(aq: ActiveQuery) {
  const id = validateConnection(aq);

  if (!id) {
    return;
  }
  const { message = null } = aq.callerInput;

  if (!message) {
    aq.reject("empty message");
    return false;
  }

  connections.get(id).write(message);

  aq.respond();
}

function validateConnection(aq: ActiveQuery): number | boolean {
  const { id = null } = aq.callerInput;

  if (!id || !connections.has(id)) {
    aq.reject("Invalid connection id");
    return false;
  }

  return id;
}

async function handleAddRelay(aq: ActiveQuery) {
  const { pubkey = null } = aq.callerInput;

  if (!pubkey) {
    aq.reject("invalid pubkey");
    return;
  }

  aq.respond(await dht.addRelay(pubkey));
}

function handleRemoveRelay(aq: ActiveQuery) {
  const { pubkey = null } = aq.callerInput;

  if (!pubkey) {
    aq.reject("invalid pubkey");
    return;
  }

  aq.respond(dht.removeRelay(pubkey));
}

function handleClearRelays(aq: ActiveQuery) {
  dht.clearRelays();

  aq.respond();
}

async function handleReady(aq: ActiveQuery) {
  // @ts-ignore
  await dht.ready();
  aq.respond();
}
