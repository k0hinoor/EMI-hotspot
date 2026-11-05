/*
 * EMI Hotspot Mapper — reference detector firmware
 * --------------------------------------------------
 * Target: any USB-serial Arduino-class board (Uno/Nano/ESP32/Teensy).
 * Purpose: stream the detector's rectified, amplified near-field signal to the
 *          dashboard as line-oriented JSON frames, matching protocol v1.
 *
 * Wire the detector output (after the rectifier + amplifier) to A0.
 * Set PROBE_TYPE to match the probe physically fitted to the connector, or
 * select it at runtime with the #PROBE command.
 *
 * This sketch performs NO calibration claims: it reports raw ADC counts plus a
 * moving average. Treat every number as relative.
 */

#include <Arduino.h>

// ------------------------------------------------------------------ config
const char *DEVICE_ID = "EMI-001";
const char *FIRMWARE_VERSION = "1.0.0";
const int PROTOCOL_VERSION = 1;

#define ADC_PIN A0
static const uint16_t ADC_MAX = 1023;      // 10-bit boards; use 4095 on 12-bit
static const uint16_t SATURATION = 1015;   // near full scale = saturated
static const uint16_t SAMPLE_RATE_HZ = 20;
static const uint16_t AVG_WINDOW = 32;

// E_FIELD or H_FIELD — must match the probe attached to the detector input.
const char *PROBE_TYPE = "E_FIELD";

static bool streaming = true;
static uint32_t seq = 0;
static unsigned long lastSample = 0;

static float ring[AVG_WINDOW];
static uint16_t ringCount = 0;
static uint8_t ringHead = 0;

// ------------------------------------------------------------------ helpers
static void emit(const char *type, const String &payload) {
  Serial.print('#');
  Serial.print(type);
  Serial.print(' ');
  Serial.println(payload);
}

static void hello() {
  String p = "{\"device_id\":\"";
  p += DEVICE_ID;
  p += "\",\"firmware_version\":\"";
  p += FIRMWARE_VERSION;
  p += "\",\"protocol_version\":";
  p += PROTOCOL_VERSION;
  p += ",\"probe_type\":\"";
  p += PROBE_TYPE;
  p += "\",\"sample_rate_hz\":";
  p += SAMPLE_RATE_HZ;
  p += "}";
  emit("HELLO", p);
}

static void probeFrame() {
  String p = "{\"probe_type\":\"";
  p += PROBE_TYPE;
  p += "\"}";
  emit("PROBE", p);
}

/* Averages the last AVG_WINDOW samples; returns the count actually used. */
static uint16_t windowAverage(float *out) {
  if (ringCount == 0) {
    *out = 0;
    return 0;
  }
  float sum = 0;
  for (uint16_t i = 0; i < ringCount; i++) sum += ring[i];
  *out = sum / ringCount;
  return ringCount;
}

/* Peak-to-peak spread of the window as a percentage of the mean. */
static float windowSpread(uint16_t count) {
  if (count < 2) return 0;
  float minV = ring[0], maxV = ring[0];
  for (uint16_t i = 1; i < count; i++) {
    if (ring[i] < minV) minV = ring[i];
    if (ring[i] > maxV) maxV = ring[i];
  }
  float mean = 0;
  for (uint16_t i = 0; i < count; i++) mean += ring[i];
  mean /= count;
  if (mean <= 0) return 0;
  return ((maxV - minV) / mean) * 100.0f;
}

static void acquire() {
  int raw = analogRead(ADC_PIN);
  if (raw < 0) raw = 0;

  ring[ringHead] = (float)raw;
  ringHead = (uint8_t)((ringHead + 1) % AVG_WINDOW);
  if (ringCount < AVG_WINDOW) ringCount++;

  float avg = 0;
  uint16_t used = windowAverage(&avg);
  float spread = windowSpread(used);

  const char *status = "VALID";
  if (raw >= SATURATION) {
    status = "SATURATED";
  } else if (used >= 10 && spread > 12.0f) {
    status = "UNSTABLE";
  }

  String p = "{\"seq\":";
  p += seq++;
  p += ",\"signal_raw\":";
  p += raw;
  p += ",\"signal_filtered\":";
  p += (long)(avg + 0.5f);
  p += ",\"sample_count\":";
  p += used;
  p += ",\"status\":\"";
  p += status;
  p += "\",\"probe_type\":\"";
  p += PROBE_TYPE;
  p += "\"}";
  emit("DATA", p);
}

/* Minimal command handling — one command per line, from the dashboard. */
static void handleCommand(String line) {
  line.trim();
  if (line.length() == 0) return;
  String cmd = line;
  cmd.toUpperCase();

  if (cmd.startsWith("#IDENTIFY") || cmd.startsWith("IDENTIFY")) {
    hello();
    probeFrame();
    ringCount = 0;
    ringHead = 0;
  } else if (cmd.startsWith("#START") || cmd.startsWith("START")) {
    streaming = true;
  } else if (cmd.startsWith("#PAUSE") || cmd.startsWith("#STOP") || cmd.startsWith("PAUSE") ||
             cmd.startsWith("STOP")) {
    streaming = false;
  } else if (cmd.startsWith("#PROBE")) {
    if (cmd.indexOf("E_FIELD") >= 0) PROBE_TYPE = "E_FIELD";
    if (cmd.indexOf("H_FIELD") >= 0) PROBE_TYPE = "H_FIELD";
    probeFrame();
  } else if (cmd.startsWith("#PING") || cmd.startsWith("PING")) {
    emit("PING", "{}");
  } else if (cmd.startsWith("#ZERO") || cmd.startsWith("ZERO")) {
    ringCount = 0;
    ringHead = 0;
    emit("INFO", "{\"note\":\"window reset\"}");
  } else {
    emit("ERR", "{\"code\":\"UNKNOWN_COMMAND\",\"message\":\"Unrecognised command\"}");
  }
}

void setup() {
  Serial.begin(115200);
  analogReference(DEFAULT);
  delay(250);
  hello();
  probeFrame();
}

void loop() {
  if (Serial.available()) {
    handleCommand(Serial.readStringUntil('\n'));
  }

  unsigned long now = millis();
  const unsigned long period = 1000UL / SAMPLE_RATE_HZ;
  if (now - lastSample >= period) {
    lastSample = now;
    if (streaming) acquire();
  }
}
