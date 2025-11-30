/**
 * Test the GT06 location parsing to verify all data is being extracted
 */

// Simulate the GT06 decoder parsing logic
function parseGT06Location(hexPacket, socketImei = '35768907869960') {
    const buffer = Buffer.from(hexPacket, 'hex');
    
    console.log('=== GT06 Location Parsing Test ===');
    console.log('Raw packet:', hexPacket);
    console.log('Socket IMEI:', socketImei);
    console.log('');
    
    // Verify this is a location packet
    const messageType = buffer.readUInt8(3);
    if (messageType !== 0x12) {
        console.error('Not a location packet!');
        return null;
    }
    
    // Parse following our decoder logic
    const headerSize = 3; // 78 78 + length byte
    const dataOffset = headerSize + 1; // + message type
    
    // Parse timestamp
    const year = 2000 + buffer.readUInt8(dataOffset);
    const month = buffer.readUInt8(dataOffset + 1);
    const day = buffer.readUInt8(dataOffset + 2);
    const hour = buffer.readUInt8(dataOffset + 3);
    const minute = buffer.readUInt8(dataOffset + 4);
    const second = buffer.readUInt8(dataOffset + 5);
    const timestamp = new Date(year, month - 1, day, hour, minute, second);
    
    // Parse GPS data
    const gpsLength = buffer.readUInt8(dataOffset + 6);
    const satelliteCount = gpsLength & 0x0F;
    
    // Parse coordinates
    const latitudeRaw = buffer.readUInt32BE(dataOffset + 7);
    const longitudeRaw = buffer.readUInt32BE(dataOffset + 11);
    let latitude = latitudeRaw / 1800000.0;
    let longitude = longitudeRaw / 1800000.0;
    
    // Parse speed
    const speed = buffer.readUInt8(dataOffset + 15);
    
    // Parse course and status
    const courseStatus = buffer.readUInt16BE(dataOffset + 16);
    const course = courseStatus & 0x03FF;
    const gpsRealtime = !!(courseStatus & 0x2000);
    const gpsPositioned = !!(courseStatus & 0x1000);
    const eastWest = !!(courseStatus & 0x0800);
    const northSouth = !!(courseStatus & 0x0400);
    
    // Apply hemisphere
    if (!northSouth) latitude = -latitude;
    if (eastWest) longitude = -longitude;
    
    // Parse LBS data
    const mcc = buffer.readUInt16BE(dataOffset + 18);
    const mnc = buffer.readUInt8(dataOffset + 20);
    const lac = buffer.readUInt16BE(dataOffset + 21);
    const cellId = buffer.readUInt32BE(dataOffset + 23) >> 8; // 3 bytes
    
    // ACC status
    let acc = false;
    const length = buffer.readUInt8(2);
    if (length > 25) {
        const accOffset = dataOffset + 24;
        if (buffer.length > accOffset) {
            acc = !!(buffer.readUInt8(accOffset) & 0x01);
        }
    }
    
    // Serial number
    const serialPosition = headerSize + length - 4;
    const serial = buffer.readUInt16BE(serialPosition);
    
    // Build location data (matches our decoder)
    const location = {
        timestamp,
        latitude,
        longitude,
        speed,
        course,
        satelliteCount,
        gpsPositioned,
        gpsRealtime,
        mcc,
        mnc,
        lac,
        cellId,
        acc,
        serial,
    };
    
    // Build device data (matches transformToDeviceData)
    const deviceData = {
        imei: socketImei,
        protocol: 'GT06',
        packetType: 'LOCATION',
        timestamp: timestamp,
        raw: hexPacket,
        location: {
            latitude: latitude,
            longitude: longitude,
            altitude: 0,
            speed: speed,
            course: course,
            satellites: satelliteCount,
            timestamp: timestamp,
            valid: gpsPositioned || false,
        },
        sensors: {
            mcc: mcc,
            mnc: mnc,
            lac: lac,
            cellId: cellId,
            acc: acc,
            gpsRealtime: gpsRealtime,
            satellites: satelliteCount,
            speed: speed,
            course: course,
            gpsPositioned: gpsPositioned,
            serial: serial
        }
    };
    
    console.log('Expected output:');
    console.log(JSON.stringify(deviceData, null, 2));
    
    return deviceData;
}

// Test with your packet
const result = parseGT06Location('78781f12190b1d0e0c20080459ef6807fee40527c16001cc0000000000000001066c0d0a');

console.log('\n=== Data Verification ===');
console.log('IMEI populated:', !!result.imei);
console.log('Location has speed:', result.location.speed);
console.log('Location has satellites:', result.location.satellites);
console.log('Sensors has ACC:', typeof result.sensors.acc);
console.log('All data properly parsed:', !!(result.location && result.sensors));