import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ENDPOINT, PROJECT_ID } from 'infra/appwrite/constants';
import { Account, Client } from 'node-appwrite';

@Injectable()
export class AppwriteSessionGuard implements CanActivate {
  constructor() {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const authHeader = request.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      throw new UnauthorizedException('Token de autorização não fornecido');
    }

    try {
      const client = new Client()
        .setEndpoint(ENDPOINT)
        .setProject(PROJECT_ID)
        .setJWT(token);

      const account = new Account(client);
      const user = await account.get();

      request.user = user;

      return true;
    } catch (error) {
      console.log(error);
      throw new UnauthorizedException(
        'Sessão do Appwrite inválida ou expirada',
      );
    }
  }
}
