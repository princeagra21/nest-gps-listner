import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';

@Injectable()
export class BearerAuthGuard implements CanActivate {
  private readonly SECRET_KEY: string;

  constructor(private readonly configService: ConfigService) {
    this.SECRET_KEY = this.configService.get('app.security.secretKey') as string;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is missing');
    }

    const [type, token] = authHeader.split(' ');

    if (type?.toLowerCase() !== 'bearer') {
      throw new UnauthorizedException('Invalid authorization type. Expected Bearer token');
    }

    if (!token || token !== this.SECRET_KEY) {
      throw new UnauthorizedException('Unauthorized');
    }

    return true;
  }
}
