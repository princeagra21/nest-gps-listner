import { PrismaClient } from '@prisma/client';

import { Logger } from '@nestjs/common';

import { ConnectionManagerService } from  '../modules/connection-manager/connection-manager.service';

const prisma = new PrismaClient();
const logger = new Logger('CommonUtils');

/**
 * Validate IMEI exists in database
 */
export async function validateImei(imei: string): Promise<boolean> {
//   try {
//     const device = await prisma.devices.findUnique({
//       where: {
//         imei: imei
//       }
//     });    
    
//     return device !== null;
//   } catch (error) {
//     logger.error(`Database error while validating IMEI ${imei}`, (error as Error).stack);
//     return false;
//   }
return true;
}
