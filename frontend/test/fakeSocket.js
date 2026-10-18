// Stands in for socket.io-client in every test (see moduleNameMapper in
// jest.config.cjs). io() returns a fake socket, and serverEmit() lets a test play
// the server, for example serverEmit("onlineUsers", ["u2"]).

function createEmitter() {
  const handlers = new Map(); // event -> Set of handlers
  const emitter = {
    on: jest.fn((event, handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(handler);
      return emitter;
    }),
    off: jest.fn((event, handler) => {
      handlers.get(event)?.delete(handler);
      return emitter;
    }),
    // Delivers an event as if it came from the server.
    serverEmit: (event, ...args) => {
      for (const handler of [...(handlers.get(event) ?? [])]) handler(...args);
    },
    listenerCount: (event) => handlers.get(event)?.size ?? 0,
  };
  return emitter;
}

const sockets = [];

export const io = jest.fn(() => {
  const socket = createEmitter();
  socket.io = createEmitter(); // the Manager, which emits "reconnect"
  socket.close = jest.fn();
  sockets.push(socket);
  return socket;
});

export const lastSocket = () => sockets.at(-1);
export const serverEmit = (event, ...args) => lastSocket().serverEmit(event, ...args);
export const resetFakeSockets = () => { sockets.length = 0; };
