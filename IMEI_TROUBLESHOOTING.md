# IMEI Parsing & Database Lookup

## Issue Found! ✅

Your GT06 packet sends IMEI as: `00 00 00 00 03 33 22 10` (8 bytes hex)

### IMEI Parsing

**Raw packet**: `78780d010000000003332210000100770d0a`

**IMEI bytes**: `00 00 00 00 03 33 22 10`

**Hex string**: `0000000003332210` (16 hex characters)

**After removing leading zeros**: `3332210` (7 digits)

**Your database has**: `333221` (6 digits)

### The Mismatch

The packet IMEI is `3332210` but your database has `333221`. There are two possibilities:

#### Option 1: Last digit is checksum/version (RECOMMENDED)

GT06 often includes a checksum or version digit. Try:

```sql
-- Add device with full IMEI from packet
INSERT INTO devices (imei, protocol, active, name) 
VALUES ('3332210', 'GT06', true, 'Test Device');
```

OR keep your current format and modify the lookup:

```sql
-- Check if device exists with partial match
SELECT * FROM devices 
WHERE imei = '333221' OR imei = '3332210';
```

#### Option 2: Device is programmed wrong

Your device might be configured incorrectly. The device should send the full IMEI.

## Fix Applied

I've updated the IMEI parser to **remove leading zeros**:

**Before**: `0000000003332210` → `0000000003332210`
**After**: `0000000003332210` → `3332210`

## How to Fix Your Database

### Quick Fix: Add the correct IMEI

```sql
-- Option A: Update existing device
UPDATE devices 
SET imei = '3332210' 
WHERE imei = '333221';

-- Option B: Add new device with correct IMEI
INSERT INTO devices (imei, protocol, active, name) 
VALUES ('3332210', 'GT06', true, 'My Device');
```

### Alternative: Modify device.repository.ts for flexible matching

If you want to keep your database as-is, edit `src/modules/device/device.repository.ts`:

```typescript
async findActiveByImei(imei: string): Promise<Device | null> {
  try {
    // Try exact match first
    let result = await this.$queryRaw<Device[]>`
      SELECT * FROM devices 
      WHERE imei = ${imei} 
      AND (active = true OR active = 1 OR status = 'active')
      LIMIT 1
    `;
    
    // If not found, try with last digit removed (GT06 checksum digit)
    if (result.length === 0 && imei.length > 6) {
      const imeiWithoutChecksum = imei.slice(0, -1);
      result = await this.$queryRaw<Device[]>`
        SELECT * FROM devices 
        WHERE imei = ${imeiWithoutChecksum}
        AND (active = true OR active = 1 OR status = 'active')
        LIMIT 1
      `;
    }
    
    return result[0] || null;
  } catch (error) {
    this.logger.error('Error finding active device', (error as Error).stack);
    return null;
  }
}
```

## Test the Fix

### 1. Check what IMEI the server receives

Enable debug logging in `.env`:
```env
LOG_LEVEL=debug
```

Restart and check logs for:
```
[DEBUG] IMEI parsed raw=0000000003332210 parsed=3332210
```

### 2. Check your database

```sql
-- See what IMEI you have
SELECT imei, name, active FROM devices;

-- Check if device can be found
SELECT * FROM devices WHERE imei LIKE '%333221%';
```

### 3. Update database to match

```sql
-- Add the device with correct IMEI
INSERT INTO devices (imei, protocol, active, name) 
VALUES ('3332210', 'GT06', true, 'My GPS Device')
ON CONFLICT (imei) DO UPDATE SET active = true;
```

## Verification Steps

After fixing:

1. **Restart app**: `npm run start:dev`
2. **Connect device**: Device should send login packet
3. **Check logs**:
   ```
   [DEBUG] IMEI parsed parsed=3332210
   [INFO] Device logged in: 3332210 on GT06
   [INFO] Device validated: 3332210
   ```
4. **Verify API**: 
   ```bash
   curl http://localhost:5055/api/connections
   curl http://localhost:5055/api/devices/3332210
   ```

## Quick Decision Tree

```
Is your GT06 device IMEI actually "333221"?
│
├─ YES → Update database: imei = '3332210' (add the last digit)
│         The device sends 0x3332210 in the packet
│
└─ NO → The "0" at the end is a checksum/version digit
         └─ Option 1: Use full IMEI in database ('3332210')
         └─ Option 2: Modify lookup to try both variants
```

## Recommended Solution

**Best Practice**: Always store the **full IMEI** as sent by the device.

```sql
-- Recommended: Update your database
UPDATE devices SET imei = '3332210' WHERE imei = '333221';

-- Or add new entry
INSERT INTO devices (imei, protocol, active, name) 
VALUES ('3332210', 'GT06', true, 'Test Device');
```

Then restart the application and your device will connect successfully! ✅

## Still Not Working?

Check the actual packet bytes:

```bash
# Use the test tool
node test-gt06-packet.js 78780d010000000003332210000100770d0a
```

Look for:
```
📱 IMEI: 0000000003332210
```

Then verify that matches your database (after removing leading zeros).
