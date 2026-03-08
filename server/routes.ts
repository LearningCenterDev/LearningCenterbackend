import { Express } from "express";
import { createServer, type Server } from "http";
import { registerModularRoutes } from "./routes/index";
import { registerRoutes as registerLegacyRoutes } from "./legacy-routes";

export async function registerRoutes(app: Express): Promise<Server> {
    // 1. Register new modular routes (High Priority)
    registerModularRoutes(app);

    // 2. Register legacy routes (for all the 10k lines of logic we haven't split yet)
    const server = await registerLegacyRoutes(app);

    return server;
}
