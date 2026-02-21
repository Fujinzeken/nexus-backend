import { Response } from "express";
import { TwitterApi } from "twitter-api-v2";
import { AuthRequest } from "../middleware/auth.middleware";
import { supabase } from "../lib/supabase";

export class AuthTwitterController {
  private static getTwitterClient() {
    return new TwitterApi({
      clientId: process.env.TWITTER_CLIENT_ID!,
      clientSecret: process.env.TWITTER_CLIENT_SECRET!,
    });
  }

  static async login(req: AuthRequest, res: Response) {
    try {
      const client = AuthTwitterController.getTwitterClient();
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const { url, codeVerifier, state } = client.generateOAuth2AuthLink(
        process.env.TWITTER_CALLBACK_URL!,
        {
          scope: ["tweet.read", "tweet.write", "users.read", "offline.access"],
        },
      );

      // Store state and codeVerifier in cookies
      res.cookie("twitter_oauth_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000, // 15 minutes
      });

      res.cookie("twitter_oauth_code_verifier", codeVerifier, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      });

      // Pass user_id to callback via cookie (since we can't trust the client in redirect)
      res.cookie("twitter_oauth_user_id", userId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      });

      res.redirect(url);
    } catch (err) {
      console.error("Twitter Login Error:", err);
      res.status(500).json({ error: "Failed to initiate Twitter login" });
    }
  }

  static async callback(req: AuthRequest, res: Response) {
    try {
      const { state, code } = req.query;
      const savedState = req.cookies.twitter_oauth_state;
      const codeVerifier = req.cookies.twitter_oauth_code_verifier;
      const userId = req.cookies.twitter_oauth_user_id;

      console.log("[Twitter Callback] Received params:", {
        state: !!state,
        code: !!code,
        savedState: !!savedState,
        codeVerifier: !!codeVerifier,
        userId: !!userId,
      });

      if (!state || !code || !savedState || !codeVerifier || !userId) {
        console.error(
          "[Twitter Callback] Missing parameters. Cookies found:",
          Object.keys(req.cookies),
        );
        return res.status(400).json({
          error: "Invalid OAuth state or missing parameters",
          details: {
            state: !!state,
            code: !!code,
            savedState: !!savedState,
            codeVerifier: !!codeVerifier,
            userId: !!userId,
          },
        });
      }

      if (state !== savedState) {
        return res.status(400).json({ error: "State mismatch" });
      }

      const client = AuthTwitterController.getTwitterClient();

      const {
        accessToken,
        refreshToken,
        expiresIn,
        client: loggedClient,
      } = await client.loginWithOAuth2({
        code: code as string,
        codeVerifier,
        redirectUri: process.env.TWITTER_CALLBACK_URL!,
      });

      // Get user info from Twitter
      const { data: twitterUser } = await loggedClient.v2.me({
        "user.fields": ["profile_image_url", "username"],
      });

      // Calculate expiration
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

      // Save or update in social_accounts table
      const { error: dbError } = await supabase.from("social_accounts").upsert(
        {
          user_id: userId,
          platform: "twitter",
          platform_user_id: twitterUser.id,
          platform_username: twitterUser.username,
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAt.toISOString(),
          profile_picture_url: twitterUser.profile_image_url,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,platform",
        },
      );

      if (dbError) {
        console.error("Database Error saving social account:", dbError);
        throw dbError;
      }

      // Clear cookies
      res.clearCookie("twitter_oauth_state");
      res.clearCookie("twitter_oauth_code_verifier");
      res.clearCookie("twitter_oauth_user_id");

      // Redirect back to frontend connections page
      res.redirect(
        `${process.env.FRONTEND_URL || "http://localhost:3000"}/dashboard/settings?status=success&platform=twitter`,
      );
    } catch (err) {
      console.error("Twitter Callback Error:", err);
      res.redirect(
        `${process.env.FRONTEND_URL || "http://localhost:3000"}/dashboard/settings?status=error&platform=twitter`,
      );
    }
  }
}
