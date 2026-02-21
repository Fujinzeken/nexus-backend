import { Request, Response, NextFunction } from "express";
import { supabase } from "../lib/supabase";
import { User } from "@supabase/supabase-js";

// Extend Express Request type to include user
export interface AuthRequest extends Request {
  user?: User;
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;
    let token = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.query.access_token) {
      token = req.query.access_token as string;
    }

    if (!token) {
      return res
        .status(401)
        .json({ error: "Missing or invalid authorization" });
    }

    // Verify token with Supabase
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err);
    res
      .status(500)
      .json({ error: "Internal Server Error during authentication" });
  }
};
