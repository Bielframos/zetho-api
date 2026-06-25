import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from 'src/common/guards/roles.decorator';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { CreateThemeDto } from './themes.dto';
import { ThemesService } from './themes.service';

@Controller('themes')
export class ThemesController {
  constructor(private readonly themesService: ThemesService) {}

  @Get()
  async listThemes() {
    return this.themesService.listThemes();
  }

  @Post('buy/:id')
  @UseGuards(AppwriteSessionGuard)
  async buyTheme(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.$id;
    return this.themesService.buyTheme(userId, id);
  }

  @Post('equip/:id')
  @UseGuards(AppwriteSessionGuard)
  async equipTheme(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.$id;
    return this.themesService.equipTheme(userId, id);
  }

  @Delete('equip')
  @UseGuards(AppwriteSessionGuard)
  async unequipTheme(@Req() req: any) {
    const userId = req.user.$id;
    return this.themesService.equipTheme(userId, null);
  }
}

@Controller('admin/themes')
export class AdminThemesController {
  constructor(private readonly themesService: ThemesService) {}

  @Post()
  @UseGuards(AppwriteSessionGuard)
  @Roles(['admin'])
  @UseInterceptors(FileInterceptor('backgroundImage'))
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async createTheme(
    @Body() dto: CreateThemeDto,
    @UploadedFile()
    file?: { buffer: Buffer; originalname: string; mimetype?: string },
  ) {
    return this.themesService.createTheme(dto, file);
  }
}
