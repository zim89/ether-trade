import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { CONFIG_NAMESPACES } from '@app/common/constants';
import { AppConfig } from '../config';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { NonceService } from './nonce.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    UsersModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => {
        const authConf = configService.get(CONFIG_NAMESPACES.auth, { infer: true });
        return {
          secret: authConf.jwtSecret,
          signOptions: {
            expiresIn: authConf.jwtExpiresIn as StringValue,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, NonceService],
  exports: [AuthService, TokenService, NonceService],
})
export class AuthModule {}
