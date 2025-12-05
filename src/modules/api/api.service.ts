import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ExtendedLoggerService } from '@/modules/logger/logger.interface';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { TcpServerService } from '../tcp-server/tcp-server.service';
import { PrismaService } from '../sqlconnection/prisma.service';
import { ConnectionManagerService } from '../connection-manager/connection-manager.service';
import { CommonService } from '../common/common.service';
import { bool, boolean } from 'joi';

@Injectable()
export class ApiService implements OnModuleInit {

    constructor(
        @Inject(WINSTON_MODULE_NEST_PROVIDER)
        private readonly logger: ExtendedLoggerService,
        private readonly tcpServerService: TcpServerService,
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
        private readonly connectionManager: ConnectionManagerService,
        private readonly commonService: CommonService,
    ) { }

    async onModuleInit(): Promise<void> {
        try {
            this.logger.log('✅ API Service initialized');
        } catch (error) {
            this.logger.error(
                '❌ Failed to initialize API Service',
                error.stack,
                ApiService.name,
            );
        }
    }

    /**
     * Get system health status
     */
    async getHealthStatus(): Promise<any> {
        try {
            return {
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
            };
        } catch (error) {
            this.logger.error(
                '❌ Failed to get health status',
                error.stack,
                ApiService.name,
            );
            return null;
        }
    }

    /**
     * Get system information
     */
    getSystemInfo(): any {
        try {
            return {
                name: 'ListnerNest GPS Tracker Server',
                version: '1.0.0',
                environment: process.env.NODE_ENV || 'development',
                nodeVersion: process.version,
                platform: process.platform,
                pid: process.pid,
            };
        } catch (error) {
            this.logger.error(
                '❌ Failed to get system info',
                error.stack,
                ApiService.name,
            );
            return null;
        }
    }


    async SendCommand(imei: string, command: string): Promise<{ message: string }> {
        try {
            const sent = this.tcpServerService.sendCommandbyIMEI(imei, command);
            if (!sent) {
                await this.prisma.commandQueue.create({
                    data: {
                        imei,
                        command,
                    },
                });
                return { message: 'Device offline. Command queued.' };
            }
            return { message: 'Command sent successfully.' };


        } catch (error) {
            this.logger.error(
                '❌ Failed to send command',
                error.stack,
                ApiService.name,
            );
            return { message: 'Failed to send command' };
        }

    }
}