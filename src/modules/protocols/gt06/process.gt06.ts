import { SocketWithMeta } from '@/types/socket-meta';
import { validateImei } from '@/utils/common';
import { Socket } from 'net';

/**
 * Process and handle GT06 protocol data
 * @param socket - The TCP socket connection
 * @param parsedData - Parsed data from the GT06 decoder
 * @param port - Port number where connection was received
 * @param protocol - Protocol identifier (gt06)
 */
export async function processGt06(
  socket: Socket,
  parsedData: any,
  port: number,
  protocol: string
): Promise<void> {
  console.log('=== Processing GT06 Data ===');
  // console.log('Protocol:', protocol);
  // console.log('Port:', port);
  // console.log('Socket ID:', socket.remoteAddress + ':' + socket.remotePort);
 // console.log('Parsed Data:', JSON.stringify(parsedData, null, 2));
  // console.log('=== GT06 Processing Complete ===');
   if(parsedData?.packetTypes?.includes('LOGIN')){
    const imei = parsedData.deviceData?.[0]?.imei;   
    const isvalidImei = await validateImei(imei);
    if(!isvalidImei){      
      socket.destroy();
      return;
    }
    updatesocketMeta( socket as SocketWithMeta,
      parsedData);

  }
  
  if(parsedData?.packetTypes?.includes('LOCATION')){
    console.log('Location Data:', JSON.stringify(parsedData, null, 2));
  }
  
  // TODO: Add database save logic here
  // TODO: Add data validation
  // TODO: Add error handling
}


function updatesocketMeta( socket: SocketWithMeta,
  parsedData: any): void {
 
 socket.meta.imei = parsedData.deviceData?.[0]?.imei;
 socket.meta.lastPacketAt = new Date();
  socket.meta.isAuthorized = true;

  console.log('Updated Socket Meta:');
  console.log(socket.meta);

}