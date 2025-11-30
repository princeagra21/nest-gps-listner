/**
 * GT06 Packet Validator and Test Tool
 * Based on Traccar implementation and official GT06 protocol v1.8
 */

// CRC-ITU calculation (same as Traccar uses)
function calculateCRC(buffer, start, end) {
    let crc = 0xFFFF;
    for (let i = start; i < end; i++) {
        crc ^= (buffer[i] << 8) & 0xFFFF;
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
            } else {
                crc = (crc << 1) & 0xFFFF;
            }
        }
    }
    return crc;
}

// Parse GT06 packet
function parseGT06Packet(hexString) {
    const buffer = Buffer.from(hexString.replace(/\s/g, ''), 'hex');
    
    console.log('\n=== GT06 Packet Analysis ===');
    console.log('Raw HEX:', buffer.toString('hex'));
    console.log('Length:', buffer.length, 'bytes\n');
    
    // Check start bits
    const startBit = buffer.readUInt16BE(0);
    if (startBit !== 0x7878 && startBit !== 0x7979) {
        console.error('❌ Invalid start bits:', startBit.toString(16));
        return null;
    }
    console.log('✅ Start Bits:', startBit.toString(16).padStart(4, '0'));
    
    // Length
    const length = buffer.readUInt8(2);
    console.log('✅ Length:', length, 'bytes');
    
    // Protocol number
    const protocolType = buffer.readUInt8(3);
    const protocolNames = {
        0x01: 'Login',
        0x12: 'GPS+LBS',
        0x13: 'Heartbeat',
        0x16: 'Alarm',
        0x1A: 'Status',
        0x22: 'GPS+LBS Extended',
    };
    console.log('✅ Protocol:', '0x' + protocolType.toString(16).padStart(2, '0'), '-', protocolNames[protocolType] || 'Unknown');
    
    // CRC check
    const crcPosition = 2 + 1 + length;
    const expectedCRC = buffer.readUInt16BE(crcPosition);
    const calculatedCRC = calculateCRC(buffer, 2, crcPosition);
    
    if (expectedCRC === calculatedCRC) {
        console.log('✅ CRC:', '0x' + expectedCRC.toString(16).padStart(4, '0'), '(Valid)');
    } else {
        console.log('❌ CRC Mismatch!');
        console.log('   Expected:', '0x' + expectedCRC.toString(16).padStart(4, '0'));
        console.log('   Calculated:', '0x' + calculatedCRC.toString(16).padStart(4, '0'));
        return null;
    }
    
    // Stop bits
    const stopBits = buffer.readUInt16BE(buffer.length - 2);
    if (stopBits === 0x0d0a) {
        console.log('✅ Stop Bits: 0d0a');
    } else {
        console.log('❌ Invalid stop bits:', stopBits.toString(16));
    }
    
    // Extract serial number (last 2 bytes before CRC)
    const serialPosition = 2 + 1 + length - 2;
    const serial = buffer.readUInt16BE(serialPosition);
    console.log('✅ Serial Number:', '0x' + serial.toString(16).padStart(4, '0'), '(' + serial + ')');
    
    // Protocol-specific parsing
    if (protocolType === 0x01) {
        // Login packet - extract IMEI
        const imeiBuffer = buffer.slice(4, 12);
        let imei = '';
        for (let i = 0; i < 8; i++) {
            imei += imeiBuffer[i].toString(16).padStart(2, '0');
        }
        console.log('📱 IMEI:', imei);
    } else if (protocolType === 0x12 || protocolType === 0x22) {
        // Location packet
        const year = 2000 + buffer.readUInt8(4);
        const month = buffer.readUInt8(5);
        const day = buffer.readUInt8(6);
        const hour = buffer.readUInt8(7);
        const minute = buffer.readUInt8(8);
        const second = buffer.readUInt8(9);
        console.log('📅 DateTime:', `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`);
        
        const satCount = buffer.readUInt8(10) & 0x0F;
        console.log('🛰️  Satellites:', satCount);
        
        const lat = buffer.readUInt32BE(11) / 1800000;
        const lon = buffer.readUInt32BE(15) / 1800000;
        const speed = buffer.readUInt8(19);
        const courseStatus = buffer.readUInt16BE(20);
        const course = courseStatus & 0x03FF;
        const gpsPositioned = !!(courseStatus & 0x1000);
        
        console.log('📍 Location:', lat.toFixed(6) + '°', lon.toFixed(6) + '°');
        console.log('🧭 Speed:', speed, 'km/h, Course:', course, '°');
        console.log('📡 GPS Fix:', gpsPositioned ? 'Yes' : 'No');
    }
    
    return {
        protocol: protocolType,
        serial,
        length,
        valid: true
    };
}

// Generate ACK response
function generateACK(hexString) {
    const parsed = parseGT06Packet(hexString);
    if (!parsed) {
        console.log('\n❌ Cannot generate ACK for invalid packet');
        return null;
    }
    
    console.log('\n=== Generating ACK ===');
    
    const ackBuffer = Buffer.alloc(10);
    ackBuffer.writeUInt16BE(0x7878, 0); // Start
    ackBuffer.writeUInt8(0x05, 2); // Length
    ackBuffer.writeUInt8(parsed.protocol, 3); // Protocol type
    ackBuffer.writeUInt16BE(parsed.serial, 4); // Serial number
    
    // Calculate CRC
    const crc = calculateCRC(ackBuffer, 2, 6);
    ackBuffer.writeUInt16BE(crc, 6);
    ackBuffer.writeUInt16BE(0x0d0a, 8); // Stop bits
    
    console.log('✅ ACK Packet:', ackBuffer.toString('hex'));
    console.log('   Breakdown:');
    console.log('   - Start: 7878');
    console.log('   - Length: 05');
    console.log('   - Type:', '0x' + parsed.protocol.toString(16).padStart(2, '0'));
    console.log('   - Serial:', '0x' + parsed.serial.toString(16).padStart(4, '0'));
    console.log('   - CRC:', '0x' + crc.toString(16).padStart(4, '0'));
    console.log('   - Stop: 0d0a');
    
    return ackBuffer;
}

// Main test
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║         GT06 Packet Validator & ACK Generator            ║');
console.log('║              Based on Traccar Implementation             ║');
console.log('╚═══════════════════════════════════════════════════════════╝');

// Test with your login packet
const testPackets = [
    '78780d010000000003332210000100770d0a', // Your login packet
    '78780d010359339075016807420d0a', // Traccar forum example
];

testPackets.forEach((packet, index) => {
    console.log(`\n\n========== TEST PACKET ${index + 1} ==========`);
    generateACK(packet);
});

console.log('\n\n========== CUSTOM PACKET TEST ==========');
console.log('Usage: node test-gt06-packet.js <hex_packet>');
if (process.argv[2]) {
    generateACK(process.argv[2]);
}

console.log('\n✅ Validator complete!');
