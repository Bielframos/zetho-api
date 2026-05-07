import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';

@Injectable()
export class YoutubeService {
  private youtube: ReturnType<typeof google.youtube>;

  constructor() {
    this.youtube = google.youtube({
      version: 'v3',
      auth: process.env.GOOGLE_API_KEY,
    });
  }

  async searchVideos(query: string) {
    const response = await this.youtube.search.list({
      part: ['snippet'],
      q: query,
      type: ['video'],
      maxResults: 8,
    });

    const videos = response.data.items;

    return videos?.map((video) => {
      const videoId = video.id?.videoId;
      return {
        id: videoId ?? '',
        title: video.snippet?.title ?? '',
        channel: video.snippet?.channelTitle ?? '',
        description: video.snippet?.description ?? '',
      };
    });
  }
}
