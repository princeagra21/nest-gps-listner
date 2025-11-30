/**
 * Analyze the raw GT06 location packet to debug parsing
 */

// Your raw packet
const hex = '78781f12190b1d0e0c20080459ef6807fee40527c16001cc0000000000000001066c0d0a';
const buffer = Buffer.from(hex, 'hex');

console.log('=== GT06 Packet Analysis ===');
console.log('Raw HEX:', hex);
console.log('Buffer length:', buffer.length);
console.log('');

// Basic structure
console.log('Packet Structure:');
console.log('Start bits:', buffer.readUInt16BE(0).toString(16).padStart(4, '0'));
console.log('Length:', buffer.readUInt8(2));
console.log('Message type:', '0x' + buffer.readUInt8(3).toString(16).padStart(2, '0'));
console.log('');

// Parse timestamp
console.log('Timestamp:');
const year = 2000 + buffer.readUInt8(4);
const month = buffer.readUInt8(5);
const day = buffer.readUInt8(6);
const hour = buffer.readUInt8(7);
const minute = buffer.readUInt8(8);
const second = buffer.readUInt8(9);
console.log(`Date: ${year}-${month.toString().padStart(2,'0')}-${day.toString().padStart(2,'0')} ${hour.toString().padStart(2,'0')}:${minute.toString().padStart(2,'0')}:${second.toString().padStart(2,'0')}`);
console.log('');

// Parse GPS data
console.log('GPS Data:');
const gpsLength = buffer.readUInt8(10);
const satelliteCount = gpsLength & 0x0F;
console.log('GPS length byte:', '0x' + gpsLength.toString(16).padStart(2, '0'));
console.log('Satellite count:', satelliteCount);

// Parse coordinates
const latitudeRaw = buffer.readUInt32BE(11);
const longitudeRaw = buffer.readUInt32BE(15);
console.log('Latitude raw:', latitudeRaw, '(0x' + latitudeRaw.toString(16) + ')');
console.log('Longitude raw:', longitudeRaw, '(0x' + longitudeRaw.toString(16) + ')');

let latitude = latitudeRaw / 1800000.0;
let longitude = longitudeRaw / 1800000.0;

// Parse speed
const speed = buffer.readUInt8(19);
console.log('Speed:', speed, 'km/h');

// Parse course and status
const courseStatus = buffer.readUInt16BE(20);
console.log('Course/Status word:', '0x' + courseStatus.toString(16).padStart(4, '0'));

const course = courseStatus & 0x03FF;
const gpsRealtime = !!(courseStatus & 0x2000);
const gpsPositioned = !!(courseStatus & 0x1000);
const eastWest = !!(courseStatus & 0x0800);
const northSouth = !!(courseStatus & 0x0400);

console.log('Course:', course, 'degrees');
console.log('GPS realtime:', gpsRealtime);
console.log('GPS positioned:', gpsPositioned);
console.log('East/West:', eastWest ? 'West' : 'East');
console.log('North/South:', northSouth ? 'North' : 'South');

// Apply hemisphere
if (!northSouth) latitude = -latitude;
if (eastWest) longitude = -longitude;

console.log('Final latitude:', latitude.toFixed(6));
console.log('Final longitude:', longitude.toFixed(6));
console.log('');

// Parse LBS data
console.log('LBS Data:');
const mcc = buffer.readUInt16BE(22);
const mnc = buffer.readUInt8(24);
const lac = buffer.readUInt16BE(25);
const cellId = buffer.readUInt32BE(27) >> 8; // 3 bytes, so shift right 8 bits

console.log('MCC (Mobile Country Code):', mcc);
console.log('MNC (Mobile Network Code):', mnc);
console.log('LAC (Location Area Code):', lac);
console.log('Cell ID:', cellId);

// ACC status
let acc = false;
if (buffer.length > 30) {
  const accByte = buffer.readUInt8(30);
  acc = !!(accByte & 0x01);
  console.log('ACC byte:', '0x' + accByte.toString(16).padStart(2, '0'));
  console.log('ACC status:', acc);
}

console.log('');
console.log('=== Summary ===');
const result = {
  timestamp: new Date(year, month - 1, day, hour, minute, second),
  latitude: latitude,
  longitude: longitude,
  speed: speed,
  course: course,
  satelliteCount: satelliteCount,
  gpsPositioned: gpsPositioned,
  gpsRealtime: gpsRealtime,
  mcc: mcc,
  mnc: mnc,
  lac: lac,
  cellId: cellId,
  acc: acc
};

console.log(JSON.stringify(result, null, 2));