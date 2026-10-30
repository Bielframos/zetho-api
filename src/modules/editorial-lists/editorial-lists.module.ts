import { Module } from '@nestjs/common';
import { EditorialListsService } from './editorial-lists.service';
import { EditorialListsController } from './editorial-lists.controller';
@Module({
  controllers: [EditorialListsController],
  providers: [EditorialListsService],
  exports: [EditorialListsService],
})
export class EditorialListsModule {}
