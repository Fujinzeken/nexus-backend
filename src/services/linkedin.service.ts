import axios from "axios";
import { supabase } from "../lib/supabase";

export class LinkedInService {
  /**
   * Register an image upload with LinkedIn
   * Returns the asset URN and the upload URL
   */
  static async registerImageUpload(accessToken: string, userId: string) {
    try {
      const response = await axios.post(
        "https://api.linkedin.com/v2/assets?action=registerUpload",
        {
          registerUploadRequest: {
            recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
            owner: `urn:li:person:${userId}`,
            serviceRelationships: [
              {
                relationshipType: "OWNER",
                identifier: "urn:li:userGeneratedContent",
              },
            ],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        },
      );

      const { asset, uploadMechanism } = response.data.value;
      const uploadUrl =
        uploadMechanism[
          "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
        ].uploadUrl;

      return { asset, uploadUrl };
    } catch (err: any) {
      console.error(
        "[LinkedInService] Register Image Error:",
        err.response?.data || err.message,
      );
      throw new Error(`LinkedIn Image Registration Failed: ${err.message}`);
    }
  }

  /**
   * Register a video upload with LinkedIn
   */
  static async registerVideoUpload(accessToken: string, userId: string) {
    try {
      const response = await axios.post(
        "https://api.linkedin.com/v2/assets?action=registerUpload",
        {
          registerUploadRequest: {
            recipes: ["urn:li:digitalmediaRecipe:feedshare-video"],
            owner: `urn:li:person:${userId}`,
            serviceRelationships: [
              {
                relationshipType: "OWNER",
                identifier: "urn:li:userGeneratedContent",
              },
            ],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        },
      );

      const { asset, uploadMechanism } = response.data.value;
      const uploadUrl =
        uploadMechanism[
          "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
        ].uploadUrl;

      return { asset, uploadUrl };
    } catch (err: any) {
      console.error(
        "[LinkedInService] Register Video Error:",
        err.response?.data || err.message,
      );
      throw new Error(`LinkedIn Video Registration Failed: ${err.message}`);
    }
  }

  /**
   * Upload binary data to LinkedIn's upload URL
   */
  static async uploadBinary(
    uploadUrl: string,
    accessToken: string,
    fileData: Buffer,
  ) {
    try {
      await axios.put(uploadUrl, fileData, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0",
          "Content-Type": "application/octet-stream",
        },
      });
      return true;
    } catch (err: any) {
      console.error(
        "[LinkedInService] Binary Upload Error:",
        err.response?.data || err.message,
      );
      throw new Error(`Media Binary Upload Failed: ${err.message}`);
    }
  }
}
