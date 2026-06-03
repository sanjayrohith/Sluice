import { createServer, type Server } from "node:http";

export interface TargetServer {
  url: string;
  arrivals: number[];
  getMaxInFlight: () => number;
  close: () => Promise<void>;
}

export async function createTargetServer(responseDelayMs = 0): Promise<TargetServer> {
  let inFlight = 0;
  let maxInFlight = 0;
  const arrivals: number[] = [];
  const server = createServer((_request, response) => {
    arrivals.push(Date.now());
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    setTimeout(() => {
      inFlight -= 1;
      response.statusCode = 200;
      response.end("ok");
    }, responseDelayMs);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("target server did not bind to a port");

  return {
    url: `http://127.0.0.1:${address.port}/hook`,
    arrivals,
    getMaxInFlight: () => maxInFlight,
    close: () => closeServer(server),
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
