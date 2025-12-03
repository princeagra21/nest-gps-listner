import { Injectable } from '@nestjs/common';
import { PrismaService } from '../sqlconnection/prisma.service';

@Injectable()
export class CommonService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Example: Get user by ID
   */
  async getUserById(userId: number) {
    return await this.prisma.users.findUnique({
      where: { uid: userId },
      include: {
        addresses: true,
        companies: true,
      },
    });
  }



  /**
   * Utility: Delay helper
   */
 async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }


}
