# Simple GT06 Decoder

A standalone GT06 protocol decoder that requires **NO database connection**. This decoder focuses purely on decoding buffer data from GT06 GPS tracking devices.

## Features

✅ **No Database Dependencies** - Pure packet decoding only  
✅ **Complete GT06 Protocol Support** - Login, Location, Alarm, Heartbeat packets  
✅ **Auto Acknowledgment** - Generates proper ACK responses  
✅ **Buffer Management** - Handles incomplete packets and streaming data  
✅ **Data Transformation** - Converts to standardized device data format  
✅ **Error Handling** - Robust error handling and validation  

## Quick Start

```typescript
import { SimpleGT06Decoder } from './modules/protocols/gt06/simple-gt06-decoder';

const decoder = new SimpleGT06Decoder();

// Check if buffer contains complete packet
if (decoder.hasCompletePacket(buffer)) {
  // Decode the packet
  const decoded = decoder.decode(buffer);
  
  if (decoded) {
    console.log('IMEI:', decoded.imei);
    console.log('Packet Type:', decoded.type);
    console.log('Data:', decoded.data);
    
    // Generate ACK if needed
    if (decoded.requiresAck) {
      const ack = decoder.generateAck(decoded);
      socket.write(ack); // Send back to device
    }
    
    // Transform to standard format
    const deviceData = decoder.transformToDeviceData(decoded);
    console.log('Location:', deviceData?.location);
  }
}
```

## Usage Examples

### 1. Basic Packet Decoding

```typescript
// Demo function showing basic usage
import { decodeGT06Data } from './gt06-decoder-demo';
decodeGT06Data();
```

### 2. Stream Processing

```typescript
// Process streaming data from TCP socket
import { processGT06Stream } from './gt06-decoder-demo';

let buffer = Buffer.alloc(0);

socket.on('data', (data) => {
  buffer = Buffer.concat([buffer, data]);
  
  const result = processGT06Stream(buffer);
  buffer = result.remainingBuffer;
  
  // Handle decoded packets
  result.processedPackets.forEach(packet => {
    console.log('Device:', packet.deviceData.imei);
    console.log('Location:', packet.deviceData.location);
    
    // Send ACK if required
    if (packet.ackRequired) {
      socket.write(packet.ackRequired);
    }
  });
});
```

### 3. Simple TCP Server

```typescript
// Create a minimal GT06 server (no database)
import { createSimpleGT06Server } from './gt06-decoder-demo';

const server = createSimpleGT06Server(5023);
console.log('GT06 server started on port 5023');
```

## API Reference

### SimpleGT06Decoder

#### Methods

##### `hasCompletePacket(buffer: Buffer): boolean`
Check if the buffer contains a complete GT06 packet.

##### `getPacketLength(buffer: Buffer): number`
Get the length of the next packet in the buffer.

##### `decode(buffer: Buffer): DecodedPacket | null`
Decode a GT06 packet from buffer. Returns null if decoding fails.

##### `generateAck(packet: DecodedPacket): Buffer | null`
Generate acknowledgment packet for the decoded packet.

##### `transformToDeviceData(packet: DecodedPacket): DeviceData | null`
Transform decoded packet to standardized device data format.

#### Decoded Packet Structure

```typescript
interface DecodedPacket {
  type: PacketType;           // LOGIN, LOCATION, ALARM, HEARTBEAT
  raw: Buffer;               // Original raw packet
  timestamp: Date;           // Processing timestamp  
  serialNumber: number;      // Packet serial number
  requiresAck: boolean;      // Whether packet needs acknowledgment
  imei?: string;            // Device IMEI (present in login/data packets)
  data?: any;               // Parsed packet data
}
```

#### Device Data Structure

```typescript
interface DeviceData {
  imei: string;
  protocol: string;
  packetType: PacketType;
  timestamp: Date;
  raw: string;              // Hex string of raw packet
  location?: LocationData;   // GPS location (if available)
  sensors?: any;            // Additional sensor data
  status?: any;             // Status information
}
```

## Supported Packet Types

| Type | Description | Contains |
|------|-------------|----------|
| **LOGIN** | Initial device connection | IMEI, software version |
| **LOCATION** | GPS positioning data | Lat/lon, speed, course, satellites |
| **ALARM** | Alarm/event data | Location + alarm type |
| **HEARTBEAT** | Keep-alive packet | Minimal status data |

## GT06 Protocol Details

The decoder supports both short (0x78 0x78) and long (0x79 0x79) GT06 packet formats:

```
Short Format: 
[Start][Start][Length][Data...][CRC][Stop][Stop]
 0x78  0x78   1-byte   N-bytes  2-byte 0x0D  0x0A

Long Format:
[Start][Start][Length][Data...][CRC][Stop][Stop] 
 0x79  0x79   2-bytes  N-bytes  2-byte 0x0D  0x0A
```

## Error Handling

The decoder includes comprehensive error handling:

- Invalid packet format detection
- Coordinate validation (excludes null island, out-of-range values)
- Buffer boundary checking
- CRC validation for acknowledgments
- Graceful handling of unknown message types

## No Database Required

Unlike the full GT06 decoder in this project, the Simple GT06 Decoder:

❌ **Does NOT require:**
- Database connections
- Device validation
- User authentication
- Data persistence
- Connection management

✅ **Only provides:**
- Raw packet decoding
- Data transformation
- ACK generation
- Buffer management

## Testing Your Device

1. Run the demo: `npm run ts-node src/gt06-decoder-demo.ts`
2. Start simple server: Uncomment server code in demo
3. Connect your GT06 device to port 5023
4. Watch console for decoded packets (no database needed!)

## Integration

To integrate this decoder into your existing system:

```typescript
import { SimpleGT06Decoder } from './modules/protocols/gt06/simple-gt06-decoder';

// Use in your own TCP server or data processing pipeline
const decoder = new SimpleGT06Decoder();

// Your implementation here - no database dependencies!
```

This decoder is perfect for:
- Testing GT06 devices
- Data analysis and debugging  
- Building custom tracking solutions
- Understanding GT06 protocol
- Rapid prototyping

**No database setup required - just decode and go!** 🚀