import { TwitterApi } from "twitter-api-v2";
import axios from "axios";
import { supabase } from "../lib/supabase";
import { LinkedInService } from "./linkedin.service";

export class PostingService {
  /**
   * Main entry point to send a post
   */
  static async sendPost(postId: string) {
    try {
      // 1. Fetch post details
      const { data: post, error: postError } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
        .single();

      if (postError || !post) {
        console.error(
          `[PostingService] DB Error fetching post ${postId}:`,
          postError,
        );
        throw new Error(`Post not found: ${postId}`);
      }

      // 2. Fetch associated social account
      let account;
      if (post.social_account_id) {
        const { data: acc, error: accError } = await supabase
          .from("social_accounts")
          .select("*")
          .eq("id", post.social_account_id)
          .single();

        if (accError) {
          console.error(
            `[PostingService] Error fetching explicit account ${post.social_account_id}:`,
            accError,
          );
        }
        account = acc;
      }

      // If no explicit account linked, find the primary one for this user/platform
      if (!account) {
        const { data: acc, error: accError } = await supabase
          .from("social_accounts")
          .select("*")
          .eq("user_id", post.user_id)
          .eq("platform", post.platform)
          .single();

        if (accError || !acc) {
          throw new Error(
            `No connected ${post.platform} account found for user ${post.user_id}`,
          );
        }
        account = acc;
      }

      // 3. Dispatch to correct platform
      let platformResult;
      if (post.platform === "twitter") {
        platformResult = await this.postToTwitter(post.content, account);
      } else if (post.platform === "linkedin") {
        platformResult = await this.postToLinkedIn(
          post.content,
          post.media_urls || [],
          account,
        );
      } else {
        throw new Error(`Unsupported platform: ${post.platform}`);
      }

      // 4. Update status to published
      await supabase
        .from("posts")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", postId);

      return { success: true, platformResult };
    } catch (err: any) {
      console.error(`Post Dispatch Failed [${postId}]:`, err.message);

      // Update status to failed
      await supabase
        .from("posts")
        .update({
          status: "failed",
          error_message: err.message,
        })
        .eq("id", postId);

      throw err;
    }
  }

  private static async postToTwitter(content: string, account: any) {
    const client = new TwitterApi({
      clientId: process.env.TWITTER_CLIENT_ID!,
      clientSecret: process.env.TWITTER_CLIENT_SECRET!,
    });

    try {
      // 1. Check if token needs refresh
      let currentToken = account.access_token;
      const expiresAt = new Date(account.token_expires_at).getTime();
      const BUFFER = 5 * 60 * 1000; // 5 minutes buffer

      if (Date.now() + BUFFER > expiresAt && account.refresh_token) {
        console.log(
          `[Twitter] Token expired for user ${account.user_id}, refreshing...`,
        );
        const { accessToken, refreshToken, expiresIn } =
          await client.refreshOAuth2Token(account.refresh_token);

        const newExpiresAt = new Date();
        newExpiresAt.setSeconds(newExpiresAt.getSeconds() + expiresIn);

        // Update DB
        await supabase
          .from("social_accounts")
          .update({
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: newExpiresAt.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", account.id);

        currentToken = accessToken;
      }

      // 2. Dispatch Post
      const twitterClient = new TwitterApi(currentToken);
      const response = await twitterClient.v2.tweet(content);
      return response;
    } catch (err: any) {
      console.error(
        "[Twitter Posting Error Details]:",
        err.data || err.message,
      );
      throw new Error(`Twitter API Error: ${err.message}`);
    }
  }

  private static async postToLinkedIn(
    content: string,
    mediaUrls: string[],
    account: any,
  ) {
    const authorUrn = `urn:li:person:${account.platform_user_id}`;

    try {
      // 1. Check if token needs refresh
      let currentToken = account.access_token;
      const expiresAt = new Date(account.expires_at).getTime();
      const BUFFER = 5 * 60 * 1000;

      if (Date.now() + BUFFER > expiresAt && account.refresh_token) {
        console.log(
          `[LinkedIn] Token expired for user ${account.user_id}, refreshing...`,
        );
        const tokenResponse = await axios.post(
          "https://www.linkedin.com/oauth/v2/accessToken",
          new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: account.refresh_token,
            client_id: process.env.LINKEDIN_CLIENT_ID!,
            client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
          }).toString(),
          {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          },
        );

        const { access_token, refresh_token, expires_in } = tokenResponse.data;
        const newExpiresAt = new Date();
        newExpiresAt.setSeconds(newExpiresAt.getSeconds() + expires_in);

        await supabase
          .from("social_accounts")
          .update({
            access_token: access_token,
            refresh_token: refresh_token || account.refresh_token,
            expires_at: newExpiresAt.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", account.id);

        currentToken = access_token;
      }

      // 2. Handle Media Uploads if any
      const mediaAssets: any[] = [];
      if (mediaUrls && mediaUrls.length > 0) {
        for (const url of mediaUrls) {
          console.log(`[LinkedIn] Processing media: ${url}`);

          // Download from Supabase/Public URL
          const mediaRes = await axios.get(url, {
            responseType: "arraybuffer",
          });
          const binary = Buffer.from(mediaRes.data);

          // TODO: Check if video or image. For now, assuming Image.
          const isVideo =
            url.toLowerCase().includes(".mp4") ||
            url.toLowerCase().includes(".mov");

          let asset, uploadUrl;
          if (isVideo) {
            ({ asset, uploadUrl } = await LinkedInService.registerVideoUpload(
              currentToken,
              account.platform_user_id,
            ));
          } else {
            ({ asset, uploadUrl } = await LinkedInService.registerImageUpload(
              currentToken,
              account.platform_user_id,
            ));
          }

          // Upload binary
          await LinkedInService.uploadBinary(uploadUrl, currentToken, binary);
          mediaAssets.push(asset);
        }
      }

      // 3. Dispatch Post
      const shareMediaCategory =
        mediaAssets.length > 0
          ? mediaAssets.length === 1 &&
            mediaUrls[0].toLowerCase().includes(".mp4")
            ? "VIDEO"
            : "IMAGE"
          : "NONE";

      const ugcPayload: any = {
        author: authorUrn,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: {
              text: content,
            },
            shareMediaCategory: shareMediaCategory,
          },
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
        },
      };

      if (mediaAssets.length > 0) {
        ugcPayload.specificContent["com.linkedin.ugc.ShareContent"].media =
          mediaAssets.map((asset) => ({
            status: "READY",
            media: asset,
            title: { text: "Shared Media" },
          }));
      }

      const response = await axios.post(
        "https://api.linkedin.com/v2/ugcPosts",
        ugcPayload,
        {
          headers: {
            Authorization: `Bearer ${currentToken}`,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        },
      );

      return response.data;
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message;
      console.error(
        "[LinkedIn Posting Error Details]:",
        err.response?.data || err.message,
      );
      throw new Error(`LinkedIn API Error: ${errorMessage}`);
    }
  }
}
