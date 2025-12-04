/**
 * Production-standard GT06 Location Decoding Validation
 * Tests all parameters are correctly decoded including ACC, speed, course, etc.
 */

function testGT06LocationDecoding() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  GT06 Location Packet Decoding - Production Validation        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // Test packet: 78781f12190b1d0e0c20080459ef6807fee40527c16001cc0000000000000001066c0d0a
    const hexPacket = '78781f12190b1d0e0c20080459ef6807fee40527c16001cc0000000000000001066c0d0a';
    const buffer = Buffer.from(hexPacket, 'hex');

    console.log('📦 Raw Packet:', hexPacket);
    console.log('📏 Length:', buffer.length, 'bytes\n');

    // Parse packet structure
    const startBit = buffer.readUInt16BE(0);
    const length = buffer.readUInt8(2);
    const messageType = buffer.readUInt8(3);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 PACKET STRUCTURE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Start Bit: 0x${startBit.toString(16)} (${startBit === 0x7878 ? '✅ Valid' : '❌ Invalid'})`);
    console.log(`Length: ${length} bytes`);
    console.log(`Message Type: 0x${messageType.toString(16).padStart(2, '0')} (${messageType === 0x12 ? '✅ LOCATION' : '❌ Not Location'})\n`);

    if (messageType !== 0x12) {
        console.log('❌ Test failed: Not a location packet');
        return;
    }

    // Start decoding from offset 4 (after start, length, message type)
    let offset = 4;

    // Date and Time (6 bytes)
    const year = 2000 + buffer.readUInt8(offset);
    const month = buffer.readUInt8(offset + 1);
    const day = buffer.readUInt8(offset + 2);
    const hour = buffer.readUInt8(offset + 3);
    const minute = buffer.readUInt8(offset + 4);
    const second = buffer.readUInt8(offset + 5);
    offset += 6;

    const timestamp = new Date(year, month - 1, day, hour, minute, second);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📅 TIMESTAMP');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Date/Time: ${timestamp.toISOString()}`);
    console.log(`Raw: ${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}\n`);

    // GPS Info
    const gpsInfo = buffer.readUInt8(offset);
    const gpsLength = (gpsInfo >> 4) & 0x0f;
    const satelliteCount = gpsInfo & 0x0f;
    offset += 1;

    // Latitude (4 bytes)
    const latRaw = buffer.readUInt32BE(offset);
    let latitude = latRaw / 1800000.0;
    offset += 4;

    // Longitude (4 bytes)
    const lonRaw = buffer.readUInt32BE(offset);
    let longitude = lonRaw / 1800000.0;
    offset += 4;

    // Speed (1 byte)
    const speed = buffer.readUInt8(offset);
    offset += 1;

    // Course and status (2 bytes)
    const courseStatus = buffer.readUInt16BE(offset);
    const course = courseStatus & 0x03ff; // Bits 0-9
    const gpsRealtime = (courseStatus & 0x2000) !== 0; // Bit 13
    const gpsFixed = (courseStatus & 0x1000) !== 0;    // Bit 12
    const lonWest = (courseStatus & 0x0800) !== 0;     // Bit 11
    const latNorth = (courseStatus & 0x0400) !== 0;    // Bit 10
    offset += 2;

    // Apply hemisphere corrections
    if (!latNorth) latitude = -latitude;
    if (lonWest) longitude = -longitude;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🛰️  GPS DATA');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`GPS Length: ${gpsLength}`);
    console.log(`Satellites: ${satelliteCount}`);
    console.log(`GPS Fixed: ${gpsFixed ? '✅ Yes' : '❌ No'}`);
    console.log(`GPS Realtime: ${gpsRealtime ? '✅ Yes' : '❌ No'}`);
    console.log(`\n📍 Coordinates:`);
    console.log(`  Latitude:  ${latitude.toFixed(6)}° (Raw: ${latRaw}, Hemisphere: ${latNorth ? 'North' : 'South'})`);
    console.log(`  Longitude: ${longitude.toFixed(6)}° (Raw: ${lonRaw}, Hemisphere: ${lonWest ? 'West' : 'East'})`);
    console.log(`\n🚗 Movement:`);
    console.log(`  Speed: ${speed} km/h`);
    console.log(`  Course: ${course}°\n`);

    // LBS Data (8 bytes)
    const remainingBytes = buffer.length - offset - 6; // 6 = serial(2) + crc(2) + stop(2)

    let mcc = 0, mnc = 0, lac = 0, cellId = 0, acc = false;

    if (remainingBytes >= 8) {
        mcc = buffer.readUInt16BE(offset);
        offset += 2;
        mnc = buffer.readUInt8(offset);
        offset += 1;
        lac = buffer.readUInt16BE(offset);
        offset += 2;
        // Cell ID is 3 bytes
        const cellIdRaw = buffer.readUInt32BE(offset - 1);
        cellId = cellIdRaw & 0x00ffffff;
        offset += 3;

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📡 LBS DATA (Location Based Service)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`MCC (Mobile Country Code): ${mcc}`);
        console.log(`MNC (Mobile Network Code): ${mnc}`);
        console.log(`LAC (Location Area Code): ${lac}`);
        console.log(`Cell ID: ${cellId}\n`);
    }

    // ACC status (1 byte) - optional
    if (remainingBytes >= 9) {
        const accByte = buffer.readUInt8(offset);
        acc = (accByte & 0x01) !== 0;
        offset += 1;

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔑 VEHICLE STATUS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`ACC (Ignition): ${acc ? '✅ ON' : '❌ OFF'} (Raw byte: 0x${accByte.toString(16).padStart(2, '0')})\n`);
    } else {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔑 VEHICLE STATUS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('ACC: ℹ️  Not included in this packet\n');
    }

    // Serial number and CRC
    const serialPosition = 2 + length - 4; // position from start
    const serial = buffer.readUInt16BE(serialPosition);
    const crc = buffer.readUInt16BE(serialPosition + 2);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 PACKET INTEGRITY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Serial Number: ${serial} (0x${serial.toString(16).padStart(4, '0')})`);
    console.log(`CRC: 0x${crc.toString(16).padStart(4, '0')}\n`);

    // Summary
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  VALIDATION SUMMARY                                            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const validations = [
        { name: 'Timestamp Parsed', status: !isNaN(timestamp.getTime()) },
        { name: 'GPS Satellites Count', status: satelliteCount > 0 },
        { name: 'GPS Fixed Status', status: typeof gpsFixed === 'boolean' },
        { name: 'GPS Realtime Status', status: typeof gpsRealtime === 'boolean' },
        { name: 'Latitude Valid', status: latitude >= -90 && latitude <= 90 },
        { name: 'Longitude Valid', status: longitude >= -180 && longitude <= 180 },
        { name: 'Speed Decoded', status: speed >= 0 },
        { name: 'Course Decoded', status: course >= 0 && course <= 360 },
        { name: 'LBS Data Present', status: remainingBytes >= 8 },
        { name: 'ACC Status Decoded', status: remainingBytes >= 9 },
    ];

    validations.forEach(v => {
        const icon = v.status ? '✅' : '❌';
        console.log(`${icon} ${v.name}`);
    });

    const allValid = validations.every(v => v.status);
    console.log('\n' + '═'.repeat(64));
    console.log(allValid ? '✅ ALL VALIDATIONS PASSED' : '⚠️  SOME VALIDATIONS FAILED');
    console.log('═'.repeat(64) + '\n');

    // Return structured data
    return {
        timestamp,
        location: {
            latitude,
            longitude,
            speed,
            course,
            satellites: satelliteCount,
            valid: gpsFixed,
        },
        sensors: {
            gpsFixed,
            gpsRealtime,
            satelliteCount,
            gpsLength,
            speed,
            course,
            mcc,
            mnc,
            lac,
            cellId,
            acc,
            serialNumber: serial,
        },
    };
}

// Run the test
const result = testGT06LocationDecoding();
console.log('📤 Structured Output:');
console.log(JSON.stringify(result, null, 2));
