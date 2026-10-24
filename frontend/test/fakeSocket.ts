// Stands in for socket.io-client in every test (see moduleNameMapper in
// jest.config.cjs). io() returns a fake socket, and serverEmit() lets a test play
// the server, for example serverEmit("onlineUsers", ["u2"]).

type Handler = (...args: any[]) => void;

interface Emitter {
  on: jest.Mock;
  off: jest.Mock;
  // Delivers an event as if it came from the server.
  serverEmit: (event: string, ...args: any[]) => void;
  listenerCount: (event: string) => number;
}

function createEmitter(): Emitter {
  const handlers = new Map<string, Set<Handler>>(); // event -> Set of handlers
  const emitter: Emitter = {
    on: jest.fn((event: string, handler: Handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
      return emitter;
    }),
    off: jest.fn((event: string, handler: Handler) => {
      handlers.get(event)?.delete(handler);
      return emitter;
    }),
    serverEmit: (event, ...args) => {
      for (const handler of [...(handlers.get(event) ?? [])]) handler(...args);
    },
    listenerCount: (event) => handlers.get(event)?.size ?? 0,
  };
  return emitter;
}

// A fake socket. Its io is the Manager, which emits "reconnect".
export type FakeSocket = Emitter & { io: Emitter; close: jest.Mock };

const sockets: FakeSocket[] = [];

export const io = jest.fn((): FakeSocket => {
  const socket = Object.assign(createEmitter(), { io: createEmitter(), close: jest.fn() });
  sockets.push(socket);
  return socket;
});

export const lastSocket = (): FakeSocket => sockets.at(-1)!;
export const serverEmit = (event: string, ...args: any[]) => lastSocket().serverEmit(event, ...args);
export const resetFakeSockets = () => { sockets.length = 0; };
