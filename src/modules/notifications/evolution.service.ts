import { Injectable } from '@nestjs/common';

@Injectable()
export class EvolutionService {
  constructor() {}

  private async api({
    method,
    path,
    body,
  }: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    body?: any;
  }) {
    const baseUrl = process.env.EVOLUTION_API_URL;
    const token = process.env.EVOLUTION_API_TOKEN;

    if (!baseUrl || !token) {
      throw new Error('Evolution API URL and token must be set');
    }

    const url = new URL(path, baseUrl).toString();
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        apikey: token,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      throw new Error('Error to communicate with evolution api');
    }

    const data = await res.json();
    return data;
  }
}
