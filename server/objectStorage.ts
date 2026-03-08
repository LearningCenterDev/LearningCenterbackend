import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// The object storage client is used to interact with the object storage service.
// Initialize standard Google Cloud Storage if credentials are provided
// Otherwise, try to use Replit sidecar if in Replit environment
let objectStorageClient: Storage;

if (process.env.GOOGLE_APPLICATION_CREDENTIALS || (process.env.GCP_PROJECT_ID && process.env.GCP_CLIENT_EMAIL && process.env.GCP_PRIVATE_KEY)) {
  // Use standard GCS client
  objectStorageClient = new Storage();
} else if (process.env.REPL_ID) {
  // Use Replit sidecar if in Replit
  objectStorageClient = new Storage({
    credentials: {
      audience: "replit",
      subject_token_type: "access_token",
      token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
      type: "external_account",
      credential_source: {
        url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
        format: {
          type: "json",
          subject_token_field_name: "access_token",
        },
      },
      universe_domain: "googleapis.com",
    },
    projectId: "",
  });
} else {
  // Fallback for local development without storage
  console.warn("Object storage credentials not found. File uploads will be disabled.");
  // Create a dummy client that will fail on use but won't crash on init
  objectStorageClient = new Storage();
}

export { objectStorageClient };

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// The object storage service is used to interact with the object storage service.
export class ObjectStorageService {
  constructor() { }

  // Gets the public object search paths.
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
        "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  // Gets the private object directory path.
  getPrivateObjectDir(): string {
    const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!privateDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
        "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return privateDir;
  }

  // Gets the upload URL for a public object (avatar, cover photo, etc.)
  async getPublicObjectUploadURL(fileName: string): Promise<string> {
    const publicPath = this.getPublicObjectSearchPaths()[0];

    // Parse the path to get bucket and object name
    // Format: /<bucket-name>/<path>
    const pathParts = publicPath.split("/").filter(p => p);
    if (pathParts.length < 1) {
      throw new Error("Invalid public object search path");
    }

    const bucketName = pathParts[0];
    const objectName = pathParts.slice(1).concat(fileName).join("/");

    // Sign URL for PUT method with TTL
    return this.signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900, // 15 minutes
    });
  }

  // Gets the upload URL for a private object (message attachments, documents, etc.)
  async getPrivateObjectUploadURL(fileName: string): Promise<string> {
    const privateDir = this.getPrivateObjectDir();

    // Parse the path to get bucket and object name
    // Format: /<bucket-name>/<path>
    const pathParts = privateDir.split("/").filter(p => p);
    if (pathParts.length < 1) {
      throw new Error("Invalid private object directory path");
    }

    const bucketName = pathParts[0];
    const objectName = pathParts.slice(1).concat(fileName).join("/");

    // Sign URL for PUT method with TTL
    return this.signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900, // 15 minutes
    });
  }

  // Search for a public object from the search paths.
  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      // Full path format: /<bucket_name>/<object_name>
      const { bucketName, objectName } = this.parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Check if file exists
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  // Get a private object by its full path.
  async getPrivateObject(objectPath: string): Promise<File | null> {
    try {
      // Full path format: /<bucket_name>/<object_name>
      const { bucketName, objectName } = this.parseObjectPath(objectPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Check if file exists
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
      return null;
    } catch (error) {
      console.error("Error getting private object:", error);
      return null;
    }
  }

  // Get a private object by relative path (prepends the private directory)
  async getPrivateObjectByRelativePath(relativePath: string): Promise<File | null> {
    const privateDir = this.getPrivateObjectDir();
    const fullPath = `${privateDir}/${relativePath}`;
    return this.getPrivateObject(fullPath);
  }

  // Delete a private object by relative path (prepends the private directory)
  async deletePrivateObjectByRelativePath(relativePath: string): Promise<boolean> {
    const privateDir = this.getPrivateObjectDir();
    const fullPath = `${privateDir}/${relativePath}`;
    return this.deleteObject(fullPath);
  }

  // Delete an object from storage by its full path.
  async deleteObject(objectPath: string): Promise<boolean> {
    try {
      const { bucketName, objectName } = this.parseObjectPath(objectPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Check if file exists before deleting
      const [exists] = await file.exists();
      if (!exists) {
        console.log(`File does not exist, skipping deletion: ${objectPath}`);
        return true;
      }

      await file.delete();
      console.log(`Successfully deleted object: ${objectPath}`);
      return true;
    } catch (error) {
      console.error("Error deleting object:", error);
      return false;
    }
  }

  // Upload a file buffer to the private directory.
  async uploadToPrivateDir(fileName: string, buffer: Buffer, contentType: string): Promise<string> {
    const privateDir = this.getPrivateObjectDir();
    const fullPath = `${privateDir}/${fileName}`;

    // Parse the path to get bucket and object name
    const { bucketName, objectName } = this.parseObjectPath(fullPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    // Upload the buffer
    await file.save(buffer, {
      contentType,
      metadata: {
        cacheControl: 'private, max-age=0',
      },
    });

    return fullPath;
  }

  // Downloads an object to the response.
  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600, isPrivate: boolean = false) {
    try {
      // Get file metadata
      const [metadata] = await file.getMetadata();

      // Set appropriate headers
      const cacheControl = isPrivate
        ? 'private, max-age=0'
        : `public, max-age=${cacheTtlSec}`;

      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": cacheControl,
      });

      // Stream the file to the response
      const stream = file.createReadStream();

      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  private parseObjectPath(path: string): {
    bucketName: string;
    objectName: string;
  } {
    if (!path.startsWith("/")) {
      path = `/${path}`;
    }
    const pathParts = path.split("/");
    if (pathParts.length < 3) {
      throw new Error("Invalid path: must contain at least a bucket name");
    }

    const bucketName = pathParts[1];
    const objectName = pathParts.slice(2).join("/");

    return {
      bucketName,
      objectName,
    };
  }

  private async signObjectURL({
    bucketName,
    objectName,
    method,
    ttlSec,
  }: {
    bucketName: string;
    objectName: string;
    method: "GET" | "PUT" | "DELETE" | "HEAD";
    ttlSec: number;
  }): Promise<string> {
    if (!process.env.REPL_ID) {
      // Local dev/AWS fallback: Try standard GCS signing
      try {
        const [url] = await objectStorageClient
          .bucket(bucketName)
          .file(objectName)
          .getSignedUrl({
            version: 'v4',
            action: method === 'GET' ? 'read' : (method === 'PUT' ? 'write' : (method === 'DELETE' ? 'delete' : 'resumable' as any)),
            expires: Date.now() + ttlSec * 1000,
          });
        return url;
      } catch (err) {
        console.warn("Using placeholder URL for object storage.");
        return `/api/storage-placeholder/${bucketName}/${objectName}`;
      }
    }

    const request = {
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    };
    const response = await fetch(
      `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to sign object URL: ${response.status}`);
    }

    const { signed_url: signedURL } = await response.json();
    return signedURL;
  }
}
