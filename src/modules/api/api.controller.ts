import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { TcpServerService } from '../tcp-server/tcp-server.service';
import { ConnectionManagerService } from '../connection-manager/connection-manager.service';
import { ApiService } from './api.service';
import { ConfigService } from '@nestjs/config';
import { BearerAuthGuard } from './guard/bearer-auth.guard';

@Controller('api')
export class ApiController {



  constructor(   
    private readonly apiService: ApiService,
   
  ) {

     
  }

  @Get('health')
  async getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }


 @Post('commands/:imei')
 @UseGuards(BearerAuthGuard)
  async addCommand(@Param('imei') imei: string, @Body('command') command: string) {
    
    return  await this.apiService.SendCommand(imei, command); 
  
  }

  @Get('info')
  getInfo() {
    return {
      name: 'ListnerNest GPS Tracker Server',
      version: '1.0.0',
      environment: process.env.NODE_ENV,
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
    };
  }
}
