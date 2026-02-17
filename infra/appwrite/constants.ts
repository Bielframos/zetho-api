/**
 * Appwrite Configuration Constants
 *
 * This file contains configuration for the generated SDK.
 * You may modify these values as needed.
 */

export const PROJECT_ID = process.env.APPWRITE_PROJECT as string;
export const ENDPOINT = process.env.APPWRITE_ENDPOINT as string;

/**
 * API Key is required for server-side operations
 * Set the APPWRITE_API_KEY environment variable or replace this value directly.
 */
export const API_KEY = process.env.APPWRITE_API_KEY ?? '';
