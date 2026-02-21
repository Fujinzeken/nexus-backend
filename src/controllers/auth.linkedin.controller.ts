import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { supabase } from "../lib/supabase";
import axios from "axios";

export class AuthLinkedinController {
  private static CLIENT_ID = process.env.LINKEDIN_CLIENT_ID!;
  private static CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET!;
  private static REDIRECT_URI = process.env.LINKEDIN_CALLBACK_URL!;

  static async login(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const state = Math.random().toString(36).substring(7);

      // Store state and userId in cookies
      res.cookie("linkedin_oauth_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      });

      res.cookie("linkedin_oauth_user_id", userId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      });

      const scope = "openid profile email w_member_social";
      const linkedinAuthUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${AuthLinkedinController.CLIENT_ID}&redirect_uri=${AuthLinkedinController.REDIRECT_URI}&state=${state}&scope=${encodeURIComponent(scope)}`;

      res.redirect(linkedinAuthUrl);
    } catch (err) {
      console.error("LinkedIn Login Error:", err);
      res.status(500).json({ error: "Failed to initiate LinkedIn login" });
    }
  }

  static async callback(req: AuthRequest, res: Response) {
    try {
      const { code, state, error, error_description } = req.query;
      const savedState = req.cookies.linkedin_oauth_state;
      const userId = req.cookies.linkedin_oauth_user_id;

      if (error) {
        console.error("LinkedIn OAuth Error:", error, error_description);
        return res.redirect(
          `${process.env.FRONTEND_URL}/dashboard/settings?status=error&platform=linkedin&message=${error_description}`,
        );
      }

      console.log("[LinkedIn Callback] Received params:", {
        state: !!state,
        code: !!code,
        savedState: !!savedState,
        userId: !!userId,
      });

      if (!state || !code || !savedState || !userId) {
        console.error(
          "[LinkedIn Callback] Missing parameters. Cookies found:",
          Object.keys(req.cookies),
        );
        return res.status(400).json({
          error: "Invalid OAuth state or missing parameters",
          details: {
            state: !!state,
            code: !!code,
            savedState: !!savedState,
            userId: !!userId,
          },
        });
      }

      if (state !== savedState) {
        return res.status(400).json({ error: "State mismatch" });
      }

      // Exchange code for access token
      const tokenResponse = await axios.post(
        "https://www.linkedin.com/oauth/v2/accessToken",
        new URLSearchParams({
          grant_type: "authorization_code",
          code: code as string,
          client_id: AuthLinkedinController.CLIENT_ID,
          client_secret: AuthLinkedinController.CLIENT_SECRET,
          redirect_uri: AuthLinkedinController.REDIRECT_URI,
        }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      const { access_token, refresh_token, expires_in } = tokenResponse.data;

      // Get user info (OpenID Connect)
      const userResponse = await axios.get(
        "https://api.linkedin.com/v2/userinfo",
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        },
      );

      const linkedinUser = userResponse.data;
      // linkedinUser typically has 'sub' (ID), 'name', 'given_name', 'family_name', 'picture', 'email'

      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);

      // Save to database
      const { error: dbError } = await supabase.from("social_accounts").upsert(
        {
          user_id: userId,
          platform: "linkedin",
          platform_user_id: linkedinUser.sub,
          platform_username: linkedinUser.name,
          access_token: access_token,
          refresh_token: refresh_token,
          expires_at: expiresAt.toISOString(),
          profile_picture_url: linkedinUser.picture,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,platform",
        },
      );

      if (dbError) {
        console.error("Database Error saving LinkedIn account:", dbError);
        throw dbError;
      }

      // Clear cookies
      res.clearCookie("linkedin_oauth_state");
      res.clearCookie("linkedin_oauth_user_id");

      res.redirect(
        `${process.env.FRONTEND_URL}/dashboard/settings?status=success&platform=linkedin`,
      );
    } catch (err) {
      console.error("LinkedIn Callback Error:", err);
      res.redirect(
        `${process.env.FRONTEND_URL}/dashboard/settings?status=error&platform=linkedin`,
      );
    }
  }
}
