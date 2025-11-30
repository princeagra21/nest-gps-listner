# GT06 Packet Debugging Guide

## Your Packet Analysis

**Raw Packet:** `78780d010000000003332210000100770d0a`

### Breakdown:
```
78 78    - Start bits (0x7878)
0d       - Length (13 bytes of data)
01       - Protocol number (0x01 = Login)
00000000 03332210 - Terminal ID/IMEI (8 bytes)
0001     - Serial number
0077     - CRC checksum
0d 0a    - Stop bits
```

### Packet Structure:
- **Start**: 2 bytes (offset 0-1)
- **Length**: 1 byte (offset 2) = 0x0D (13)
- **Data**: 13 bytes (offset 3-15)
  - Protocol: 1 byte (offset 3) = 0x01
  - IMEI: 8 bytes (offset 4-11)
  - Serial: 2 bytes (offset 12-13)
  - Info: 2 bytes (offset 14-15)
- **CRC**: 2 bytes (offset 16-17) = 0x0077
- **Stop**: 2 bytes (offset 18-19) = 0x0D0A

## CRC Calculation Fix

### Previous Issue
The CRC was calculated incorrectly because:
1. Wrong CRC position calculation
2. Wrong range for CRC calculation

### Fixed Implementation
```typescript
// CRC Position: start(2) + length(1) + data(length)
const crcPosition = 2 + 1 + length; // = 2 + 1 + 13 = 16

// CRC is calculated from length byte to end of data
const calculatedCrc = this.calculateCrc16(buffer, 2, 16);
```

## Testing the Fix

### 1. Check Logs
After the fix, you should see:
```
Device logged in: 0000000003332210 on GT06
```

Instead of:
```
CRC mismatch in GT06 packet
```

### 2. Expected ACK Response
For your login packet, the server will respond with:
```
78 78 05 01 00 01 00 01 [CRC] 0d 0a
│  │  │  │  │     │     │     │
│  │  │  │  │     │     │     └─ Stop bits
│  │  │  │  │     │     └─ CRC
│  │  │  │  │     └─ Info (0x0001 = success)
│  │  │  │  └─ Serial (copied from request)
│  │  │  └─ Protocol (0x01 = login ack)
│  │  └─ Length (5 bytes)
│  └─ Start bits
```

### 3. Verify with Device
The GPS device should:
1. Connect to port 5023
2. Send login packet
3. Receive ACK
4. Start sending location data

## Common GT06 Protocol Numbers

| Protocol | Hex | Description |
|----------|-----|-------------|
| Login | 0x01 | Device login |
| Heartbeat | 0x13 | Keep-alive |
| GPS+LBS | 0x12 | Location data |
| GPS+LBS+Status | 0x16 | Location + status |
| String Info | 0x15 | String message |
| Alarm | 0x16 | Alarm packet |

## Debugging Tips

### Enable Debug Logs
Set in `.env`:
```env
LOG_LEVEL=debug
```

### Check CRC Details
The improved error logging now shows:
```json
{
  "expectedCrc": "0077",
  "calculatedCrc": "0077",
  "bufferHex": "78780d010000000003332210000100770d0a",
  "crcPosition": 16,
  "length": 13
}
```

### Manual CRC Verification

You can verify the CRC with this Python script:
```python
def calculate_crc16(data):
    crc = 0xFFFF
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = (crc << 1) ^ 0x1021
            else:
                crc = crc << 1
    return crc & 0xFFFF

# For your packet
packet = bytes.fromhex("78780d010000000003332210000100770d0a")
# CRC range: from length byte (index 2) to end of data (index 16)
data_for_crc = packet[2:16]
crc = calculate_crc16(data_for_crc)
print(f"Calculated CRC: 0x{crc:04X}")  # Should be 0x0077
```

## What Changed

### File: `src/modules/protocols/gt06/gt06.decoder.ts`

1. **Packet Length Calculation** (Lines 20-34, 39-53)
   - Fixed total length: `2 + 1 + length + 2 + 2`

2. **CRC Position** (Lines 68-75)
   - Fixed position: `2 + 1 + length`
   - CRC range: from position 2 to crcPosition

3. **ACK Generation** (Lines 284-318)
   - Fixed serial number extraction
   - Added proper info bytes
   - Correct CRC calculation for ACK

## Verification Checklist

- [ ] Device can connect to port 5023
- [ ] Login packet is accepted (no CRC error)
- [ ] Device receives ACK response
- [ ] Device starts sending location data
- [ ] No errors in server logs

## Next Steps

1. Restart the application: `npm run start:dev`
2. Connect your GT06 device
3. Check logs for successful login
4. Verify device is listed in: `curl http://localhost:5055/api/connections`

## Need Help?

If still having issues:
1. Share the full packet hex from logs
2. Check if IMEI exists in database
3. Verify device protocol configuration
4. Enable debug logging
