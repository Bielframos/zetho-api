import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ID, MessagingProviderType } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';

/** Subscribes user email targets to game news topics. */
@Injectable()
export class GameSubscriptionsService {
  private readonly tablesDB: Appwrite['tablesDB'];
  constructor(private readonly appwrite: Appwrite) {
    this.tablesDB = appwrite.tablesDB;
  }

  async setSubscription(userId: string, gameId: string, active: boolean) {
    const topicId = `game_${gameId}`;

    // 1. Obter targets de E-mail do usuário
    const targetsList = await this.appwrite.users.listTargets({ userId });
    let emailTargets = targetsList.targets.filter(
      (target) => target.providerType === 'email',
    );

    // Fallback: Se o usuário tiver e-mail mas não tiver target de e-mail registrado
    if (emailTargets.length === 0) {
      const user = await this.appwrite.users.get({ userId });
      if (user.email) {
        const newTarget = await this.appwrite.users.createTarget({
          userId,
          targetId: ID.unique(),
          providerType: MessagingProviderType.Email,
          identifier: user.email,
        });
        emailTargets = [newTarget];
      }
    }

    if (emailTargets.length === 0) {
      return {
        success: false,
        message: 'Nenhum endereço de e-mail cadastrado ou disponível.',
      };
    }

    if (active) {
      // 2. Garantir que o tópico existe no Appwrite (Criação sob demanda)
      try {
        await this.appwrite.messaging.getTopic({ topicId });
      } catch (error: any) {
        if (error.code === 404) {
          // Buscar nome do jogo para exibir no console do Appwrite
          const game = await this.tablesDB.getRow<any>({
            databaseId: 'app',
            tableId: 'games',
            rowId: gameId,
          });
          await this.appwrite.messaging.createTopic({
            topicId,
            name: `Novidades: ${game.name}`,
          });
        } else {
          throw error;
        }
      }

      // 3. Inscrever os targets de e-mail do usuário no tópico
      for (const target of emailTargets) {
        const subscriberId = createHash('md5')
          .update(`${target.$id}_${topicId}`)
          .digest('hex');

        try {
          await this.appwrite.messaging.createSubscriber({
            topicId,
            subscriberId,
            targetId: target.$id,
          });
        } catch (error: any) {
          // Ignorar se já estiver inscrito
          if (error.code !== 409) throw error;
        }
      }
    } else {
      // 4. Cancelar inscrição dos targets de e-mail
      for (const target of emailTargets) {
        const subscriberId = createHash('md5')
          .update(`${target.$id}_${topicId}`)
          .digest('hex');

        try {
          await this.appwrite.messaging.deleteSubscriber({
            topicId,
            subscriberId,
          });
        } catch (error: any) {
          // Ignorar se não estava cadastrado
          if (error.code !== 404) throw error;
        }
      }
    }

    return { success: true };
  }
}
