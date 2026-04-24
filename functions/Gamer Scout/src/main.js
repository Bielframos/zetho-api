import { Client, Users } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  if (!process.env.API_ENDPOINT || !process.env.API_KEY)
    throw new Error(
      'Missing environment variables. Please check your the envs.'
    );

  const res = await fetch(
    `${process.env.API_ENDPOINT}/igdb/games/popular-sync`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': process.env.API_KEY,
      },
    }
  );

  if (!res.ok) {
    return res.json(
      {
        error: 'Failed to sync popular games',
      },
      500
    );
  }

  return res.json({
    message: 'Popular games synced successfully',
  });
};
