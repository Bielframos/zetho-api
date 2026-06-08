import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import * as v from 'valibot';

@Injectable()
export class ValidationPipe implements PipeTransform {
  constructor(private schema: v.GenericSchema) {}

  transform(value: any, metadata: ArgumentMetadata) {
    const result = v.safeParse(this.schema, value);

    if (!result.success) {
      const errorMessages = result.issues.map((issue) => issue.message);

      throw new BadRequestException({
        message: 'Parâmetros da requisição invãlidos ou ausentes.',
        errors: errorMessages,
      });
    }
    return result.output;
  }
}
