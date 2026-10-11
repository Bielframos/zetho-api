import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { ProfileComparisonService } from './profile-comparison.service';
import { ProfileComparisonQuery } from './profile-comparison.dto';

@Controller('profile')
@UseGuards(AppwriteSessionGuard)
export class ProfileComparisonController {
  constructor(private readonly comparison: ProfileComparisonService) {}

  @Get(':gamertag/compare')
  @Header('Cache-Control', 'private, no-store')
  compare(
    @Req() req: any,
    @Param('gamertag') gamertag: string,
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    query: ProfileComparisonQuery,
  ) {
    const jwt = req.headers.authorization?.split(' ')[1] ?? '';
    return this.comparison.compare(req.user.$id, jwt, gamertag, query);
  }
}
