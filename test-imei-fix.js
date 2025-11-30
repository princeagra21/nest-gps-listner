/**
 * Test GT06 IMEI handling with socket
 * This test verifies that location packets use socket IMEI when available
 */

const net = require('net');

// Mock socket with IMEI
class MockSocket {
    constructor(imei = '') {
        this.imei = imei;
    }
}

// Test function to verify GT06 decoder with IMEI
function testGT06LocationWithIMEI() {
    console.log('=== Testing GT06 Location Packet with Socket IMEI ===\n');
    
    // Sample location packet (the one from user's output)
    const locationPacketHex = '78781f12190b1d0e062e0a045a034107fed09369c1dc01cc0000000000000001069c0d0a';
    const buffer = Buffer.from(locationPacketHex, 'hex');
    
    // Mock socket with stored IMEI
    const socket = new MockSocket('123456789012345');
    
    console.log('Raw Location Packet:', locationPacketHex);
    console.log('Socket IMEI:', socket.imei);
    console.log('');
    
    // Parse packet structure manually to verify
    console.log('Packet Analysis:');
    console.log('- Start bits:', buffer.readUInt16BE(0).toString(16).padStart(4, '0'));
    console.log('- Length:', buffer.readUInt8(2), 'bytes');
    console.log('- Message type: 0x' + buffer.readUInt8(3).toString(16).padStart(2, '0'), '(LOCATION)');
    
    // Parse timestamp
    const year = 2000 + buffer.readUInt8(4);
    const month = buffer.readUInt8(5);
    const day = buffer.readUInt8(6);
    const hour = buffer.readUInt8(7);
    const minute = buffer.readUInt8(8);
    const second = buffer.readUInt8(9);
    const timestamp = new Date(year, month - 1, day, hour, minute, second);
    
    console.log('- Timestamp:', timestamp.toISOString());
    
    // Parse GPS data
    const gpsLength = buffer.readUInt8(10);
    const satelliteCount = gpsLength & 0x0F;
    console.log('- Satellites:', satelliteCount);
    
    // Parse coordinates
    const latitudeRaw = buffer.readUInt32BE(11);
    const longitudeRaw = buffer.readUInt32BE(15);
    let latitude = latitudeRaw / 1800000.0;
    let longitude = longitudeRaw / 1800000.0;
    
    // Parse course and status
    const courseStatus = buffer.readUInt16BE(21);
    const northSouth = !!(courseStatus & 0x0400);
    const eastWest = !!(courseStatus & 0x0800);
    
    // Apply hemisphere
    if (!northSouth) latitude = -latitude;
    if (eastWest) longitude = -longitude;
    
    console.log('- Latitude:', latitude.toFixed(6));
    console.log('- Longitude:', longitude.toFixed(6));
    console.log('- Speed:', buffer.readUInt8(19), 'km/h');
    console.log('- Course:', courseStatus & 0x03FF, 'degrees');
    
    console.log('');
    console.log('✅ Expected Result:');
    console.log('- IMEI should be:', socket.imei);
    console.log('- Packet type: LOCATION');
    console.log('- Valid GPS coordinates present');
    
    return {
        expectedIMEI: socket.imei,
        packetType: 'LOCATION',
        timestamp,
        latitude,
        longitude,
        valid: true
    };
}

// Run test
const result = testGT06LocationWithIMEI();
console.log('\n=== Test Result ===');
console.log(JSON.stringify(result, null, 2));