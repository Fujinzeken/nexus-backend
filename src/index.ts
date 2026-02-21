import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import postsRouter from "./routes/posts.routes";
import authRoutes from "./routes/auth.routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Allow for dev, or specific check
      }
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// Routes
app.use("/api/posts", postsRouter);
app.use("/api/auth", authRoutes);

// Initialize Queue Worker
import { QueueService } from "./services/queue.service";
QueueService.initWorker();

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);

  // Keep-alive for Render (every 14 mins)
  const HEALTH_URL = process.env.SELF_URL;
  if (HEALTH_URL) {
    const axios = require("axios");
    setInterval(
      async () => {
        try {
          await axios.get(`${HEALTH_URL}/health`);
          console.log(
            `[Keep-Alive] Pinged ${HEALTH_URL}/health at ${new Date().toISOString()}`,
          );
        } catch (err: any) {
          console.error("[Keep-Alive] Failed to ping self:", err.message);
        }
      },
      14 * 60 * 1000,
    );
  }
});
